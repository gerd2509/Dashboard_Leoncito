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

/** Extrae el día del mes directo del string "YYYY-MM-DD..." que manda el backend, SIN
 *  pasar por `new Date(...)` — ver nota equivalente en horarios.component.ts. */
function diaDeFechaCambio(fecha: string): number {
  return parseInt(String(fecha).slice(8, 10), 10);
}

/** Motor de reglas de rotación (domingo cierra la semana), reutilizable fuera del
 *  componente Horarios — p.ej. desde Cierre de Gestión, para no listar ahí a un asesor
 *  que esa fecha tiene descanso/día libre. Misma lógica que `estadoDia()` de
 *  HorariosComponent, tomando la fecha y las reglas/cambios como parámetros en vez de
 *  leerlos de estado del componente. */
export function estadoDiaAsesor(
  asesor: string, fecha: Date, reglas: HorarioReglas, cambios: HorarioCambio[]
): 'trabaja' | 'desc-dom' | 'desc-sem' {
  const anio = fecha.getFullYear(), mes = fecha.getMonth() + 1, dia = fecha.getDate();

  const cambio = cambios.find(c => c.asesor === asesor && diaDeFechaCambio(c.fecha) === dia);
  if (cambio) return cambio.tipo as 'trabaja' | 'desc-dom' | 'desc-sem';

  const diaSemana = (d: number) => new Date(anio, mes - 1, d).getDay();
  const domingoDeLaSemana = (d: number) => d + ((7 - diaSemana(d)) % 7);
  const descansaDomingoEsaSemana = (d: number) => {
    const domRef = domingoDeLaSemana(d);
    return reglas.slots.some(s => s.asesores.includes(asesor) && s.domingos.includes(domRef));
  };
  const diaRotacion = (grupo: number, domRef: number) => {
    const semana = Math.round((domRef - 8) / 7);
    const orden = [2, 3, 4];
    return orden[((grupo + semana) % 3 + 3) % 3];
  };

  const dow = diaSemana(dia);
  const tieneDomingoEstaSemana = descansaDomingoEsaSemana(dia);
  if (dow === 0) return tieneDomingoEstaSemana ? 'desc-dom' : 'trabaja';

  const regla = reglas.rotacion.find(r => r.asesor === asesor);
  if (!regla) return 'trabaja';
  const domRef = domingoDeLaSemana(dia);
  const diaQueLeToca = regla.inamovible ? regla.diaFijo : (regla.grupo != null ? diaRotacion(regla.grupo, domRef) : null);
  if (diaQueLeToca == null || diaQueLeToca !== dow) return 'trabaja';
  if (tieneDomingoEstaSemana && !regla.inamovible) return 'trabaja';
  return 'desc-sem';
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
