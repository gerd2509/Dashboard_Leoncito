import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Usuario {
  nombre: string;
  rol: 'admin' | 'gerente' | 'supervisor' | string;
  sede: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  // private readonly baseUrl = 'https://api-leoncito.onrender.com';
  private readonly baseUrl = 'http://localhost:3000';
  private readonly SESSION_KEY = 'gd_usuario';

  constructor(private http: HttpClient) {}

  login(usuario: string, password: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/login`, { usuario, password });
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
