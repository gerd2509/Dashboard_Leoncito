import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DashboardComponent } from './dashboard/dashboard.component';

@Component({
  selector: 'app-root',
  imports: [DashboardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  providers: [HttpClient]
})
export class AppComponent {
  title = 'gestion-contact-leoncito';
}
