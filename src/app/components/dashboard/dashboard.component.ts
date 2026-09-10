import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, AuthResponse } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  currentUser: AuthResponse | null = null;
  isLoading: boolean = true;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Read user data from sessionStorage and check for required keys
    const name = sessionStorage.getItem('name');
    const email = sessionStorage.getItem('email');
    const dataPrincipalToken = sessionStorage.getItem('dataPrincipalToken');

    // Verify sufficient keys are present (email and dataPrincipalToken are required)
    if (!email || !dataPrincipalToken) {
      // No valid session, redirect to login
      this.router.navigate(['/login']);
      return;
    }

    // Create user object from session data
    this.currentUser = {
      userId: email, // Use email as userId since we don't have a separate userId
      name: name || '',
      email: email
    };
    this.isLoading = false;
  }

  onLogout(): void {
    // Clear all session storage and redirect to login
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }
}
