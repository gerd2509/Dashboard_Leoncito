import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './login/login.component';
import { VendedorShellComponent } from './features/vendedor-shell/vendedor-shell.component';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DashboardComponent, LoginComponent, VendedorShellComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  providers: [HttpClient]
})
export class AppComponent {
  title = 'gestion-contact-leoncito';

  constructor(public auth: AuthService) {}

  /** Rol vendedor → vista móvil enfocada (solo el formulario de registro). */
  get esVendedor(): boolean {
    return (this.auth.getUsuario()?.rol ?? '').toLowerCase() === 'vendedor';
  }
}
