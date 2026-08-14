import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Datasets que se pueden cargar desde el módulo Carga de Ventas. */
export type CargaTipo = 'ventas' | 'margen' | 'ventas-call' | 'ventas-realzza' | 'kommo-call' | 'kommo-realzza';

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
  // ventas-service si está configurado; si no, cae al monolito sheets-api.
  private root = environment.ventasBase || environment.apiBase;

  private pathDe(tipo: CargaTipo): string {
    switch (tipo) {
      case 'margen':         return 'margen-ventas';
      case 'ventas-call':    return 'ventas-call';
      case 'ventas-realzza': return 'ventas-realzza';
      case 'kommo-call':     return 'leads-kommo-call';
      case 'kommo-realzza':  return 'leads-kommo-realzza';
      default:               return 'ventas';
    }
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
  obtenerVentas(anio: number, opts?: { mes?: number; sede?: string; sedekeys?: string[] }): Observable<any[]> {
    let params = new HttpParams().set('anio', anio);
    if (opts?.mes) params = params.set('mes', opts.mes);
    if (opts?.sede) params = params.set('sede', opts.sede);
    if (opts?.sedekeys?.length) params = params.set('sedekeys', opts.sedekeys.join(','));
    return this.http.get<any[]>(`${this.root}/ventas`, { params });
  }

  /**
   * Trae el margen (tabla margen_ventas, una fila por línea de producto) filtrado
   * por año y, opcionalmente, mes y sede. Usado por ventas-sedes (Ventas por Línea
   * Real) y pizarra-metas (KPI Margen %).
   */
  obtenerMargen(anio: number, opts?: { mes?: number; sede?: string; sedekeys?: string[] }): Observable<any[]> {
    let params = new HttpParams().set('anio', anio);
    if (opts?.mes) params = params.set('mes', opts.mes);
    if (opts?.sede) params = params.set('sede', opts.sede);
    if (opts?.sedekeys?.length) params = params.set('sedekeys', opts.sedekeys.join(','));
    return this.http.get<any[]>(`${this.root}/margen-ventas`, { params });
  }

  /**
   * Neto real mensual por SEDE (todos los meses/años) para el evolutivo de Ventas Sedes:
   * ventas − NC no refacturadas − incautaciones. Devuelve [{sede, anio, mes, ...neto}].
   */
  obtenerEvolutivoSedes(): Observable<{ sede: string; anio: number; mes: number; ventas: number; nc: number; inc: number; neto: number }[]> {
    return this.http.get<{ sede: string; anio: number; mes: number; ventas: number; nc: number; inc: number; neto: number }[]>(`${this.root}/ventas/evolutivo`);
  }

  /** Todas las ventas de un vendedor (para "Mi Panel"). Opcional: filtrar por año/mes. */
  obtenerVentasPorVendedor(vendedor: string, opts?: { anio?: number; mes?: number }): Observable<any[]> {
    let params = new HttpParams().set('vendedor', vendedor);
    if (opts?.anio) params = params.set('anio', opts.anio);
    if (opts?.mes) params = params.set('mes', opts.mes);
    return this.http.get<any[]>(`${this.root}/ventas`, { params });
  }

  /**
   * Ventas del evolutivo por canal (tablas ventas_call / ventas_realzza). Para
   * "Mi Panel": Call filtra por `vendedor` (nombre del asesor); Realzza por `sede`
   * (en Realzza el vendedor es la sede). El backend, con anio+mes, incluye las
   * ventas del mes (CV) ∪ las afectaciones (NC/refact) cuyo AF cae en ese mes.
   */
  obtenerVentasCanal(
    canal: 'call' | 'realzza',
    filtro: { vendedor?: string; sede?: string; anio?: number; mes?: number },
  ): Observable<any[]> {
    const path = canal === 'call' ? 'ventas-call' : 'ventas-realzza';
    let params = new HttpParams();
    if (filtro.vendedor) params = params.set('vendedor', filtro.vendedor);
    if (filtro.sede)     params = params.set('sede', filtro.sede);
    if (filtro.anio)     params = params.set('anio', filtro.anio);
    if (filtro.mes)      params = params.set('mes', filtro.mes);
    return this.http.get<any[]>(`${this.root}/${path}`, { params });
  }

  /**
   * Sueldo estimado del vendedor de PISO/SEDE (réplica del Excel de comisiones):
   * comisión Electro 1.5% + Melamina 3% + Motos 1% (neto de NC/Incau) + Bono Categoría
   * (derivada de la venta) + Bono Campañero (si el canal del CAP es CAMPAÑA).
   */
  obtenerSueldoSede(vendedor: string, anio: number, mes: number): Observable<any> {
    const params = new HttpParams().set('vendedor', vendedor).set('anio', anio).set('mes', mes);
    return this.http.get<any>(`${this.root}/ventas-sedes/sueldo`, { params });
  }

  // ── Maestro Metas por Sede (Fase 2: gate del Bono Volumen) ──
  getMetaSede(anio: number, mes: number): Observable<any[]> {
    const params = new HttpParams().set('anio', anio).set('mes', mes);
    return this.http.get<any[]>(`${this.root}/meta-sede`, { params });
  }
  guardarMetaSede(p: { sede: string; anio: number; mes: number; meta: number }): Observable<any> {
    return this.http.post<any>(`${this.root}/meta-sede`, p);
  }
  eliminarMetaSede(id: number): Observable<any> {
    return this.http.delete<any>(`${this.root}/meta-sede/${id}`);
  }

  // ── Maestro Metas por Tipo de Base (Realzza) ──
  /** Grid del maestro: tipos de base con su meta del mes. */
  getMetaTipoBase(anio: number, mes: number): Observable<any[]> {
    const params = new HttpParams().set('anio', anio).set('mes', mes);
    return this.http.get<any[]>(`${this.root}/meta-tipo-base`, { params });
  }
  /** Todas las metas del año [{tipo_base, anio, mes, meta}] → para Ventas Realzza. */
  getMetaTipoBaseAnio(anio: number): Observable<any[]> {
    const params = new HttpParams().set('anio', anio);
    return this.http.get<any[]>(`${this.root}/meta-tipo-base`, { params });
  }
  guardarMetaTipoBase(p: { tipo_base: string; anio: number; mes: number; meta: number }): Observable<any> {
    return this.http.post<any>(`${this.root}/meta-tipo-base`, p);
  }
  eliminarMetaTipoBase(id: number): Observable<any> {
    return this.http.delete<any>(`${this.root}/meta-tipo-base/${id}`);
  }

  /**
   * Conteo de LEADS KOMMO ingresados por mes (tablas leads_kommo_call/realzza),
   * según su fecha de creación. Para la "Maduración de Leads". Devuelve
   * [{ anio, mes, total }]. Opcional: filtrar por año.
   */
  obtenerLeadsPorMes(canal: 'call' | 'realzza', anio?: number): Observable<{ anio: number; mes: number; total: number }[]> {
    const path = canal === 'call' ? 'leads-kommo-call' : 'leads-kommo-realzza';
    let params = new HttpParams();
    if (anio) params = params.set('anio', anio);
    return this.http.get<{ anio: number; mes: number; total: number }[]>(`${this.root}/${path}`, { params });
  }

  /**
   * Conteo de LEADS KOMMO ingresados por DÍA (para el gráfico de leads/día en la
   * Maduración de Leads). Devuelve [{ anio, mes, dia, total }]. Opcional: por año.
   */
  obtenerLeadsPorDia(canal: 'call' | 'realzza', anio?: number): Observable<{ anio: number; mes: number; dia: number; total: number }[]> {
    const path = canal === 'call' ? 'leads-kommo-call' : 'leads-kommo-realzza';
    let params = new HttpParams().set('por', 'dia');
    if (anio) params = params.set('anio', anio);
    return this.http.get<{ anio: number; mes: number; dia: number; total: number }[]>(`${this.root}/${path}`, { params });
  }

  /**
   * Data del módulo Ventas Realzza reconstruyendo los 2 movimientos (CV y NC) de cada
   * venta por AÑO: la venta cuenta en su mes CV, la NC resta en su mes de AF. Respeta el
   * TipoBase de ventas_realzza (Realzza tal cual; CALL solo si se puso a mano).
   */
  obtenerVentasRealzzaModulo(anio: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.root}/ventas-realzza/modulo`, { params: new HttpParams().set('anio', anio) });
  }
  /** Evolutivo mensual Realzza (neto por mes) desde ventas_realzza; para el gráfico. */
  obtenerVentasRealzzaEvolutivo(): Observable<{ anio: number; mes: number; ventas: number; nc: number; neto: number }[]> {
    return this.http.get<{ anio: number; mes: number; ventas: number; nc: number; neto: number }[]>(`${this.root}/ventas-realzza/evolutivo`);
  }

  // ── Atribución de Ventas por canal ──
  //   Call    → tabla `ventas` × gestion_call (AsesorVenta/CC + TipoCliente/TipoBase).
  //   Realzza → tabla `ventas_realzza` × gestion_realzza (TipoBase) + margen_ventas.
  private atribBase(canal: 'call' | 'realzza'): string {
    return canal === 'realzza' ? 'ventas-realzza' : 'ventas-call';
  }
  private anioMes(anio?: number, mes?: number): HttpParams {
    let params = new HttpParams();
    if (anio) params = params.set('anio', anio);
    if (mes) params = params.set('mes', mes);
    return params;
  }

  /** Cruza las ventas del canal con su gestión de derivación (Call: CC+tipos; Realzza: TipoBase). */
  cruzarDerivacion(canal: 'call' | 'realzza', anio?: number, mes?: number): Observable<{ success: boolean; actualizados: number; total: number }> {
    return this.http.post<{ success: boolean; actualizados: number; total: number }>(
      `${this.root}/${this.atribBase(canal)}/cruzar`, {}, { params: this.anioMes(anio, mes) });
  }
  /** Lista TODAS las ventas del mes con su atribución (para la tabla de revisión). */
  listarAtribucion(canal: 'call' | 'realzza', anio?: number, mes?: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.root}/${this.atribBase(canal)}/atribucion`, { params: this.anioMes(anio, mes) });
  }
  /** Busca ese DNI en las ventas del mes + sugerencia de derivación (asignar a mano). */
  buscarVenta(canal: 'call' | 'realzza', dni: string, anio?: number, mes?: number): Observable<any[]> {
    let params = this.anioMes(anio, mes).set('dni', dni);
    return this.http.get<any[]>(`${this.root}/${this.atribBase(canal)}/buscar`, { params });
  }
  /**
   * Edita a mano la atribución de una venta (queda protegida del re-cruce). Solo se
   * mandan los campos presentes. Call: vendedor/contacto/tipo_cliente/tipo_base.
   * Realzza: tipo_base/asesor_venta.
   */
  guardarAtribucion(canal: 'call' | 'realzza', codigo: number, datos: {
    vendedor?: string; contacto?: string; tipo_cliente?: string; tipo_base?: string; asesor_venta?: string; extranjero?: boolean;
  }): Observable<any> {
    return this.http.put(`${this.root}/${this.atribBase(canal)}/${codigo}`, datos);
  }
  /**
   * Consolida el mes hacia la tabla histórica del canal.
   *  - Call:    merge/upsert desde `ventas` → ventas_call (actualiza + agrega).
   *  - Realzza: agrega desde `ventas` → ventas_realzza SOLO lo nuevo (no cambia lo existente).
   */
  consolidarVentas(canal: 'call' | 'realzza', anio?: number, mes?: number): Observable<{ success: boolean; insertados: number; actualizados?: number; total?: number }> {
    return this.http.post<{ success: boolean; insertados: number; actualizados?: number; total?: number }>(
      `${this.root}/${this.atribBase(canal)}/consolidar`, {}, { params: this.anioMes(anio, mes) });
  }

  // ── Atribución de SEDES (Lambayeque / Ferreñafe) → `ventas` × gestion_sedes_deriv ──
  //   La "fuente generadora" = TIPO DE BASE de la derivación; cruce SOLO por DNI + sede.
  listarAtribucionSede(sede: string, anio?: number, mes?: number): Observable<any[]> {
    // El cruce se hace EN VIVO con el formulario → cache-bust (_) para que el navegador
    // nunca reuse una respuesta cacheada y siempre traiga el estado real de la derivación.
    return this.http.get<any[]>(`${this.root}/ventas-sedes/atribucion`,
      { params: this.anioMes(anio, mes).set('sede', sede).set('_', Date.now().toString()) });
  }
  buscarVentaSede(sede: string, dni: string, anio?: number, mes?: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.root}/ventas-sedes/buscar`,
      { params: this.anioMes(anio, mes).set('sede', sede).set('dni', dni).set('_', Date.now().toString()) });
  }
  /** Persiste la fuente generadora (atrib_fuente_sede) desde la derivación, por sede. */
  cruzarSede(sede: string, anio?: number, mes?: number): Observable<{ success: boolean; actualizados: number }> {
    return this.http.post<{ success: boolean; actualizados: number }>(
      `${this.root}/ventas-sedes/cruzar`, {}, { params: this.anioMes(anio, mes).set('sede', sede) });
  }
  /** Edita a mano la fuente generadora de una venta de sede. */
  guardarFuenteSede(codigo: number, fuente: string): Observable<any> {
    return this.http.put(`${this.root}/ventas-sedes/${codigo}`, { fuente });
  }
  /**
   * Sincroniza la tabla gestion_sedes_deriv con las respuestas ACTUALES del formulario
   * (POST a sheets-api). Tras esto, "Cargar lista" cruza contra la derivación al día.
   */
  sincronizarSedesDeriv(): Observable<{ success: boolean; leidas: number; insertados: number }> {
    return this.http.post<{ success: boolean; leidas: number; insertados: number }>(
      `${environment.apiBase}/gestion-sedes-deriv/sync`, {});
  }
}
