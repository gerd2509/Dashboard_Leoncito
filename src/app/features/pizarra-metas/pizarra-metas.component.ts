import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { lastValueFrom } from 'rxjs';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';

// Definición de una columna editable de la tabla.
interface Col { key: string; label: string; tipo: 'num' | 'text'; }

// Una fila = un asesor con su canal (grupo) y todos sus valores editables.
interface Fila {
  asesor: string;
  canal: string;
  vals: Record<string, number | string>;
}

// Cabecera con los KPI de tienda (tarjetas superiores).
interface Cabecera {
  meta: number; avance: number;
  ticketPromedio: number; operaciones: number;
  margen: number; capActual: number; capAprobado: number;
  incautaciones: number; notasCredito: number;
}

// Lo que se guarda por sede + fecha (valores por asesor + cabecera).
interface Board { cabecera: Cabecera; vals: Record<string, Record<string, number | string>>; }

const STORAGE_KEY = 'gd_pizarra_v2';

@Component({
  selector: 'app-pizarra-metas',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, MatIconModule],
  templateUrl: './pizarra-metas.component.html',
  styleUrls: ['./pizarra-metas.component.css'],
})
export class PizarraMetasComponent implements OnInit {
  private auth = inject(AuthService);
  private sedeConfig = inject(SedeConfigService);
  private cap = inject(CapSedesService);
  private ventasSvc = inject(CargaVentasService);

  // KPIs (Avance/Operaciones/Ticket) calculados desde PostgreSQL.
  cargandoVentas = false;

  // ── Selección de sede ──
  esGlobal = false;
  sedeForzada = '';
  sedeSeleccionada = '';
  sedesDisponibles: { key: string; nombre: string }[] = [];

  // ── Fecha de la pizarra ──
  fecha: Date = new Date();

  // ── Estado del tablero ──
  cargando = false;
  cabecera: Cabecera = this.cabeceraVacia();
  filas: Fila[] = [];
  canales: string[] = [];      // grupos (canales del CAP) presentes
  guardadoEn = '';

  // ── Definición de columnas por banda ──
  readonly colsMeta: Col[] = [
    { key: 'metaRetail', label: 'Retail', tipo: 'num' },
    { key: 'metaMelamina', label: 'Melamina', tipo: 'num' },
    { key: 'metaAfiliaciones', label: 'Afiliaciones', tipo: 'num' },
  ];
  readonly colsAvance: Col[] = [
    { key: 'avRetail', label: 'Retail', tipo: 'num' },
    { key: 'avMelamina', label: 'Melamina', tipo: 'num' },
    { key: 'avAfiliaciones', label: 'Afiliaciones', tipo: 'num' },
  ];
  readonly colsCalidad: Col[] = [
    { key: 'calIniciales', label: 'Iniciales', tipo: 'num' },
    { key: 'cal3pc', label: '3pc', tipo: 'num' },
  ];
  readonly colsInv: Col[] = [
    { key: 'invIniciales', label: 'Iniciales', tipo: 'num' },
    { key: 'invMonto', label: 'Monto', tipo: 'num' },
    { key: 'invProducto', label: 'Producto', tipo: 'text' },
    { key: 'invZona', label: 'Zona', tipo: 'text' },
  ];

  get todasCols(): Col[] {
    return [...this.colsMeta, ...this.colsAvance, ...this.colsCalidad, ...this.colsInv];
  }
  get colsNum(): Col[] {
    return this.todasCols.filter(c => c.tipo === 'num');
  }

  async ngOnInit(): Promise<void> {
    const u = this.auth.getUsuario();
    this.esGlobal = !u || u.rol === 'admin' || u.sede.toLowerCase() === 'todas';

    if (this.esGlobal) {
      this.sedesDisponibles = this.sedeConfig.getSedesParaCombo()
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      this.sedeSeleccionada = this.sedesDisponibles[0]?.key ?? '';
    } else if (u) {
      this.sedeForzada = this.sedeConfig.normalizar(u.sede);
      this.sedeSeleccionada = this.sedeForzada;
      const cfg = this.sedeConfig.getConfig(this.sedeForzada);
      this.sedesDisponibles = [{ key: this.sedeForzada, nombre: cfg?.nombre ?? u.sede }];
    }

    await this.cap.cargar();
    await this.cargar();
  }

