import { Injectable, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from './service-google.service';
import { SedeConfigService } from './sede-config.service';

export interface CapRow {
  vendedor: string;   // nombre tal cual la hoja CAP (correcto)
  sede: string;       // texto original de la columna SEDE
  sedeKey: string;    // sede normalizada (ascii)
  supervisor: string;
  gerente: string;
  zona: string;
  canal: string;      // tipo de campaña / canal (RECP..., CAMPAÑA 1, CAMPAÑA 2)
  estado: string;     // ACTIVO / RENUNCIA
  tipoAv: string;     // RECEPTIVO / CAMPAÑERO
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

  private cache: CapRow[] | null = null;
  private cargando: Promise<CapRow[]> | null = null;

  /** Carga (una sola vez) y cachea el CAP. */
  async cargar(): Promise<CapRow[]> {
    if (this.cache) return this.cache;
    if (!this.cargando) {
      this.cargando = lastValueFrom(this.sheets.getSheetDataCapSedes())
        .then(data => (this.cache = this.parse(data)))
        .catch(() => (this.cache = []));
    }
    return this.cargando;
  }

  /** Fuerza recarga en la próxima llamada. */
  invalidar(): void { this.cache = null; this.cargando = null; }

  private parse(data: any[]): CapRow[] {
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
        tipoAv: (r['TIPO AV'] ?? '').toString().trim().toUpperCase(),
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
