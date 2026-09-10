import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  errorMessage: string = '';
  isLoading: boolean = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private router: Router
  ) { }

  ngOnInit(): void {
    // Check if user is already logged in
    const email = sessionStorage.getItem('email');
    const dataPrincipalToken = sessionStorage.getItem('dataPrincipalToken');

    if (email && dataPrincipalToken) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  get email() {
    return this.loginForm.get('email');
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const loginData = {
      email: this.loginForm.value.email
    };

    this.http.post('https://seqrite.fyers.ad/cpm-api/dsci/login', loginData)
      .subscribe({
        next: (response: any) => {
          const fullName = response.name || '';
          const [firstName = '', lastName = ''] = fullName.split(' ');
          // Store all tokens and user info in sessionStorage
          sessionStorage.setItem('name', fullName);
          sessionStorage.setItem('firstName', firstName);
          sessionStorage.setItem('lastName', lastName);
          sessionStorage.setItem('email', response.email || '');
          sessionStorage.setItem('dppsUserToken', response.dppsUserToken || '');
          sessionStorage.setItem('cpmAccessToken', response.cpmAccessToken || '');
          sessionStorage.setItem('cpmRefreshToken', response.cpmRefreshToken || '');
          sessionStorage.setItem('cpmExpiresInSeconds', response.cpmExpiresInSeconds || '');
          sessionStorage.setItem('dataPrincipalToken', response.dataPrincipalToken || '');

          this.isLoading = false;

          // Navigate to dashboard on successful login
          this.router.navigate(['/dashboard']);
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error.error?.message || 'Login failed. Please check your email.';
        }
      });
  }
}
