import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { BrandService, Brand } from '../services/brand.service';
import { LionIconComponent } from '../shared/lion-icon/lion-icon.component';
import { nombreCorto } from '../shared/asesores';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, LionIconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit, OnDestroy {
  usuario = '';
  password = '';
  mostrarPassword = false;
  cargando = false;
  error = '';
  transicion = false;         // splash de bienvenida tras el login
  nombreBienvenida = '';

  // Forzar cambio de contraseña en el primer ingreso.
  forzarCambio = false;
  nuevaPass = '';
  nuevaPass2 = '';
  cambiandoPass = false;
  errorCambio = '';
  private datosSesion: any = null;   // datos del login, se guardan tras cambiar la clave

  // Marca mostrada en el panel izquierdo (cambia según el usuario que se escribe)
  brand: Brand;
  private usuario$ = new Subject<string>();

  particles = Array.from({ length: 35 }, () => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 110}%`,
    width: `${1 + Math.random() * 3}px`,
    height: `${1 + Math.random() * 3}px`,
    'animation-delay': `${Math.random() * 8}s`,
    'animation-duration': `${5 + Math.random() * 8}s`,
    opacity: `${0.15 + Math.random() * 0.6}`,
  }));

  constructor(private auth: AuthService, private brandSvc: BrandService) {
    this.brand = this.brandSvc.default;
  }

  ngOnInit(): void {
    // Detecta la marca según el usuario escrito (con debounce). Si el backend
    // aún no expone /auth/marca, hace fallback silencioso a la marca por defecto.
    this.usuario$
      .pipe(
        debounceTime(450),
        distinctUntilChanged(),
        switchMap(u => {
          const nombre = u.trim();
          if (!nombre) return of(null);
          return this.auth.getMarca(nombre).pipe(catchError(() => of(null)));
        })
      )
      .subscribe(res => {
        this.brand = res
          ? this.brandSvc.fromValor(res.marca ?? res.sede)
          : this.brandSvc.default;
      });
  }

  ngOnDestroy(): void {
    this.usuario$.complete();
  }

  /** Disparado en cada cambio del campo usuario. */
  onUsuarioChange(valor: string): void {
    this.usuario$.next(valor);
  }

  onLogin() {
    if (!this.usuario.trim() || !this.password.trim()) {
      this.error = 'Ingresa usuario y contraseña.';
      return;
    }
    this.cargando = true;
    this.error = '';

    this.auth.login(this.usuario.trim(), this.password.trim()).subscribe({
      next: (res: any) => {
        this.cargando = false;
        const datos = { nombre: res.nombre, rol: res.rol, sede: res.sede, sedes: res.sedes, vendedor: res.vendedor, canal: res.canal, modulos: res.modulos };
        // Primer ingreso con clave por defecto (DNI) → obliga a cambiarla antes de entrar.
        if (res.debeCambiarPassword) {
          this.datosSesion = datos;
          this.forzarCambio = true;
          return;
        }
        this.entrar(res.nombre, datos);
      },
      error: (err) => {
        this.cargando = false;
        this.error = err.status === 401
          ? 'Usuario o contraseña incorrectos.'
          : 'Error de conexión. Intenta de nuevo.';
      }
    });
  }

  /** Muestra el splash de bienvenida y guarda la sesión. */
  private entrar(nombre: string, datos: any): void {
    this.nombreBienvenida = nombreCorto(nombre || '') || nombre || '';
    this.transicion = true;
    setTimeout(() => this.auth.guardarSesion(datos), 2000);
  }

  /** Confirma la nueva contraseña (primer ingreso) y recién ahí entra. */
  confirmarCambio(): void {
    this.errorCambio = '';
    if ((this.nuevaPass || '').length < 4) { this.errorCambio = 'La contraseña debe tener al menos 4 caracteres.'; return; }
    if (this.nuevaPass !== this.nuevaPass2) { this.errorCambio = 'Las contraseñas no coinciden.'; return; }
    if (this.nuevaPass === this.password) { this.errorCambio = 'Elige una contraseña distinta a la actual.'; return; }
    this.cambiandoPass = true;
    this.auth.cambiarPassword(this.usuario.trim(), this.password.trim(), this.nuevaPass).subscribe({
      next: () => {
        this.cambiandoPass = false;
        this.forzarCambio = false;
        this.entrar(this.datosSesion?.nombre || '', this.datosSesion);
      },
      error: (err) => {
        this.cambiandoPass = false;
        this.errorCambio = err?.error?.message || 'No se pudo cambiar la contraseña.';
      },
    });
  }
}
