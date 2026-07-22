import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Usuario {
  nombre: string;
  rol: 'admin' | 'gerente' | 'supervisor' | string;
  sede: string;
  vendedor?: string;   // rol vendedor: su nombre exacto (para "Mi Panel")
  canal?: string;      // rol vendedor: 'sede' | 'call' | 'realzza'
  modulos?: string[] | null;   // permisos POR USUARIO; null = usa default por rol-perfil
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = environment.apiBase;
  private readonly SESSION_KEY = 'gd_usuario';

  constructor(private http: HttpClient) {}

  login(usuario: string, password: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/login`, { usuario, password });
  }

  /**
   * Consulta la marca/sede de un usuario por su nombre de usuario (sin contraseña),
   * para personalizar el branding del login mientras se escribe.
   * Endpoint esperado en el backend: GET /auth/marca?usuario=... → { sede?, marca? }
   */
  getMarca(usuario: string): Observable<{ sede?: string; marca?: string }> {
    return this.http.get<{ sede?: string; marca?: string }>(
      `${this.baseUrl}/auth/marca`, { params: { usuario } }
    );
  }

  guardarSesion(usuario: Usuario): void {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(usuario));
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
}
