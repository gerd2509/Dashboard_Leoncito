import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom, timeout, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SheetsService } from './service-google.service';
import { SedeConfigService } from './sede-config.service';

export interface CapRow {
  id?: number;        // PK en la tabla cap_asesores (para editar/eliminar)
  vendedor: string;   // nombre tal cual la hoja CAP (correcto)
  sede: string;       // texto original de la columna SEDE
  sedeKey: string;    // sede normalizada (ascii)
  supervisor: string;
  gerente: string;
  zona: string;
  canal: string;      // tipo de campaña / canal (RECP..., CAMPAÑA 1, CAMPAÑA 2)
  estado: string;     // ACTIVO / RENUNCIA
  dni: string;        // DNI del asesor (reemplazó a la antigua columna "TIPO AV")
}

/**
 * Fuente única de la CAP de asesores por sede (hoja "CAP" del sheet cap-sedes).
 * Cachea la data y ofrece los vendedores ACTIVOS por sede y por canal, para que
 * control-gestion-sede, control-call-sedes y pizarra-metas usen los nombres
 * correctos sin hardcodear listas.
 */
@Injectable({ providedIn: 'root' })
export class CapSedesService {
  private sheets = inject(SheetsService);
  private sedeCfg = inject(SedeConfigService);
  private http = inject(HttpClient);
  private capUrl = `${environment.apiBase}/cap`;

  private cache: CapRow[] | null = null;
  private cargando: Promise<CapRow[]> | null = null;
  error = false;  // true si la última carga falló (para mostrar "Reintentar")

  /**
   * Carga (una sola vez) y cachea el CAP. Fuente principal = tabla cap_asesores (GET /cap);
   * si aún no está migrada (vacía) o falla, cae a la hoja "CAP" (legado). Timeout 20s.
   */
  async cargar(): Promise<CapRow[]> {
    if (this.cache) return this.cache;
    if (!this.cargando) {
      this.error = false;
      this.cargando = lastValueFrom(this.sheets.getCap().pipe(timeout(20000)))
        .then(async data => {
          const db = this.parseDB(data);
          if (db.length) return (this.cache = db);
          return (this.cache = await this.desdeHoja());   // tabla vacía → fallback hoja
        })
        .catch(async err => {
          console.error('❌ CAP /cap falló, uso la hoja (legado):', err);
          try { return (this.cache = await this.desdeHoja()); }
          catch (e2) { this.error = true; this.cargando = null; return []; }
        });
    }
    return this.cargando;
  }

  /** Fuerza recarga en la próxima llamada (usar tras editar el CAP en el Maestro). */
  invalidar(): void { this.cache = null; this.cargando = null; }

