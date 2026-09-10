import { Component, OnInit, Input } from '@angular/core';
import { ConsentService, ConsentFormData, ConsentPermission, ConsentSubmissionItem } from '../../services/consent.service';

@Component({
  selector: 'app-consent-form',
  templateUrl: './consent-form.component.html',
  styleUrls: ['./consent-form.component.css']
})
export class ConsentFormComponent implements OnInit {
  @Input() userEmail: string = '';

  formData: ConsentFormData | null = null;
  permissions: ConsentPermission[] = [];
  isLoading: boolean = true;
  errorMessage: string = '';

  selectedValues: Map<string, Set<number>> = new Map();

  constructor(private consentService: ConsentService) {}

  ngOnInit(): void {
    this.loadConsentForm();
  }

  loadConsentForm(): void {
    this.isLoading = true;
    this.consentService.generateAccessToken().subscribe({
      next: (tokenResponse) => {
        const accessToken = tokenResponse.response.accessToken;
        this.consentService.getConsentForm(accessToken).subscribe({
          next: (response) => {
            if (response.response && response.response.length > 0) {
              this.formData = response.response[0];
              this.permissions = this.formData.permissions || [];
            }
            this.isLoading = false;
          },
          error: () => {
            this.errorMessage = 'Failed to load consent form';
            this.isLoading = false;
          }
        });
      },
      error: () => {
        this.errorMessage = 'Failed to load consent form';
        this.isLoading = false;
      }
    });
  }

  onCheckboxChange(permissionId: string, optionIndex: number, event: any): void {
    if (!this.selectedValues.has(permissionId)) {
      this.selectedValues.set(permissionId, new Set());
    }

    if (event.target.checked) {
      this.selectedValues.get(permissionId)!.add(optionIndex);
    } else {
      this.selectedValues.get(permissionId)!.delete(optionIndex);
    }
  }

  onRadioChange(permissionId: string, optionIndex: number): void {
    this.selectedValues.set(permissionId, new Set([optionIndex]));
  }

  onDropdownChange(permissionId: string, event: any): void {
    const value = event.target.value;
    if (value === '') {
      this.selectedValues.delete(permissionId);
      return;
    }

    this.selectedValues.set(permissionId, new Set([parseInt(value, 10)]));
  }

  isValid(): boolean {
    return this.selectedValues.size > 0 &&
           Array.from(this.selectedValues.values()).some(set => set.size > 0);
  }

  getConsentData(): ConsentSubmissionItem[] {
    const result: ConsentSubmissionItem[] = [];

    this.permissions.forEach(permission => {
      const selected = this.selectedValues.get(permission.id) || new Set();

      result.push({
        dataPrincipalIdList: [{ key: 'email', value: this.userEmail }],
        permissionId: permission.id,
        consentReceivedType: 'FORMS',
        optedForIndexes: Array.from(selected),
        consentLanguage: 'english'
      });
    });

    return result;
  }

  stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }
}
