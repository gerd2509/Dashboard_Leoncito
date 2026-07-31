import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Una gestión KOMMO (Leoncito o Realzza) en la tabla unificada gestion_kommo. */
export interface GestionKommo {
  id?: number;
  marca_temporal?: string;
  registrado_por?: string;
  canal: string;                 // LEONCITO | REALZZA
  tienda?: string;
  fecha_lead_asignado?: string;
  nombre_cliente?: string;
  asesor: string;
  sede?: string;
  dni_cliente: string;
  celular_gestionado?: string;
  tipo_cliente?: string;
  estado_gestion: string;        // CONTACTO | NO CONTACTO
  resultado_gestion?: string;
  market_place?: string;         // SI | NO
  producto_interes?: string;
  motivo_interes?: string;
  motivo_agendamiento?: string;
  fecha_interes_agend?: string; hora_interes_agend?: string; comentario_agend?: string;
  fecha_interes_deriv?: string; hora_interes_deriv?: string; comentario_deriv?: string;
  motivo_no_interes?: string;
  comentario_adicional?: string;
  motivo_no_atendible?: string;
  comentario_na?: string;
  motivo_no_contacto?: string;
  motivo_no_cierre?: string;
  comentario_venta_no_concretada?: string;
  origen?: string;               // sheet | dashboard
}

/**
 * CRUD de la gestión KOMMO contra gestion-service (tabla gestion_kommo). Reemplaza
 * el Google Form: registrar / listar / editar / eliminar van directo a la BD.
 */
@Injectable({ providedIn: 'root' })
export class GestionKommoService {
  private http = inject(HttpClient);
  private url = `${environment.gestionBase || environment.apiBase}/gestion-kommo`;

  registrar(payload: Partial<GestionKommo>): Observable<any> {
    return this.http.post(this.url, payload);
  }

  listar(opts?: { canal?: string; desde?: string; hasta?: string; asesor?: string }): Observable<GestionKommo[]> {
    let params = new HttpParams();
    if (opts?.canal)  params = params.set('canal', opts.canal);
    if (opts?.desde)  params = params.set('desde', opts.desde);
    if (opts?.hasta)  params = params.set('hasta', opts.hasta);
    if (opts?.asesor) params = params.set('asesor', opts.asesor);
    return this.http.get<GestionKommo[]>(this.url, { params });
  }

  actualizar(id: number, body: Partial<GestionKommo>): Observable<any> {
    return this.http.put(`${this.url}/${id}`, body);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.url}/${id}`);
  }
}
