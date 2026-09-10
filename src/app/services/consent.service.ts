import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ConsentPermission {
  id: string;
  text: string;
  elementType: 'CHECKBOX' | 'RADIOBUTTON' | 'DROPDOWN';
  mandatory: boolean;
  options: string[];
  permissionTranslation: Array<{
    language: string;
    languageCode: string;
    text: string;
    options: string[];
  }>;
}

export interface ConsentFormData {
  id: string;
  name: string;
  consentFormId: string;
  permissions: ConsentPermission[];
  branding: {
    companyName: string;
    logo?: string;
  };
}

export interface ConsentSubmissionItem {
  dataPrincipalIdList: Array<{ key: string; value: string }>;
  permissionId: string;
  consentReceivedType: string;
  optedForIndexes: number[];
  consentLanguage: string;
}

export interface ConsentFormResponse {
  statusCode: number;
  statusMessage: string;
  response: ConsentFormData[];
}

export interface ConsentSubmissionResponse {
  statusCode: number;
  statusMessage: string;
  response: string;
}

export interface TenantTokenResponse {
  statusCode: number;
  statusMessage: string;
  response: {
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
  };
}

export interface UserTokenResponse {
  statusCode: number;
  statusMessage: string;
  response: {
    token: string;
    expiresInSeconds: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ConsentService {
  private readonly CONSENT_FORM_ID = '6592d926-66eb-4e1b-b454-be967a5e95b2';
  private readonly API_URL = 'https://seqrite.fyers.ad/cpm-api/open-api/v1/consent/v1';
  private readonly TENANT_AUTH_URL = 'https://seqrite.fyers.ad/cpm-api/open-api/v1/token';
  private readonly USER_TOKEN_URL = 'https://seqrite.fyers.ad/cpm-api/open-api/v1/generate-user-token';

  // Static tenant credentials used to obtain the CPM access token
  private readonly CLIENT_ID = '52f85d14-9d54-43d2-803b-4cfc1906fbe2';
  private readonly CLIENT_SECRET = '$2a$10$cVKYv6X4e2.s2bOHzQbil.GtLsfa/DsOF1qkVRUyMFQPLtdPfg9aa';
  private readonly API_KEY = '7abe8135dbc9488dbd8ac10af634a8fb';

  constructor(private http: HttpClient) {}

  generateAccessToken(): Observable<TenantTokenResponse> {
    return this.http.post<TenantTokenResponse>(this.TENANT_AUTH_URL, {
      clientId: this.CLIENT_ID,
      clientSecret: this.CLIENT_SECRET,
      apiKey: this.API_KEY
    });
  }

  generateUserToken(accessToken: string, email: string): Observable<UserTokenResponse> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.post<UserTokenResponse>(
      this.USER_TOKEN_URL,
      [{ key: 'email', value: email }],
      { headers }
    );
  }

  getConsentForm(accessToken: string): Observable<ConsentFormResponse> {
    const headers = new HttpHeaders({ 'Authorization-SDP': `Bearer ${accessToken}` });
    return this.http.post<ConsentFormResponse>(
      `${this.API_URL}/getConsentFormById`,
      { consentFormId: this.CONSENT_FORM_ID },
      { headers }
    );
  }

  submitConsent(consentData: ConsentSubmissionItem[], accessToken: string): Observable<ConsentSubmissionResponse> {
    const headers = new HttpHeaders({ 'Authorization-SDP': `Bearer ${accessToken}` });
    return this.http.post<ConsentSubmissionResponse>(
      `${this.API_URL}/createOrUpdateConsent`,
      { createConsentRequestDtoWrapper: consentData },
      { headers }
    );
  }
}
