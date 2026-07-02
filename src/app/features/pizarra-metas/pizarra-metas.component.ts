import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
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
      this.cabecera = board?.cabecera ? { ...this.cabeceraVacia(), ...board.cabecera } : this.cabeceraVacia();
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
    } finally {
      this.cargando = false;
    }
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

  indiceCanal(canal: string): number { return this.canales.indexOf(canal); }

  trackFila = (_: number, f: Fila) => f.asesor + '|' + f.canal;
  trackCol = (_: number, c: Col) => c.key;
}
