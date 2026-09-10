import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface RegisterRequest {
  name: string;
  email: string;
   emailConsent: boolean;
}
export interface PreferenceRequest {
  fullName:string;
  firstName: string;
  lastName:string;
  email: string;
   emailConsent: boolean;
}

export interface LoginRequest {
  email: string;
}

export interface AuthResponse {
  userId: string;
password?: string;
  name: string;
  email: string;
  sessionToken?: string;
  expiresAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly SESSION_TOKEN_KEY = 'dsci.sessionToken';
  private readonly EXPIRES_AT_KEY = 'dsci.expiresAt';
  private currentUserSubject = new BehaviorSubject<AuthResponse | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  register(data: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/register`, data);
  }
  preferenceUpdate(data: PreferenceRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/preference-update`, data);
  }

  login(data: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/login`, data).pipe(
      tap(response => {
        if (response.sessionToken) {
          this.setSession(response.sessionToken, response.expiresAt || '');
          this.currentUserSubject.next(response);
        }
      })
    );
  }

  me(): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(`${environment.apiBaseUrl}/me`).pipe(
      tap(response => {
        this.currentUserSubject.next(response);
      })
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/logout`, {}).pipe(
      tap(() => {
        this.clearSession();
        this.currentUserSubject.next(null);
      })
    );
  }

  getToken(): string | null {
    // Return dataPrincipalToken as the primary token for authentication
    return sessionStorage.getItem('dataPrincipalToken');
  }

  isLoggedIn(): boolean {
    // Check if both email and dataPrincipalToken are present
    const email = sessionStorage.getItem('email');
    const token = sessionStorage.getItem('dataPrincipalToken');
    return !!(email && token);
  }

  private setSession(token: string, expiresAt: string): void {
    sessionStorage.setItem(this.SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(this.EXPIRES_AT_KEY, expiresAt);
  }

  private clearSession(): void {
    // Clear all session storage keys
    sessionStorage.removeItem('name');
    sessionStorage.removeItem('email');
    sessionStorage.removeItem('dppsUserToken');
    sessionStorage.removeItem('cpmAccessToken');
    sessionStorage.removeItem('cpmRefreshToken');
    sessionStorage.removeItem('cpmExpiresInSeconds');
    sessionStorage.removeItem('dataPrincipalToken');
    // Also clear old keys for backward compatibility
    sessionStorage.removeItem(this.SESSION_TOKEN_KEY);
    sessionStorage.removeItem(this.EXPIRES_AT_KEY);
  }
}
