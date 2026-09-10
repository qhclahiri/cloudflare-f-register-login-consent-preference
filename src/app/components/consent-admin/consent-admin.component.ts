import { Component, OnInit } from '@angular/core';
import { ConsentService } from '../../services/consent.service';

@Component({
  selector: 'app-consent-admin',
  templateUrl: './consent-admin.component.html',
  styleUrls: ['./consent-admin.component.css']
})
export class ConsentAdminComponent implements OnInit {
  currentFormId: string = '45fc7e93-94aa-4a8c-b047-4ec37b5ba4a0';
  newFormId: string = '';
  previewData: any = null;
  isLoading: boolean = false;
  successMessage: string = '';
  errorMessage: string = '';

  constructor(private consentService: ConsentService) {}

  ngOnInit(): void {
    this.newFormId = this.currentFormId;
    this.loadPreview();
  }

  loadPreview(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.consentService.generateAccessToken().subscribe({
      next: (tokenResponse) => {
        const accessToken = tokenResponse.response.accessToken;
        this.consentService.getConsentForm(accessToken).subscribe({
          next: (response) => {
            if (response.response && response.response.length > 0) {
              this.previewData = response.response[0];
            }
            this.isLoading = false;
          },
          error: () => {
            this.errorMessage = 'Failed to load consent form preview';
            this.isLoading = false;
          }
        });
      },
      error: () => {
        this.errorMessage = 'Failed to load consent form preview';
        this.isLoading = false;
      }
    });
  }

  updateFormId(): void {
    if (!this.newFormId.trim()) {
      this.errorMessage = 'Please enter a valid Form ID';
      return;
    }

    this.successMessage = 'Form ID updated successfully! Please update the ConsentService and restart the application.';
    this.currentFormId = this.newFormId;

    setTimeout(() => {
      this.successMessage = '';
    }, 5000);
  }

  refreshPreview(): void {
    this.loadPreview();
  }
}
