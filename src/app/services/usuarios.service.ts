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
  sedes?: string[];    // sedes asignadas (varias)
  vendedor?: string;   // nombre exacto del vendedor (rol vendedor) → "Mi Panel"
  canal?: string;      // 'sede' | 'call' | 'realzza' (rol vendedor)
  modulos?: string[] | null;   // permisos POR USUARIO; null = usa default por rol-perfil
  activo: boolean;
  dni?: string;                // vínculo con el CAP (usuario/clave por defecto)
  debe_cambiar_password?: boolean;
  creado_en?: string;
  actualizado_en?: string;
}

/** Payload para crear/editar. `password` opcional al editar (vacío = no cambiar). */
export interface UsuarioPayload {
  usuario: string;
  nombre: string;
  rol: string;
  sede: string;
  sedes?: string[];
  vendedor?: string;
  canal?: string;
  activo: boolean;
  password?: string;
  dni?: string;
  debe_cambiar_password?: boolean;
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

  /** Previsualiza el alta masiva de una sede desde el CAP (quiénes se crearían / ya existen). */
  previewBulkCap(sede: string): Observable<{ success: boolean; sede: string; total: number; nuevos: number; existentes: number; detalle: { vendedor: string; dni: string; existe: boolean }[] }> {
    return this.http.get<any>(`${this.base}/bulk-cap`, { params: { sede } });
  }

  /** Crea de golpe todos los usuarios (vendedor de sede) de la sede desde el CAP. usuario=clave=DNI.
   *  `modulos`: si se pasa, se asigna ese set de permisos a todos; si es null/omitido, usan el default del rol. */
  crearBulkCap(sede: string, modulos?: string[] | null): Observable<{ success: boolean; sede: string; creados: number; omitidos: number; detalle: { creados: any[]; omitidos: any[] } }> {
    return this.http.post<any>(`${this.base}/bulk-cap`, modulos ? { sede, modulos } : { sede });
  }

  actualizar(id: number, payload: UsuarioPayload): Observable<any> {
    return this.http.put(`${this.base}/${id}`, payload);
  }

  cambiarEstado(id: number, activo: boolean): Observable<any> {
    return this.http.patch(`${this.base}/${id}/estado`, { activo });
  }

  /** Borra el usuario de la BD (real, no solo desactivar). */
  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`);
  }

  /** Guarda los permisos (módulos) de un usuario. `null` = usa el default por rol-perfil. */
  guardarModulos(id: number, modulos: string[] | null): Observable<any> {
    return this.http.patch(`${this.base}/${id}/modulos`, { modulos });
  }

  /** El propio usuario cambia su contraseña (valida la actual). Forzado en 1er login o autoservicio. */
  cambiarPassword(usuario: string, actual: string, nueva: string): Observable<{ success: boolean; message?: string }> {
    return this.http.post<any>(`${environment.apiBase}/auth/cambiar-password`, { usuario, actual, nueva });
  }
}
