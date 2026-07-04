import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { BrandService, Brand } from '../../services/brand.service';
import { LionIconComponent } from '../../shared/lion-icon/lion-icon.component';
import { RegistroGestionComponent } from '../registro-gestion/registro-gestion.component';

/**
 * Vista enfocada para el rol "vendedor": header mínimo (marca + usuario + salir)
 * y el formulario de registro a pantalla completa. Sin sidebar ni dashboard.
 * Pensada mobile-first.
 */
@Component({
  selector: 'app-vendedor-shell',
  standalone: true,
  imports: [CommonModule, MatIconModule, LionIconComponent, RegistroGestionComponent],
  templateUrl: './vendedor-shell.component.html',
  styleUrls: ['./vendedor-shell.component.css'],
})
export class VendedorShellComponent {
  auth = inject(AuthService);
  private brandSvc = inject(BrandService);

  get usuario() { return this.auth.getUsuario(); }
  get brand(): Brand { return this.brandSvc.fromSede(this.auth.getUsuario()?.sede); }

  logout() { this.auth.logout(); }
}
