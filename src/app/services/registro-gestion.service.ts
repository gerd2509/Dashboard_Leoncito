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

@Injectable({ providedIn: 'root' })
export class RegistroGestionService {
  private http = inject(HttpClient);
  private url = `${environment.apiBase}/gestion`;

  registrar(payload: GestionPayload): Observable<any> {
    return this.http.post(this.url, payload);
  }
}