  get nombreSedeActual(): string {
    return this.sedeConfig.getConfig(this.sedeSeleccionada)?.nombre ?? this.sedeSeleccionada;
  }

  onSedeChanged(): void { this.cargar(); }
  onFechaChanged(): void { this.cargar(); }

  get capError(): boolean { return this.cap.error; }
  async reintentar(): Promise<void> {
    this.cap.invalidar();
    await this.cap.cargar();
    await this.cargar();
  }

  // ── Persistencia ──
  private claveActual(): string {
    return `${this.sedeSeleccionada}|${this.fechaISO()}`;
  }
  private fechaISO(): string {
    const f = this.fecha;
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  }
  private leerStore(): Record<string, Board> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { }
    return {};
  }

  /** Construye las filas desde el CAP (vendedores ACTIVOS por canal) y las hidrata
   *  con los valores guardados de esta sede+fecha. */
  async cargar(): Promise<void> {
    if (!this.sedeSeleccionada) return;
    this.cargando = true;
    try {
      const board = this.leerStore()[this.claveActual()];
      // Si ya hay datos guardados se usan; si no, se aplican las metas fijas por sede.
      this.cabecera = board?.cabecera ? { ...this.cabeceraVacia(), ...board.cabecera } : this.cabeceraDefault(this.sedeSeleccionada);
      const guardado = board?.vals ?? {};

      const grupos = await this.cap.vendedoresPorCanal(this.sedeSeleccionada);
      this.canales = grupos.map(g => g.canal);

      const filas: Fila[] = [];
      for (const g of grupos) {
        for (const asesor of g.vendedores) {
          const vals = { ...this.valsVacios(), ...(guardado[asesor] ?? {}) };
          filas.push({ asesor, canal: g.canal, vals });
        }
      }
      this.filas = filas;
      this.guardadoEn = board ? 'Cargado' : '';

      // KPIs de tienda (Avance/Operaciones/Ticket) desde las ventas en PostgreSQL.
      await this.aplicarKpisVentas();
    } finally {
      this.cargando = false;
    }
  }

  /**
   * Calcula Avance, Operaciones, Ticket Promedio y Notas de Crédito desde las
   * ventas en PostgreSQL para la sede seleccionada, ACUMULADO del mes hasta la
   * fecha elegida. Incautaciones NO se calcula (se mantiene manual).
   * NO calcula Margen (la fuente no tiene costo) → sigue siendo editable.
   */
  private ventasMesCache: any[] = [];
  private mesCacheKey = '';
  private margenMesCache: any[] = [];
  private margenCacheKey = '';

  private async aplicarKpisVentas(): Promise<void> {
    if (!this.sedeSeleccionada) return;
    const anio = this.fecha.getFullYear();
    const mes = this.fecha.getMonth() + 1;
    const diaTope = this.fecha.getDate();
    const key = `${anio}-${mes}`;
    this.cargandoVentas = true;
    try {
      // El endpoint (con mes) trae ventas del mes por CV + afectaciones (NC/INC)
      // por AF de ese mes. Cacheamos por año-mes para no re-descargar al cambiar
      // de sede o de día.
      if (key !== this.mesCacheKey) {
        this.ventasMesCache = (await lastValueFrom(this.ventasSvc.obtenerVentas(anio, { mes }))) || [];
        this.mesCacheKey = key;
      }

      let avanceBruto = 0, ops = 0, notasCredito = 0;
      for (const r of this.ventasMesCache) {
        if (this.sedeKeyDe(r.sede) !== this.sedeSeleccionada) continue;
        const estado = (r.estado_venta || '').toString().trim().toUpperCase();
        const monto = Number(r.monto_consolidado) || 0;

        // Notas de Crédito: se atribuyen por su fecha de AFECTACIÓN (AF); si no
        // tiene AF, por la de venta (CV). Acumulado hasta el día seleccionado.
        if (estado.includes('NOTA DE CR')) {
          const usaAf = Number(r.anio_af) > 0 && Number(r.mes_af) > 0;
          const a = usaAf ? Number(r.anio_af) : Number(r.anio_cv);
          const m = usaAf ? Number(r.mes_af) : Number(r.mes_cv);
          const d = usaAf ? Number(r.dia_af) : Number(r.dia_cv);
          if (a === anio && m === mes && d <= diaTope) notasCredito += Math.abs(monto);
          continue;
        }
        if (estado.includes('INCAUTAC')) continue;               // no se mapea aún

        // Ventas (avance/operaciones): por fecha de venta (CV), hasta la fecha.
        if (Number(r.anio_cv) !== anio || Number(r.mes_cv) !== mes) continue;
        if (Number(r.dia_cv) > diaTope) continue;
        if (monto <= 0) continue;
        avanceBruto += monto; ops++;
      }

      // Avance = monto NETO (ventas − notas de crédito). Incautaciones se
      // incluirán después. Ticket Promedio se mantiene sobre el bruto.
      this.cabecera.avance = Math.round(avanceBruto - notasCredito);
      this.cabecera.operaciones = ops;
      this.cabecera.ticketPromedio = ops > 0 ? Math.round(avanceBruto / ops) : 0;
      this.cabecera.notasCredito = Math.round(notasCredito);

      // Margen % desde margen_ventas (Σ margen / Σ valor venta), por sede,
      // acumulado del mes hasta la fecha.
      if (key !== this.margenCacheKey) {
        this.margenMesCache = (await lastValueFrom(this.ventasSvc.obtenerMargen(anio, { mes }))) || [];
        this.margenCacheKey = key;
      }
      let sumMargen = 0, sumValor = 0;
      for (const r of this.margenMesCache) {
        if (this.sedeKeyDe(r.sede) !== this.sedeSeleccionada) continue;
        const fstr = (r.fecha || '').toString().slice(0, 10);      // YYYY-MM-DD
        const [fy, fm, fd] = fstr.split('-').map((n: string) => Number(n));
        if (fy !== anio || fm !== mes || fd > diaTope) continue;
        sumMargen += Number(r.margen_total) || 0;
        sumValor += Number(r.valor_venta) || 0;
      }
      this.cabecera.margen = sumValor > 0 ? Math.round((sumMargen / sumValor) * 1000) / 10 : 0;
    } catch (e) {
      console.error('❌ Pizarra: no se pudieron traer las ventas:', e);
    } finally {
      this.cargandoVentas = false;
    }
  }

  /** "SEDE RELENOR CAYALTI" → clave normalizada ("cayalti") para cruzar con la sede seleccionada. */
  private sedeKeyDe(sedeRaw: string): string {
    const limpio = (sedeRaw || '').toString().replace(/^\s*SEDE\s+RELENOR\s+/i, '').trim();
    return this.sedeConfig.normalizar(limpio);
  }

  persistir(): void {
    if (!this.sedeSeleccionada) return;
    const vals: Record<string, Record<string, number | string>> = {};
    this.filas.forEach(f => { vals[f.asesor] = f.vals; });
    const store = this.leerStore();
    store[this.claveActual()] = { cabecera: this.cabecera, vals };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    this.guardadoEn = 'Guardado ' + new Date().toLocaleTimeString('es-PE');
  }

  limpiar(): void {
    if (!confirm('¿Borrar los datos ingresados de esta sede y fecha? (los asesores se mantienen)')) return;
    this.cabecera = this.cabeceraVacia();
    this.filas.forEach(f => (f.vals = this.valsVacios()));
    this.persistir();
  }

  private valsVacios(): Record<string, number | string> {
    const v: Record<string, number | string> = {};
    this.todasCols.forEach(c => (v[c.key] = c.tipo === 'num' ? 0 : ''));
    return v;
  }

  // ── Agrupación para el template ──
  filasDeGrupo(canal: string): Fila[] {
    return this.filas.filter(f => f.canal === canal);
  }
  gruposConFilas(): string[] {
    return this.canales.filter(c => this.filasDeGrupo(c).length > 0);
  }

  // ── Totales / avance ──
  totalCol(key: string, filas: Fila[]): number {
    return filas.reduce((s, f) => s + (Number(f.vals[key]) || 0), 0);
  }
  avanceFila(f: Fila): number {
    const meta = this.colsMeta.reduce((s, c) => s + (Number(f.vals[c.key]) || 0), 0);
    const avance = this.colsAvance.reduce((s, c) => s + (Number(f.vals[c.key]) || 0), 0);
    return meta > 0 ? Math.round((avance / meta) * 100) : 0;
  }
  claseAvance(f: Fila): string {
    const p = this.avanceFila(f);
    if (p >= 100) return 'av-ok';
    if (p >= 60) return 'av-medio';
    if (p > 0) return 'av-bajo';
    return '';
  }

  // ── Exportar a Excel ──
  async exportar(): Promise<void> {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Pizarra');

    ws.addRow([`PIZARRA DE METAS — ${this.nombreSedeActual.toUpperCase()}  |  ${this.fechaISO()}`]);
    ws.addRow([]);
    ws.addRow([
      'META', this.cabecera.meta, 'TICKET PROM.', this.cabecera.ticketPromedio,
      'MARGEN %', this.cabecera.margen, 'INCAUTACIONES', this.cabecera.incautaciones,
    ]);
    ws.addRow([
      'AVANCE', this.cabecera.avance, 'OPERACIONES', this.cabecera.operaciones,
      'CAP ACT/APR', `${this.cabecera.capActual}/${this.cabecera.capAprobado}`,
      'NOTAS CRÉDITO', this.cabecera.notasCredito,
    ]);
    ws.addRow([]);

    ws.addRow([
      'CANAL', 'ASESOR',
      'META Retail', 'META Melamina', 'META Afiliaciones',
      'AVANCE Retail', 'AVANCE Melamina', 'AVANCE Afiliaciones',
      'CAL Iniciales', 'CAL 3pc',
      'INV Iniciales', 'INV Monto', 'INV Producto', 'INV Zona', '% Avance',
    ]);

    this.filas.forEach(f => {
      ws.addRow([
        f.canal, f.asesor,
        ...this.colsMeta.map(c => f.vals[c.key]),
        ...this.colsAvance.map(c => f.vals[c.key]),
        ...this.colsCalidad.map(c => f.vals[c.key]),
        ...this.colsInv.map(c => f.vals[c.key]),
        this.avanceFila(f) + '%',
      ]);
    });

    const headerRow = ws.getRow(6);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.columns.forEach(col => { col.width = 16; });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    FileSaver.saveAs(blob, `Pizarra_${this.nombreSedeActual}_${this.fechaISO()}.xlsx`);
  }

  // ── Helpers ──
  private cabeceraVacia(): Cabecera {
    return {
      meta: 0, avance: 0, ticketPromedio: 0, operaciones: 0,
      margen: 0, capActual: 0, capAprobado: 0, incautaciones: 0, notasCredito: 0,
    };
  }

  // Metas fijas por defecto (mientras se cargan): META + CAP actual/aprobado por sede.
  // TODO: quitar/ajustar cuando se definan metas reales de todas las sedes.
  private readonly metasFijas: Record<string, { meta: number; capActual: number; capAprobado: number }> = {
    chongoyape: { meta: 150000, capActual: 3, capAprobado: 3 },
    cayalti:    { meta: 150000, capActual: 3, capAprobado: 3 },
    oyotun:     { meta: 120000, capActual: 3, capAprobado: 3 },
  };

  private cabeceraDefault(sedeKey: string): Cabecera {
    const cab = this.cabeceraVacia();
    const fija = this.metasFijas[this.sedeConfig.normalizar(sedeKey)];
    if (fija) { cab.meta = fija.meta; cab.capActual = fija.capActual; cab.capAprobado = fija.capAprobado; }
    return cab;
  }

  indiceCanal(canal: string): number { return this.canales.indexOf(canal); }

  trackFila = (_: number, f: Fila) => f.asesor + '|' + f.canal;
  trackCol = (_: number, c: Col) => c.key;
}
