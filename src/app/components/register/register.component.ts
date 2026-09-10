import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService, RegisterRequest } from 'src/app/services/auth.service';
import { ConsentService } from 'src/app/services/consent.service';

declare var window: any;

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit, AfterViewInit, OnDestroy {
  registerForm!: FormGroup;
  errorMessage: string = '';
  isLoading: boolean = false;
  registrationSuccess: boolean = false;
  private cpmAccessToken: string = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
    private consentService: ConsentService
  ) { }

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]]
    });

    // Expose function to get email for consent script
    window.getRegistrationEmail = () => {
      return this.registerForm?.get('email')?.value || '';
    };
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initializeConsentWidget();
    }, 100);
  }

  ngOnDestroy(): void {
    // Cleanup global functions
    if (window.getRegistrationEmail) {
      delete window.getRegistrationEmail;
    }
  }

  get name() {
    return this.registerForm.get('name');
  }

  get email() {
    return this.registerForm.get('email');
  }

  private initializeConsentWidget(): void {
    console.log('Initializing consent widget...');

    this.consentService.generateAccessToken().subscribe({
      next: (tokenResponse) => {
        this.cpmAccessToken = tokenResponse.response.accessToken;

        // Configure the consent widget
        window.consentWidgetConfig = {
          consentFormId: "6592d926-66eb-4e1b-b454-be967a5e95b2",
          apiUrl: "https://seqrite.fyers.ad/cpm-api/open-api/v1/consent/v1/getConsentFormById",
          submitApiUrl: "https://seqrite.fyers.ad/cpm-api/open-api/v1/consent/v1/createOrUpdateConsent",
          tenantToken: `Bearer ${this.cpmAccessToken}`,
          signatureServiceUrl: "https://seqrite.fyers.ad/cpm-sign",
          customAttributes: {},
          receivedType: "WEB",
          showButtons: false,
          showLanguageDropdown: true,
          enableCheckboxes: true,
          enableRadioButtons: true,
          enableDropdowns: true
        };

        // Load the consent script
        this.loadConsentScript();
      },
      error: (error) => {
        console.error('Failed to generate access token for consent widget:', error);
        const root = document.getElementById('consent-root');
        if (root) {
          root.innerText = 'Failed to load consent form. Please refresh the page.';
        }
      }
    });
  }

  private loadConsentScript(): void {
    // Remove any existing script
    const existingScripts = document.querySelectorAll('script[src="assets/consent-script.js"]');
    existingScripts.forEach(script => script.remove());

    // Create and load new script
    const script = document.createElement('script');
    script.src = 'assets/consent-script.js';
    script.async = false;

    script.onload = () => {
      console.log('Consent script loaded successfully');
    };

    script.onerror = () => {
      console.error('Failed to load consent script');
      const root = document.getElementById('consent-root');
      if (root) {
        root.innerText = 'Failed to load consent form. Please refresh the page.';
      }
    };

    document.body.appendChild(script);
  }

  private hasSelectedConsent(): boolean {
    // Use the global function from consent script if available
    if (window.hasSelectedConsent) {
      return window.hasSelectedConsent();
    }
    return false;
  }

  private resolveEmailConsentFromDOM(): boolean {
    const consentRoot = document.getElementById('consent-root');
    if (!consentRoot) {
      return false;
    }

    const selectedTexts: string[] = [];

    const checkedInputs = consentRoot.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked');
    checkedInputs.forEach((input) => {
      const label = input.closest('label')?.textContent?.trim();
      if (label) {
        selectedTexts.push(label.toLowerCase());
      }
    });

    const selects = consentRoot.querySelectorAll('select');
    selects.forEach((select: any) => {
      if (select.selectedIndex > 0) {
        const selectedText = select.options[select.selectedIndex]?.textContent?.trim();
        if (selectedText) {
          selectedTexts.push(selectedText.toLowerCase());
        }
      }
    });

    if (selectedTexts.some((text) => text.includes('do not agree'))) {
      return true;
    }

    if (selectedTexts.some((text) => text.includes('agree'))) {
      return false;
    }

    return false;
  }

  onSubmit(): void {
    let consentData: any = null;
    if (window.captureConsentData) {
      consentData = window.captureConsentData();
    }
    const emailConsent = this.resolveEmailConsentFromDOM();
    sessionStorage.setItem('emailConsent', String(emailConsent));

    const registrationData = {
      name: this.registerForm.value.name,
      email: this.registerForm.value.email,
      emailConsent,
    };

    this.http.post('https://seqrite.fyers.ad/cpm-api/dsci/register', registrationData)
      .subscribe({
        next: (response: any) => {
          if (response.createUserStatusCode === 200) {
            if (consentData && consentData.createConsentRequestList.length > 0) {
              this.submitConsent(consentData);
            } else {
              this.handleSuccessfulRegistration();
            }
          } else {
            this.isLoading = false;
            this.errorMessage = response.createUserStatusMessage || 'Registration failed.';
          }
        },
        error: (error) => {
          console.error('Registration error:', error);
          this.isLoading = false;
          this.errorMessage = error.error?.message || 'Registration failed. Please try again.';
        }
      });
  }
  private submitConsent(consentData: any): void {
    const currentEmail = this.registerForm.value.email;
    const updatedConsentData = consentData.createConsentRequestList.map((consent: any) => ({
      ...consent,
      dataPrincipalIdList: [{ key: "email", value: currentEmail }]
    }));

    const headers = { 'Authorization-SDP': `Bearer ${this.cpmAccessToken}` };
    const signingExtras$ = window.getConsentSigningExtras
      ? window.getConsentSigningExtras(updatedConsentData)
      : Promise.resolve({ bss: null, sss: null, jwt: null });

    signingExtras$.then((signingExtras: any) => {
      const body = { createConsentRequestDtoWrapper: updatedConsentData, ...signingExtras };

      this.http.post('https://seqrite.fyers.ad/cpm-api/open-api/v1/consent/v1/createOrUpdateConsent',
        body,
        { headers }
      )
        .subscribe({
          next: (consentResponse: any) => {
            console.log('Consent submission successful:', consentResponse);
            this.handleSuccessfulRegistration();
          },
          error: (error) => {
            console.error('Consent submission error:', error);
            this.handleSuccessfulRegistration();
          }
        });
    });
  }

  private handleSuccessfulRegistration(): void {
    this.isLoading = false;
    this.registrationSuccess = true;
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 2000);
  }
}