  // ── CRUD para el módulo "Maestro CAP" (admin) ──────────────────────────────
  /** Lista SIEMPRE fresca desde la BD (para la grilla editable). */
  async listarFresco(): Promise<CapRow[]> {
    const data = await lastValueFrom(this.sheets.getCap().pipe(timeout(20000)));
    return this.parseDB(data);
  }
  crear(row: Partial<CapRow>): Observable<{ success: boolean; id: number }> {
    return this.http.post<{ success: boolean; id: number }>(this.capUrl, row);
  }
  actualizar(id: number, row: Partial<CapRow>): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.capUrl}/${id}`, row);
  }
  eliminar(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.capUrl}/${id}`);
  }
  /** Catálogos para el formulario: sedes(→gerente/zona), supervisores por sede, canales. */
  meta(): Observable<{ sedes: { sede: string; gerente: string; zona: string }[]; supervisores: { id: number; sede: string; nombre: string }[]; canales: string[] }> {
    return this.http.get<any>(`${this.capUrl}/meta`);
  }

  // ── Maestro de SEDES (gerente/zona por sede) ───────────────────────────────
  listarSedes(): Observable<{ id: number; nombre: string; gerente: string; zona: string }[]> {
    return this.http.get<any[]>(`${this.capUrl}/sedes`);
  }
  crearSede(s: { nombre: string; gerente?: string; zona?: string }): Observable<{ success: boolean; id: number }> {
    return this.http.post<any>(`${this.capUrl}/sedes`, s);
  }
  actualizarSede(id: number, s: any): Observable<{ success: boolean }> {
    return this.http.put<any>(`${this.capUrl}/sedes/${id}`, s);
  }
  eliminarSede(id: number): Observable<{ success: boolean }> {
    return this.http.delete<any>(`${this.capUrl}/sedes/${id}`);
  }

  // ── Maestro de SUPERVISORES (por sede) ─────────────────────────────────────
  listarSupervisores(sede?: string): Observable<{ id: number; nombre: string; sede: string }[]> {
    const q = sede ? `?sede=${encodeURIComponent(sede)}` : '';
    return this.http.get<any[]>(`${this.capUrl}/supervisores${q}`);
  }
  crearSupervisor(s: { nombre: string; sede?: string }): Observable<{ success: boolean; id: number }> {
    return this.http.post<any>(`${this.capUrl}/supervisores`, s);
  }
  actualizarSupervisor(id: number, s: any): Observable<{ success: boolean }> {
    return this.http.put<any>(`${this.capUrl}/supervisores/${id}`, s);
  }
  eliminarSupervisor(id: number): Observable<{ success: boolean }> {
    return this.http.delete<any>(`${this.capUrl}/supervisores/${id}`);
  }

  // ── Maestro de GERENTES (se eligen al editar una sede) ─────────────────────
  listarGerentes(): Observable<{ id: number; nombre: string }[]> {
    return this.http.get<any[]>(`${this.capUrl}/gerentes`);
  }
  crearGerente(nombre: string): Observable<{ success: boolean; id: number }> {
    return this.http.post<any>(`${this.capUrl}/gerentes`, { nombre });
  }
  actualizarGerente(id: number, nombre: string): Observable<{ success: boolean }> {
    return this.http.put<any>(`${this.capUrl}/gerentes/${id}`, { nombre });
  }
  eliminarGerente(id: number): Observable<{ success: boolean }> {
    return this.http.delete<any>(`${this.capUrl}/gerentes/${id}`);
  }

  private async desdeHoja(): Promise<CapRow[]> {
    const hoja = await lastValueFrom(this.sheets.getSheetDataCapSedes().pipe(timeout(20000)));
    return this.parseHoja(hoja);
  }

  /** Filas de la tabla cap_asesores (columnas en minúscula + id). */
  private parseDB(data: any[]): CapRow[] {
    return (data || [])
      .map(r => ({
        id: r.id,
        vendedor: (r.vendedor ?? '').toString().trim(),
        sede: (r.sede ?? '').toString().trim(),
        sedeKey: this.sedeCfg.normalizar(r.sede ?? ''),
        supervisor: (r.supervisor ?? '').toString().trim(),
        gerente: (r.gerente ?? '').toString().trim(),
        zona: (r.zona ?? '').toString().trim().toUpperCase(),
        canal: (r.canal ?? '').toString().trim().toUpperCase(),
        estado: (r.estado ?? '').toString().trim().toUpperCase(),
        dni: (r.dni ?? '').toString().trim(),
      }))
      .filter(r => r.vendedor);
  }

  /** Filas de la hoja "CAP" (cabeceras en MAYÚSCULA) — fallback legado. */
  private parseHoja(data: any[]): CapRow[] {
    return (data || [])
      .map(r => ({
        vendedor: (r['VENDEDOR'] ?? '').toString().trim(),
        sede: (r['SEDE'] ?? '').toString().trim(),
        sedeKey: this.sedeCfg.normalizar(r['SEDE'] ?? ''),
        supervisor: (r['SUPERVISOR'] ?? '').toString().trim(),
        gerente: (r['GERENTE DE TIENDA'] ?? '').toString().trim(),
        zona: (r['ZONA'] ?? '').toString().trim().toUpperCase(),
        canal: (r['CANAL'] ?? '').toString().trim().toUpperCase(),
        estado: (r['ESTADO'] ?? '').toString().trim().toUpperCase(),
        dni: (r['DNI'] ?? '').toString().trim(),
      }))
      .filter(r => r.vendedor);
  }

  /** Filas ACTIVAS de una sede (por defecto solo ESTADO = ACTIVO). */
  async filasSede(sedeKey: string, soloActivos = true): Promise<CapRow[]> {
    const rows = await this.cargar();
    const key = this.sedeCfg.normalizar(sedeKey);
    return rows.filter(r => r.sedeKey === key && (!soloActivos || r.estado === 'ACTIVO'));
  }

  /** Nombres (en mayúsculas) de los vendedores activos de una sede. */
  async vendedoresActivos(sedeKey: string): Promise<string[]> {
    const filas = await this.filasSede(sedeKey, true);
    return Array.from(new Set(filas.map(r => r.vendedor.toUpperCase()))).sort();
  }

  /** Mapa vendedor(UPPER) → supervisor, para una sede (solo activos). */
  async supervisoresPorVendedor(sedeKey: string): Promise<Map<string, string>> {
    const filas = await this.filasSede(sedeKey, true);
    const m = new Map<string, string>();
    for (const r of filas) {
      const nom = r.vendedor.toUpperCase();
      if (!m.has(nom)) m.set(nom, (r.supervisor || 'SIN SUPERVISOR').toUpperCase());
    }
    return m;
  }

  /** Vendedores activos de una sede agrupados por CANAL, en orden (RECP... primero). */
  async vendedoresPorCanal(sedeKey: string): Promise<{ canal: string; vendedores: string[] }[]> {
    const filas = await this.filasSede(sedeKey, true);
    const map = new Map<string, string[]>();
    for (const r of filas) {
      const canal = r.canal || 'SIN CANAL';
      if (!map.has(canal)) map.set(canal, []);
      const arr = map.get(canal)!;
      const nom = r.vendedor.toUpperCase();
      if (!arr.includes(nom)) arr.push(nom);
    }
    map.forEach(arr => arr.sort());
    return Array.from(map.entries())
      .map(([canal, vendedores]) => ({ canal, vendedores }))
      .sort((a, b) => this.ordenCanal(a.canal) - this.ordenCanal(b.canal) || a.canal.localeCompare(b.canal));
  }

  // Los canales receptivos (RECP/RECEP) van primero; luego campañas; luego el resto.
  private ordenCanal(canal: string): number {
    const c = canal.toUpperCase();
    if (c.includes('RECP') || c.includes('RECEP')) return 0;
    if (c.includes('CAMPA')) return 1;
    return 2;
  }
}
