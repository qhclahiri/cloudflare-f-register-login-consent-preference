import { Component, OnInit, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, PreferenceRequest, RegisterRequest } from 'src/app/services/auth.service';
import { ConsentService } from 'src/app/services/consent.service';

declare var window: any;

@Component({
  selector: 'app-preference-center',
  templateUrl: './preference-center.component.html',
  styleUrls: ['./preference-center.component.css', '../../../assets/preference-styles.css']
})
export class PreferenceCenterComponent implements OnInit, AfterViewInit {

  constructor(private router: Router, private authService: AuthService, private consentService: ConsentService) {}

  ngOnInit(): void {
    window.preferenceUpdateFromConsent = (data: PreferenceRequest) => {
      this.authService.preferenceUpdate(data).subscribe({
        next: (response) => {
          console.log('Preference updated from consent:', response);
        },
        error: (error) => {
          console.error('Preference update error:', error);
        }
      });
    };
    // Check if user is logged in
    const email = sessionStorage.getItem('email');
    const dataPrincipalToken = sessionStorage.getItem('dataPrincipalToken');

    if (!email || !dataPrincipalToken) {
      this.router.navigate(['/login']);
    }
  }

  ngAfterViewInit(): void {
    this.initPreferenceCenter();
  }

  private initPreferenceCenter(): void {
    const email = sessionStorage.getItem('email') || '';

    this.consentService.generateAccessToken().subscribe({
      next: (tokenResponse) => {
        const accessToken = tokenResponse.response.accessToken;
        this.consentService.generateUserToken(accessToken, email).subscribe({
          next: (userTokenResponse) => {
            const userToken = userTokenResponse.response.token;
            this.configureAndLoadWidget(email, userToken);
          },
          error: (error) => {
            console.error('Failed to generate user token:', error);
          }
        });
      },
      error: (error) => {
        console.error('Failed to generate access token:', error);
      }
    });
  }

  private configureAndLoadWidget(email: string, userToken: string): void {
    // Set up preference center widget configuration
    window.consentWidgetConfig = {
      preferenceFormId: "ec234cfe-95e0-4965-8d71-498aec2ca1c3",
      preferenceDetailsApiUrl: "https://seqrite.fyers.ad/cpm-api/open-api/v1/preference/v1/export/getPreferenceDetails",
      preferenceHistoryApiUrl: "https://seqrite.fyers.ad/cpm-api/open-api/v1/preference/v1/export/auditSearch/scroll",
      submitApiUrl: "https://seqrite.fyers.ad/cpm-api/open-api/v1/preference/v1/createOrUpdateConsent",
      signatureServiceUrl: "https://seqrite.fyers.ad/cpm-sign",
      customAttributes: {},
      receivedType: "WEB",
      userToken: `Bearer ${userToken}`,
      dataPrincipalId: {
        key: "email",
        value: email
      },
      showButtons: true,
      showLanguageDropdown: true,
     enableCheckboxes: true,
      enableRadioButtons: true,
      enableDropdowns: true,
      footerAlignment: "left"
    };

    // Load the preference center script from assets
    this.loadPreferenceScript();
  }

  private loadPreferenceScript(): void {
    const script = document.createElement('script');
    script.src = 'assets/preference-script.js';
    script.async = false;
    document.body.appendChild(script);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  onLogout(): void {
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }
}

