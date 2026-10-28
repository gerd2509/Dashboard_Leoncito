import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface HorarioSlot {
  id?: number;
  etiqueta: string;
  nota?: string | null;
  domingos: number[];
  cuentaCuota?: boolean;
  asesores: string[];
}
export interface HorarioRotacionAsesor {
  asesor: string;
  grupo: number | null;
  diaFijo: number | null;
  inamovible: boolean;
  nota?: string | null;
}
export interface HorarioReglas {
  slots: HorarioSlot[];
  rotacion: HorarioRotacionAsesor[];
}
export interface HorarioCambio {
  id: number; asesor: string; fecha: string; tipo: string;
  motivo: string | null; creado_por: string | null; creado_en: string;
}

@Injectable({ providedIn: 'root' })
export class HorariosService {
  private readonly base = environment.apiBase; // .../sheets

  constructor(private http: HttpClient) {}

  obtenerReglas(sede: string, anio: number, mes: number): Observable<HorarioReglas> {
    const params = new HttpParams().set('sede', sede).set('anio', anio).set('mes', mes);
    return this.http.get<HorarioReglas>(`${this.base}/horarios/reglas`, { params });
  }

  guardarReglas(sede: string, anio: number, mes: number, slots: HorarioSlot[], rotacion: HorarioRotacionAsesor[]): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.base}/horarios/reglas`, { sede, anio, mes, slots, rotacion });
  }

  obtenerCambios(sede: string, anio: number, mes: number): Observable<HorarioCambio[]> {
    const params = new HttpParams().set('sede', sede).set('anio', anio).set('mes', mes);
    return this.http.get<HorarioCambio[]>(`${this.base}/horarios/cambios`, { params });
  }

  registrarCambio(sede: string, asesor: string, fecha: string, tipo: string, motivo: string): Observable<{ success: boolean; id: number }> {
    return this.http.post<{ success: boolean; id: number }>(`${this.base}/horarios/cambios`, { sede, asesor, fecha, tipo, motivo });
  }

  quitarCambio(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/horarios/cambios/${id}`);
  }
}
