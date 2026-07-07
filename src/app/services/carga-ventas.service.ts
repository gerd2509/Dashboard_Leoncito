import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Datasets que se pueden cargar desde el módulo Carga de Ventas. */
export type CargaTipo = 'ventas' | 'margen';

/** Resultado de una carga (POST .../import). Los campos varían según el dataset. */
export interface ResultadoCargaVentas {
  success: boolean;
  filas: number;
  insertados?: number;    // ventas (upsert por CodigoCV)
  actualizados?: number;  // ventas
  codigos?: number;       // margen (nº de CodigoCV distintos)
  reemplazados?: number;  // margen (filas reemplazadas)
  updated_at: string;
  message?: string;
}

/** Estado de la tabla destino (GET .../estado). */
export interface EstadoVentas {
  success: boolean;
  total: number;
  updated_at: string | null;
  ultimaCarga: {
    cargado_por: string | null;
    archivo: string | null;
    filas: number;
    insertados?: number;
    actualizados?: number;
    codigos?: number;
    reemplazados?: number;
    creado_en: string;
  } | null;
}

/**
 * Carga de Excel hacia el backend (sheets-api → Neon). Soporta dos destinos:
 * 'ventas' (tabla ventas, upsert por CodigoCV) y 'margen' (tabla margen_ventas,
 * reemplazo por CodigoCV). El navegador solo sube el archivo crudo (multipart).
 */
@Injectable({ providedIn: 'root' })
export class CargaVentasService {
  private http = inject(HttpClient);
  private root = environment.apiBase;

  private pathDe(tipo: CargaTipo): string {
    return tipo === 'margen' ? 'margen-ventas' : 'ventas';
  }

  /** Sube el Excel al dataset indicado. Emite progreso de subida + respuesta final. */
  importar(tipo: CargaTipo, archivo: File, cargadoPor: string): Observable<HttpEvent<ResultadoCargaVentas>> {
    const fd = new FormData();
    fd.append('archivo', archivo);
    fd.append('cargado_por', cargadoPor);
    return this.http.post<ResultadoCargaVentas>(`${this.root}/${this.pathDe(tipo)}/import`, fd, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /** Total de filas y datos de la última carga del dataset indicado. */
  estado(tipo: CargaTipo): Observable<EstadoVentas> {
    return this.http.get<EstadoVentas>(`${this.root}/${this.pathDe(tipo)}/estado`);
  }

  /**
   * Trae las ventas (tabla ventas) filtradas por año y, opcionalmente, mes y sede.
   * Usado por ventas-sedes y pizarra-metas.
   */
  obtenerVentas(anio: number, opts?: { mes?: number; sede?: string }): Observable<any[]> {
    let params = new HttpParams().set('anio', anio);
    if (opts?.mes) params = params.set('mes', opts.mes);
    if (opts?.sede) params = params.set('sede', opts.sede);
    return this.http.get<any[]>(`${this.root}/ventas`, { params });
  }

  /**
   * Trae el margen (tabla margen_ventas, una fila por línea de producto) filtrado
   * por año y, opcionalmente, mes y sede. Usado por ventas-sedes (Ventas por Línea
   * Real) y pizarra-metas (KPI Margen %).
   */
  obtenerMargen(anio: number, opts?: { mes?: number; sede?: string }): Observable<any[]> {
    let params = new HttpParams().set('anio', anio);
    if (opts?.mes) params = params.set('mes', opts.mes);
    if (opts?.sede) params = params.set('sede', opts.sede);
    return this.http.get<any[]>(`${this.root}/margen-ventas`, { params });
  }
}
