import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ResultadoAuditoria = 'bien' | 'mejorar' | 'pendiente';

export interface LoteAuditoria {
  id: number; tienda: string; anio: number; mes: number; cantidad_por_embudo: number;
  creado_por: string | null; creado_en: string;
  total: number; bien: number; mejorar: number; pendiente: number;
}
export interface LeadAuditoria {
  id: number; lote_id: number; lead_id: number; nombre_cliente: string; embudo: string;
  responsable: string; fecha_creacion_lead: string; resultado: ResultadoAuditoria;
  comentario: string | null; fotos: string[]; fotosUrl: string[];
  revisado_por: string | null; revisado_en: string | null;
}

/**
 * "Auditoría Kommo" (Realzza): sortea una muestra de leads ya respondidos por
 * embudo para revisar a mano en Kommo, y guarda el resultado (bien/por mejorar),
 * un comentario y fotos de evidencia por cada lead sorteado.
 */
@Injectable({ providedIn: 'root' })
export class AuditoriaKommoService {
  private http = inject(HttpClient);
  private readonly base = (environment.ventasBase || environment.apiBase) + '/leads-kommo-realzza/auditoria';

  sortear(tienda: string, anio: number, mes: number, cantidadPorEmbudo: number): Observable<{ success: boolean; loteId: number; total: number; embudos: number }> {
    return this.http.post<{ success: boolean; loteId: number; total: number; embudos: number }>(`${this.base}/sortear`, { tienda, anio, mes, cantidadPorEmbudo });
  }

  obtenerLotes(tienda?: string, anio?: number, mes?: number): Observable<LoteAuditoria[]> {
    let params = new HttpParams();
    if (tienda) params = params.set('tienda', tienda);
    if (anio) params = params.set('anio', anio);
    if (mes) params = params.set('mes', mes);
    return this.http.get<LoteAuditoria[]>(`${this.base}/lotes`, { params });
  }

  obtenerLoteDetalle(id: number): Observable<{ lote: LoteAuditoria; leads: LeadAuditoria[] }> {
    return this.http.get<{ lote: LoteAuditoria; leads: LeadAuditoria[] }>(`${this.base}/lotes/${id}`);
  }

  guardarRevision(id: number, resultado: ResultadoAuditoria, comentario: string, fotos: string[]): Observable<{ success: boolean; fotos: string[] }> {
    return this.http.put<{ success: boolean; fotos: string[] }>(`${this.base}/leads/${id}`, { resultado, comentario, fotos });
  }

  /** Refresca nombre_cliente/embudo/responsable/fecha de cada lead del lote contra el
   *  dato actual de Kommo, sin tocar resultado/comentario/fotos ya guardados. */
  sincronizarLote(loteId: number): Observable<{ success: boolean; actualizados: number }> {
    return this.http.post<{ success: boolean; actualizados: number }>(`${this.base}/lotes/${loteId}/sincronizar`, {});
  }
}
