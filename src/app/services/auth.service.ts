import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Usuario {
  nombre: string;
  rol: 'admin' | 'gerente' | 'supervisor' | string;
  sede: string;
  sedes?: string[];    // sedes asignadas (varias). Si no hay, se asume [sede].
  vendedor?: string;   // rol vendedor: su nombre exacto (para "Mi Panel")
  canal?: string;      // rol vendedor: 'sede' | 'call' | 'realzza'
  vehiculo?: string;   // rol chofer: carro asignado (AZUL/VERDE/NARANJA)
  modulos?: string[] | null;   // permisos POR USUARIO; null = usa default por rol-perfil
}

// Cierre de sesión automático por inactividad: en una compu compartida (tienda,
// recepción), si alguien se olvida de cerrar sesión, la sesión no debe quedar
// abierta indefinidamente — sessionStorage ya se borra sola al cerrar la pestaña,
// pero mientras la pestaña siga abierta y sin uso, esto la cierra solo.
const INACTIVIDAD_LIMITE_MS = 30 * 60 * 1000; // 30 min sin interacción

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = environment.apiBase;
  private readonly SESSION_KEY = 'gd_usuario';
  private ultimaActividad = Date.now();
  private monitorIniciado = false;

  constructor(private http: HttpClient) {
    // Si la pestaña se refresca (F5) con sesión ya guardada, el monitor debe
    // arrancar igual — no solo en el momento del login.
    if (this.isLoggedIn()) this.iniciarMonitorInactividad();
  }

  /** Arranca el monitor de inactividad (una sola vez). Se llama al loguear. */
  private iniciarMonitorInactividad(): void {
    if (this.monitorIniciado || typeof document === 'undefined') return;
    this.monitorIniciado = true;
    const marcarActividad = () => { this.ultimaActividad = Date.now(); };
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(ev =>
      document.addEventListener(ev, marcarActividad, { passive: true }));
    setInterval(() => {
      if (this.isLoggedIn() && Date.now() - this.ultimaActividad > INACTIVIDAD_LIMITE_MS) {
        this.logout();
      }
    }, 60 * 1000); // chequea cada minuto, no hace falta más fino
  }

  login(usuario: string, password: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/login`, { usuario, password });
  }

  /** Cambia la contraseña del propio usuario (valida la actual). Forzado en el 1er login. */
  cambiarPassword(usuario: string, actual: string, nueva: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/cambiar-password`, { usuario, actual, nueva });
  }

  /**
   * Consulta la marca/sede de un usuario por su nombre de usuario (sin contraseña),
   * para personalizar el branding del login mientras se escribe.
   * Endpoint esperado en el backend: GET /auth/marca?usuario=... → { sede?, marca? }
   */
  getMarca(usuario: string): Observable<{ sede?: string; marca?: string; rol?: string; modulos?: string[] }> {
    return this.http.get<{ sede?: string; marca?: string; rol?: string; modulos?: string[] }>(
      `${this.baseUrl}/auth/marca`, { params: { usuario } }
    );
  }

  guardarSesion(usuario: Usuario): void {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(usuario));
    this.ultimaActividad = Date.now();
    this.iniciarMonitorInactividad();
  }

  getUsuario(): Usuario | null {
    const data = sessionStorage.getItem(this.SESSION_KEY);
    return data ? JSON.parse(data) : null;
  }

  isLoggedIn(): boolean {
    return !!this.getUsuario();
  }

  logout(): void {
    sessionStorage.removeItem(this.SESSION_KEY);
  }

  esAdmin(): boolean {
    return this.getUsuario()?.rol === 'admin';
  }

  getSede(): string {
    return this.getUsuario()?.sede ?? '';
  }

  /** Sedes asignadas al usuario (varias). Si no hay lista, cae a [sede]. */
  sedesUsuario(): string[] {
    const u = this.getUsuario();
    if (!u) return [];
    if (Array.isArray(u.sedes) && u.sedes.length) return u.sedes.filter(Boolean);
    return u.sede ? [u.sede] : [];
  }
}
