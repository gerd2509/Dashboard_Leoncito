import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface MarcaAsistencia {
  id: number; usuario: string; nombre: string; sede: string;
  latitud: number; longitud: number; precision_metros: number | null;
  distancia_metros: number | null; dentro_rango: boolean | null;
  creado_en: string;
}
export interface RespuestaAsistencia {
  success: boolean; id: number; creadoEn: string; sede: string;
  distanciaMetros: number | null; dentroRango: boolean | null; sinUbicacionConfigurada: boolean;
}

@Injectable({ providedIn: 'root' })
export class AsistenciaService {
  private readonly base = environment.apiBase; // .../sheets

  constructor(private http: HttpClient) {}

  /** Marca la asistencia del usuario logueado (usuario/nombre/sede salen del
   *  token en el backend). */
  marcar(latitud: number, longitud: number, precision?: number): Observable<RespuestaAsistencia> {
    return this.http.post<RespuestaAsistencia>(`${this.base}/asistencia`, { latitud, longitud, precision });
  }

  /** Listado para revisión (admin/gerente/supervisor). */
  listar(desde?: string, hasta?: string): Observable<MarcaAsistencia[]> {
    let params = new HttpParams();
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<MarcaAsistencia[]>(`${this.base}/asistencia`, { params });
  }
}
