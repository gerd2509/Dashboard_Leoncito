import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { CacheService } from './cache.service';

@Injectable({ providedIn: 'root' })
export class SheetsService {
  private cache = inject(CacheService);
  // La base sale del environment: prod (ng build) → Render https; dev (ng serve) → localhost.
  // Ya NO se comenta/descomenta nada manualmente.
  private baseUrl = `${environment.apiBase}/data`;

  // 2. Armas las rutas concatenando la base con el endpoint específico
  private apiUrlCall = `${this.baseUrl}/call`;
  private apiUrlCampo = `${this.baseUrl}/campo`;
  private apiUrlPostVenta = `${this.baseUrl}/postVenta`;
  private apiUrlpvCobranza = `${this.baseUrl}/pvCobranza`;
  private apiUrlpvControlInterno = `${this.baseUrl}/pvControlInterno`;
  private apiUrlpvCreditos = `${this.baseUrl}/pvCreditos`;
  private apiUrlpvLogistica = `${this.baseUrl}/pvLogistica`;
  private apiUrlpvOperaciones = `${this.baseUrl}/pvOperaciones`;
  private apiUrlpvServicioTecnico = `${this.baseUrl}/pvServicioTecnico`;
  private apiUrlpvVentas = `${this.baseUrl}/pvVentas`;
  private apiUrlKOMMO = `${this.baseUrl}/kommo`;
  private apiUrlFerre = `${this.baseUrl}/ferre`; // formulario de gestión de Ferreñafe
  private apiUrlSedes = `${this.baseUrl}/sedes`;
  private apiUrlCapSedes = `${this.baseUrl}/capSedes`; // CAP de asesores por sede (hoja CAP)

  constructor(private http: HttpClient) { }

  // Gestión Call/Realzza/KOMMO: TODA la gestión se lee ahora de la BD (tablas
  // gestion_call/gestion_realzza/gestion_kommo), no del Google Sheet. Estos métodos
  // quedan como alias que delegan en los de BD (mismas cabeceras → drop-in para
  // los 11 consumidores: cierre, control-supervisor, maduración, mi-panel, etc.).
  getSheetData(): Observable<any[]> {
    return this.getGestionCall();
  }

  getSheetDataCampo(): Observable<any[]> {
    return this.getGestionRealzza();
  }

  // 🆕 Gestión KOMMO desde PostgreSQL (tabla gestion_kommo, en gestion-service).
  // ?shape=sheet devuelve las mismas cabeceras del sheet KOMMO → drop-in de getSheetKOMMO().
  getGestionKommo(rango?: { desde?: Date; hasta?: Date; leadMes?: number; leadAnio?: number }): Observable<any[]> {
    let params = new HttpParams().set('shape', 'sheet');
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    if (rango?.leadMes) params = params.set('leadMes', rango.leadMes);   // filtra por FECHA DE LEAD ASIGNADO (Embudos)
    if (rango?.leadAnio) params = params.set('leadAnio', rango.leadAnio);
    return this.http.get<any[]>(`${environment.gestionBase || environment.apiBase}/gestion-kommo`, { params });
  }

  /** Cruce por DNI en SQL (Maduración): { <dni>: ym } con el lead más antiguo por DNI. */
  leadMatchKommo(canal: 'LEONCITO' | 'REALZZA', soloMP: boolean, dnis: string[]): Observable<Record<string, number>> {
    return this.http.post<Record<string, number>>(
      `${environment.gestionBase || environment.apiBase}/gestion-kommo/lead-match`, { canal, soloMP, dnis });
  }

  // 🆕 Gestión Realzza desde PostgreSQL (reemplaza el Google Form de campo).
  // Devuelve las MISMAS cabeceras que la hoja, así que es drop-in de getSheetDataCampo().
  getGestionRealzza(rango?: { desde?: Date; hasta?: Date }): Observable<any[]> {
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    return this.http.get<any[]>(`${environment.apiBase}/gestion-realzza`, { params });
  }

  // 🆕 Gestión Call Center desde PostgreSQL (reemplaza el Google Form de call).
  // Drop-in de getSheetData() / getSheetDataCallRango(): mismas cabeceras de la hoja.
  getGestionCall(rango?: { desde?: Date; hasta?: Date }): Observable<any[]> {
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    return this.http.get<any[]>(`${environment.apiBase}/gestion-call`, { params });
  }

  // ── Editar / eliminar gestiones (por id) ──
  updateGestionRealzza(id: number, body: any): Observable<any> {
    return this.http.put(`${environment.apiBase}/gestion-realzza/${id}`, body);
  }
  deleteGestionRealzza(id: number): Observable<any> {
    return this.http.delete(`${environment.apiBase}/gestion-realzza/${id}`);
  }
  updateGestionCall(id: number, body: any): Observable<any> {
    return this.http.put(`${environment.apiBase}/gestion-call/${id}`, body);
  }
  deleteGestionCall(id: number): Observable<any> {
    return this.http.delete(`${environment.apiBase}/gestion-call/${id}`);
  }

