import { Component } from '@angular/core';
import { GestionContactXHoraComponent } from "./features/Gestion/gestion-contact-x-hora/gestion-contact-x-hora.component";
import { HttpClient } from '@angular/common/http';
import { DerivacionesComponent } from "./features/derivaciones/derivaciones.component";
import { AgendamientosComponent } from "./features/agendamientos/agendamientos.component";
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
