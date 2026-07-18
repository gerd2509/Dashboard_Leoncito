import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Payload del formulario de registro de gestión (los condicionales pueden ir vacíos). */
export interface GestionPayload {
  registrado_por?: string;
  dni_cliente: string;
  sede: string;
  asesor: string;
  tipo_gestion: string;
  resultado: string;
  motivo_contacto?: string;
  motivo_no_contacto?: string;
  fecha_compromiso?: string;   // yyyy-mm-dd
  valor_venta?: string | number;
  producto_interes?: string;
  detalle_contacto?: string;
  celular_actualizado?: string;
}

/** Payload de una gestión Realzza (todo opcional salvo los 3 obligatorios base). */
export interface GestionRealzzaPayload {
  asesor_realzza: string;
  dni_cliente: string;
  estado_gestion: string;                 // CONTACTO / NO CONTACTO
  sede?: string;
  tipo_base?: string;
  celular_gestionado?: string;
  medio_primer_contacto?: string;
  resultado_gestion?: string;
  producto_interes?: string;
  motivo_interes?: string;
  motivo_agendamiento?: string;
  fecha_interes_agendamiento?: string;
  hora_interes_agendamiento?: string;
  comentario_agendamiento?: string;
  fecha_interes_derivacion?: string;
  hora_interes_derivacion?: string;
  comentario_derivacion?: string;
  motivo_no_interes?: string;
  comentario_no_interes?: string;
  motivo_no_atendible?: string;
  comentario_no_atendible?: string;
  motivos_tercero_relacionado?: string;
  fecha_rellamada?: string;
  hora_rellamada?: string;
  numero_titular_actual?: string;
  motivo_no_contacto?: string;
  motivo_no_cierre?: string;
  comentario_venta_no_concretada?: string;
}

@Injectable({ providedIn: 'root' })
export class RegistroGestionService {
  private http = inject(HttpClient);
  // gestion-service si está configurado; si no, cae al monolito sheets-api.
  private url = `${environment.gestionBase || environment.apiBase}/gestion`;

  registrar(payload: GestionPayload): Observable<any> {
    return this.http.post(this.url, payload);
  }

  /** Registra una gestión Realzza en la BD (reemplaza el Google Form de campo). */
  registrarRealzza(payload: GestionRealzzaPayload): Observable<any> {
    return this.http.post(`${environment.apiBase}/gestion-realzza`, payload);
  }

  /** Registra una gestión Call Center en la BD (reemplaza el Google Form de call). */
  registrarCall(payload: GestionCallPayload): Observable<any> {
    return this.http.post(`${environment.apiBase}/gestion-call`, payload);
  }
}

/** Payload de una gestión Call Center (mismos campos condicionales que Realzza,
 *  pero con asesor_contact, tipo_cliente, sede y kommo propios). */
export interface GestionCallPayload {
  asesor_contact: string;
  dni_cliente: string;
  estado_gestion: string;
  sede?: string;
  kommo?: string;
  tipo_cliente?: string;
  celular_gestionado?: string;
  medio_primer_contacto?: string;
  resultado_gestion?: string;
  producto_interes?: string;
  motivo_interes?: string;
  motivo_agendamiento?: string;
  fecha_interes_agendamiento?: string;
  hora_interes_agendamiento?: string;
  comentario_agendamiento?: string;
  fecha_interes_derivacion?: string;
  hora_interes_derivacion?: string;
  comentario_derivacion?: string;
  motivo_no_interes?: string;
  comentario_no_interes?: string;
  motivo_no_atendible?: string;
  comentario_no_atendible?: string;
  motivos_tercero_relacionado?: string;
  fecha_rellamada?: string;
  hora_rellamada?: string;
  numero_titular_actual?: string;
  motivo_no_contacto?: string;
  motivo_no_cierre?: string;
  comentario_venta_no_concretada?: string;
}
