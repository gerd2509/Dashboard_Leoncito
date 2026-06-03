import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  usuario = '';
  password = '';
  mostrarPassword = false;
  cargando = false;
  error = '';

  particles = Array.from({ length: 35 }, () => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 110}%`,
    width: `${1 + Math.random() * 3}px`,
    height: `${1 + Math.random() * 3}px`,
    'animation-delay': `${Math.random() * 8}s`,
    'animation-duration': `${5 + Math.random() * 8}s`,
    opacity: `${0.15 + Math.random() * 0.6}`,
  }));

  constructor(private auth: AuthService) {}

  onLogin() {
    if (!this.usuario.trim() || !this.password.trim()) {
      this.error = 'Ingresa usuario y contraseña.';
      return;
    }
    this.cargando = true;
    this.error = '';

    this.auth.login(this.usuario.trim(), this.password.trim()).subscribe({
      next: (res: any) => {
        this.auth.guardarSesion({ nombre: res.nombre, rol: res.rol, sede: res.sede });
        this.cargando = false;
      },
      error: (err) => {
        this.cargando = false;
        this.error = err.status === 401
          ? 'Usuario o contraseña incorrectos.'
          : 'Error de conexión. Intenta de nuevo.';
      }
    });
  }
}
