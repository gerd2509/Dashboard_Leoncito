import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Lo que el supervisor registra: control de GESTIÓN o de MARKET_PLACE. */
export interface ControlSupervisorPayload {
  registrado_por?: string;
  tipo_control?: 'GESTION' | 'MARKET_PLACE';
  asesor: string;
  tipo_base?: string;
  // Gestión (contacto/no contacto de un cliente):
  dni_cliente?: string;
  celular?: string;
  estado_gestion?: string;    // CONTACTO / NO CONTACTO
  // Market Place / Kommo Plataforma (revisión de publicaciones del vendedor):
  mp_subtipo?: string;        // MARKET PLACE | KOMMO PLATAFORMA
  fecha_publicacion?: string; // última publicación vista (d/m/yyyy) — market place
  estado_mp?: string;         // AL DÍA / DESACTUALIZADO / ACTUALIZADO — market place
  cliente?: string;           // nombre del cliente — kommo plataforma
  estado_lead?: string;       // LEAD RESPONDIDO / CLIENTE SOLO DIO DNI / ... — kommo plataforma
  comentario?: string;
  fotos?: string[];           // pruebas (imágenes base64 data-URI)
}

/** Fila devuelta por la BD (incluye id + marca temporal d/m/yyyy H:mm:ss). */
export interface ControlSupervisor extends ControlSupervisorPayload {
  id: number;
  marca_temporal: string;
}

@Injectable({ providedIn: 'root' })
export class ControlSupervisorService {
  private http = inject(HttpClient);
  // gestion-service si está configurado; si no, cae al monolito sheets-api.
  private url = `${environment.gestionBase || environment.apiBase}/control-supervisor`;

  /** Registra un control del supervisor (escribe en la tabla control_supervisor). */
  registrar(payload: ControlSupervisorPayload): Observable<any> {
    return this.http.post(this.url, payload);
  }

  /** Lista los controles por rango de fechas (marca_temporal). */
  listar(rango?: { desde?: Date; hasta?: Date }): Observable<ControlSupervisor[]> {
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.iso(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.iso(rango.hasta));
    return this.http.get<ControlSupervisor[]>(this.url, { params });
  }

  actualizar(id: number, body: Partial<ControlSupervisorPayload>): Observable<any> {
    return this.http.put(`${this.url}/${id}`, body);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.url}/${id}`);
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