  // ── Match de ventas (Excel) con la última gestión por DNI ──
  // Devuelve { <dni>: { asesor, tipo_cliente|tipo_base, sede, ... } }.
  matchGestionCall(dnis: string[]): Observable<Record<string, any>> {
    return this.http.post<Record<string, any>>(`${environment.apiBase}/gestion-call/match`, { dnis });
  }
  matchGestionRealzza(dnis: string[]): Observable<Record<string, any>> {
    return this.http.post<Record<string, any>>(`${environment.apiBase}/gestion-realzza/match`, { dnis });
  }

  // Variantes con rango de fechas (mes) para no traer todo el histórico (usadas por Embudos).
  getSheetDataCallRango(rango?: { desde?: Date; hasta?: Date }): Observable<any[]> {
    return this.getGestionCall(rango);
  }
  getSheetDataCampoRango(rango?: { desde?: Date; hasta?: Date }): Observable<any[]> {
    return this.getGestionRealzza(rango);
  }
  getSheetKOMMORango(rango?: { desde?: Date; hasta?: Date }): Observable<any[]> {
    return this.getGestionKommo(rango);
  }

  private rangoParams(rango?: { desde?: Date; hasta?: Date }): HttpParams {
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    return params;
  }

  getSheetDataPostVenta(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlPostVenta);
  }

  getSheetDataPcCobranza(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvCobranza);
  }

  getSheetDataPcControlInterno(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvControlInterno);
  }

  getSheetDataPcCreditos(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvCreditos);
  }

  getSheetDataPcLogistica(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvLogistica);
  }

  getSheetDataPcOperaciones(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvOperaciones);
  }

  getSheetDataPcServicioTecnico(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvServicioTecnico);
  }

  getSheetDataPcVentas(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvVentas);
  }

  getSheetKOMMO(): Observable<any[]> {
    return this.getGestionKommo();
  }

  getSheetDataBySede(endpointKey: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/${endpointKey}`);
  }

  // 🏬 Sheet unificado de gestión de todas las sedes.
  // Acepta rango de fechas opcional para NO traer todo el histórico (el sheet es enorme).
  // Ej.: getSheetDataSedes({ desde: date1, hasta: date2 }) → ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
  getSheetDataSedes(rango?: { desde?: Date; hasta?: Date }): Observable<any[]> {
    let params = new HttpParams();
    const d = rango?.desde ? this.fechaISO(rango.desde) : '';
    const h = rango?.hasta ? this.fechaISO(rango.hasta) : '';
    if (d) params = params.set('desde', d);
    if (h) params = params.set('hasta', h);
    // Caché corta (30s): al navegar entre módulos no re-consulta; el refresco
    // automático (cada 5 min) y "Actualizar" tras 30s sí traen datos frescos.
    return this.cache.getOrFetch(`sedes:${d}:${h}`,
      () => this.http.get<any[]>(this.apiUrlSedes, { params }), 30000);
  }

  private fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 🏬 Gestión de sedes desde la BD (tabla gestion, gestion-service). Fuente única:
  // formulario sincronizado + registro por plataforma (Ferreñafe). Se mapea a la MISMA
  // forma que la hoja para que Control Gestión Sede no cambie su lógica.
  private mapGestionDbToSheet = (r: any) => ({
    id: r.id,
    'Marca temporal': r.marca,
    'TIENDA SEDE': r.sede,
    'ASESOR': r.asesor,
    'TIPO DE GESTION': r.tipo_gestion,
    'RESULTADO DE GESTION': r.resultado,
    'DNI CLIENTE': r.dni_cliente,
    'MOTIVOS "CONTACTO EN LA GESTION"': r.motivo_contacto,
    'MOTIVOS "NO CONTACTO EN LA GESTION"': r.motivo_no_contacto,
    'FECHA DE COMPROMISO O VISITA': r.fecha_compromiso,
    'VALOR DE LA VENTA': r.valor_venta,
    'PRODUCTO DE INTERES': r.producto_interes,
    'DETALLE(COMENTARIO) CONTACTO': r.detalle_contacto,
    'N° CELULAR ACTUALIZADO': r.celular_actualizado,
    _origen: r.origen,
  });
  getGestionSedesDB(rango?: { desde?: Date; hasta?: Date }): Observable<any[]> {
    const base = environment.gestionBase || environment.apiBase;
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    return this.http.get<any[]>(`${base}/gestion`, { params }).pipe(map(rows => (rows || []).map(this.mapGestionDbToSheet)));
  }
  /** Copia al BD lo NUEVO del formulario de sedes (botón "Sincronizar"). Opcional: acotar
   *  por rango (recomendado: el día que se ve) → mucho más rápido que releer todo. */
  sincronizarGestionSedes(rango?: { desde?: Date; hasta?: Date }): Observable<{ success: boolean; leidas: number; insertados: number; duplicados: number }> {
    const base = environment.gestionBase || environment.apiBase;
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    return this.http.post<any>(`${base}/gestion/sync-sedes`, {}, { params });
  }
  /** Mapea una fila con forma de sheet → columnas de la tabla gestion (para editar). */
  private mapSheetToGestionDb(d: any) {
    return {
      dni_cliente: d['DNI CLIENTE'], sede: d['TIENDA SEDE'], asesor: d['ASESOR'],
      tipo_gestion: d['TIPO DE GESTION'], resultado: d['RESULTADO DE GESTION'],
      motivo_contacto: d['MOTIVOS "CONTACTO EN LA GESTION"'], motivo_no_contacto: d['MOTIVOS "NO CONTACTO EN LA GESTION"'],
      producto_interes: d['PRODUCTO DE INTERES'], detalle_contacto: d['DETALLE(COMENTARIO) CONTACTO'],
      celular_actualizado: d['N° CELULAR ACTUALIZADO'], valor_venta: d['VALOR DE LA VENTA'],
      fecha_compromiso: d['FECHA DE COMPROMISO O VISITA'],
    };
  }
  /** Edita una gestión de sede (tabla gestion). */
  updateGestionSede(id: number, sheetRow: any): Observable<any> {
    const base = environment.gestionBase || environment.apiBase;
    return this.http.put(`${base}/gestion/${id}`, this.mapSheetToGestionDb(sheetRow));
  }
  /** Elimina una gestión de sede (tabla gestion). */
  deleteGestionSede(id: number): Observable<any> {
    const base = environment.gestionBase || environment.apiBase;
    return this.http.delete(`${base}/gestion/${id}`);
  }

  // 📞 CALL SEDES / MARKET PLACE (tabla gestion_call_sedes). Mapea a la forma del sheet
  // "ferre" (incluida la columna dinámica ASESOR {SEDE} que usa control-call-sedes).
  private mapCallSedeDbToSheet = (r: any) => {
    const o: any = {
      id: r.id, 'Marca temporal': r.marca, 'SEDE': r.sede, 'MARKET PLACE': r.market_place,
      'DNI CLIENTE': r.dni_cliente, 'CELULAR GESTIONADO': r.celular_gestionado, 'TIPO DE CLIENTE': r.tipo_cliente,
      'ESTADO DE GESTIÓN': r.estado_gestion, 'MEDIO DE PRIMER CONTACTO': r.medio_primer_contacto,
      'RESULTADO DE GESTIÓN': r.resultado_gestion, 'PRODUCTO INTERÉS': r.producto_interes,
      'MOTIVO INTERÉS': r.motivo_interes, 'MOTIVO DE NO CIERRE': r.motivo_no_cierre,
      'COMENTARIO VENTA NO CONCRETADA': r.comentario_venta_no_concretada, 'ASESOR': r.asesor,
      _origen: r.origen,
    };
    if (r.sede) o['ASESOR ' + r.sede.toString().toUpperCase()] = r.asesor;
    return o;
  };
  getCallSedesDB(rango?: { desde?: Date; hasta?: Date }, asesor?: string): Observable<any[]> {
    const base = environment.gestionBase || environment.apiBase;
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    if (asesor) params = params.set('asesor', asesor);
    return this.http.get<any[]>(`${base}/call-sedes`, { params }).pipe(map(rows => (rows || []).map(this.mapCallSedeDbToSheet)));
  }
  /** Derivaciones (tabla gestion_sedes_deriv) por asesor/sede/rango — para Mi Panel. */
  getDerivacionesDB(rango?: { desde?: Date; hasta?: Date }, asesor?: string, sede?: string): Observable<any[]> {
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    if (asesor) params = params.set('asesor', asesor);
    if (sede) params = params.set('sede', sede);
    return this.http.get<any[]>(`${environment.apiBase}/gestion-sedes-deriv`, { params });
  }
  /** Copia al BD lo NUEVO del formulario call-sedes (botón "Sincronizar"). */
  sincronizarCallSedes(rango?: { desde?: Date; hasta?: Date }): Observable<{ success: boolean; leidas: number; insertados: number; duplicados: number }> {
    const base = environment.gestionBase || environment.apiBase;
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    return this.http.post<any>(`${base}/call-sedes/sync`, {}, { params });
  }

  // 📞 Formulario de gestión de Ferreñafe (contacto / no contacto)
  getSheetDataFerre(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlFerre);
  }

  // 👥 CAP de asesores por sede (hoja "CAP") — LEGADO. Se conserva como fallback
  // mientras la tabla cap_asesores no esté migrada.
  getSheetDataCapSedes(): Observable<any[]> {
    return this.cache.getOrFetch('capSedes',
      () => this.http.get<any[]>(this.apiUrlCapSedes), 5 * 60 * 1000);
  }

  // 👥 CAP desde la BD (tabla cap_asesores, editable). Fuente principal del CapSedesService.
  getCap(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiBase}/cap`);
  }
}
