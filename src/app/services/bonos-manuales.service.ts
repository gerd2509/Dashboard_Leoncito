import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface BonoManual {
  id: number;
  asesor: string;
  canal: string;   // 'CALL' | 'REALZZA CHICLAYO' | 'REALZZA PIURA' | 'REALZZA LIMA'
  anio: number;
  mes: number;
  tipo: string;
  monto: number;
  comentario: string | null;
  creado_por: string | null;
  creado_en: string;
}

/** Bonos manuales (extra al bono calculado): Bono Logístico, Bono Efectiva, Bono
 *  Global Supervisor, etc. — monto fijo que se ingresa cada mes, tabla `bonos_manuales`
 *  en gestion-service. Usado por el módulo "Pago de Bonos". */
@Injectable({ providedIn: 'root' })
export class BonosManualesService {
  private readonly base = `${environment.gestionBase}/bonos-manuales`;

  constructor(private http: HttpClient) {}

  listar(anio: number, mes: number): Observable<BonoManual[]> {
    const params = new HttpParams().set('anio', anio).set('mes', mes);
    return this.http.get<BonoManual[]>(this.base, { params });
  }

  crear(b: { asesor: string; canal: string; anio: number; mes: number; tipo: string; monto: number; comentario?: string; creado_por?: string }): Observable<{ success: boolean; id: number }> {
    return this.http.post<{ success: boolean; id: number }>(this.base, b);
  }

  actualizar(id: number, b: { tipo?: string; monto?: number; comentario?: string }): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.base}/${id}`, b);
  }

  eliminar(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/${id}`);
  }
}
