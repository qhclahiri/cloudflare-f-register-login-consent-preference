import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.css']
})
export class AboutComponent implements OnInit {
  sessionData: {[key: string]: string} = {};

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Read all session storage values
    this.sessionData = {
      'Name': sessionStorage.getItem('name') || '',
      'Email': sessionStorage.getItem('email') || '',
      'DPPS User Token': sessionStorage.getItem('dppsUserToken') || '',
      'CPM Access Token': sessionStorage.getItem('cpmAccessToken') || '',
      'CPM Refresh Token': sessionStorage.getItem('cpmRefreshToken') || '',
      'CPM Expires In Seconds': sessionStorage.getItem('cpmExpiresInSeconds') || '',
      'Data Principal Token': sessionStorage.getItem('dataPrincipalToken') || ''
    };

    // Check if user is logged in
    if (!sessionStorage.getItem('email') || !sessionStorage.getItem('dataPrincipalToken')) {
      this.router.navigate(['/login']);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  onLogout(): void {
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }
}
