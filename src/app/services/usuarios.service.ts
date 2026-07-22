import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UsuarioDB {
  id: number;
  usuario: string;
  nombre: string;
  rol: string;
  sede: string;
  vendedor?: string;   // nombre exacto del vendedor (rol vendedor) → "Mi Panel"
  canal?: string;      // 'sede' | 'call' | 'realzza' (rol vendedor)
  activo: boolean;
  creado_en?: string;
  actualizado_en?: string;
}

/** Payload para crear/editar. `password` opcional al editar (vacío = no cambiar). */
export interface UsuarioPayload {
  usuario: string;
  nombre: string;
  rol: string;
  sede: string;
  vendedor?: string;
  canal?: string;
  activo: boolean;
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/usuarios`;

  listar(): Observable<UsuarioDB[]> {
    return this.http.get<UsuarioDB[]>(this.base);
  }

  crear(payload: UsuarioPayload): Observable<any> {
    return this.http.post(this.base, payload);
  }

  actualizar(id: number, payload: UsuarioPayload): Observable<any> {
    return this.http.put(`${this.base}/${id}`, payload);
  }

  cambiarEstado(id: number, activo: boolean): Observable<any> {
    return this.http.patch(`${this.base}/${id}/estado`, { activo });
  }
}
