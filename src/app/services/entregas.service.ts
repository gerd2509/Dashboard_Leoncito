import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Entrega {
  id: number;
  dni_cliente: string;
  cliente_nombre?: string | null;
  producto: string;
  codigo_cv?: string | null;
  fecha_entrega: string;          // YYYY-MM-DD
  sede?: string | null;
  celular?: string | null;
  direccion?: string | null;
  observacion?: string | null;
  estado: 'PENDIENTE' | 'ENTREGADO' | 'ANULADO' | string;
  registrado_por?: string | null;
  entregado_por?: string | null;
  fecha_entregado?: string | null;
  vencida?: boolean;
}

export interface EntregaPayload {
  dni_cliente: string;
  producto: string;
  fecha_entrega: string;          // YYYY-MM-DD
  sede?: string;
  cliente_nombre?: string;
  codigo_cv?: string;
  celular?: string;
  direccion?: string;
  observacion?: string;
  registrado_por?: string;
}

/** Control de Entregas (módulo Logística). Pega a gestion-service (tabla `entregas`). */
@Injectable({ providedIn: 'root' })
export class EntregasService {
  private http = inject(HttpClient);
  private base = `${environment.gestionBase || environment.apiBase}/entregas`;

  crear(payload: EntregaPayload): Observable<{ success: boolean; id: number }> {
    return this.http.post<any>(this.base, payload);
  }

  listar(filtro: { desde?: string; hasta?: string; sede?: string; estado?: string; dni?: string } = {}): Observable<Entrega[]> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtro)) if (v) params = params.set(k, v);
    return this.http.get<Entrega[]>(this.base, { params });
  }

  /** Marca varias entregas como ENTREGADO (o desmarca con entregado=false). */
  marcarEntregado(ids: number[], entregadoPor: string, entregado = true): Observable<{ success: boolean; actualizados: number }> {
    return this.http.patch<any>(`${this.base}/entregar`, { ids, entregado_por: entregadoPor, entregado });
  }

  actualizar(id: number, cambios: Partial<EntregaPayload> & { estado?: string }): Observable<any> {
    return this.http.put(`${this.base}/${id}`, cambios);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
