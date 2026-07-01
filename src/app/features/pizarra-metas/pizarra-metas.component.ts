import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';

// ── Tipos de campaña (bandas de la pizarra) ──────────────────────────────────
type Grupo = 'RECEPTIVO' | 'CAMPAÑA 1' | 'CAMPAÑA 2';
const GRUPOS: Grupo[] = ['RECEPTIVO', 'CAMPAÑA 1', 'CAMPAÑA 2'];

// Definición de una columna editable de la tabla.
interface Col { key: string; label: string; tipo: 'num' | 'text'; }

// Una fila = un asesor con su tipo de campaña y todos sus valores.
interface Fila {
  id: string;
  grupo: Grupo;
  asesor: string;
  vals: Record<string, number | string>;
}

// Cabecera con los KPI de tienda (tarjetas superiores de la imagen).
interface Cabecera {
  meta: number; avance: number;
  ticketPromedio: number; operaciones: number;
  margen: number; capActual: number; capAprobado: number;
  incautaciones: number; notasCredito: number;
}

// Lo que se guarda por sede + fecha.
interface Board { cabecera: Cabecera; filas: Fila[]; }

const STORAGE_KEY = 'gd_pizarra_v1';

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

  // ── Selección de sede (mismo patrón que ventas-sedes) ──
  esGlobal = false;
  sedeForzada = '';
  sedeSeleccionada = '';
  sedesDisponibles: { key: string; nombre: string }[] = [];

  // ── Fecha de la pizarra ──
  fecha: Date = new Date();

  // ── Estado del tablero ──
  readonly grupos = GRUPOS;
  cabecera: Cabecera = this.cabeceraVacia();
  filas: Fila[] = [];
  guardadoEn = '';

  // ── Popup "Agregar asesor" ──
  popupVisible = false;
  nuevoGrupo: Grupo = 'RECEPTIVO';
  nuevoAsesor = '';

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

  // Todas las columnas en orden (para recorrer filas / totales).
  get todasCols(): Col[] {
    return [...this.colsMeta, ...this.colsAvance, ...this.colsCalidad, ...this.colsInv];
  }
  // Solo numéricas (para totales).
  get colsNum(): Col[] {
    return this.todasCols.filter(c => c.tipo === 'num');
  }

  ngOnInit(): void {
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

    this.cargar();
  }

  get nombreSedeActual(): string {
    return this.sedeConfig.getConfig(this.sedeSeleccionada)?.nombre ?? this.sedeSeleccionada;
  }

  // ── Cambios de sede / fecha → recargar el tablero correspondiente ──
  onSedeChanged(): void { this.cargar(); }
  onFechaChanged(): void { this.cargar(); }

  // ── Asesores de la sede disponibles para agregar (sin los ya usados) ──
  get asesoresDisponibles(): string[] {
    const usados = new Set(this.filas.map(f => f.asesor));
    const asesores = this.sedeConfig.getConfig(this.sedeSeleccionada)?.asesores ?? [];
    return asesores.filter(a => !usados.has(a));
  }

  // ── Persistencia ─────────────────────────────────────────────────────────
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

  cargar(): void {
    if (!this.sedeSeleccionada) return;
    const board = this.leerStore()[this.claveActual()];
    this.cabecera = board?.cabecera ? { ...this.cabeceraVacia(), ...board.cabecera } : this.cabeceraVacia();
    this.filas = (board?.filas ?? []).map(f => ({ ...f, vals: { ...f.vals } }));
    this.guardadoEn = board ? 'Cargado' : '';
  }

  persistir(): void {
    if (!this.sedeSeleccionada) return;
    const store = this.leerStore();
    store[this.claveActual()] = { cabecera: this.cabecera, filas: this.filas };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    this.guardadoEn = 'Guardado ' + new Date().toLocaleTimeString('es-PE');
  }

  // ── Filas / asesores ───────────────────────────────────────────────────────
  private valsVacios(): Record<string, number | string> {
    const v: Record<string, number | string> = {};
    this.todasCols.forEach(c => (v[c.key] = c.tipo === 'num' ? 0 : ''));
    return v;
  }

  abrirAgregar(): void {
    this.nuevoGrupo = 'RECEPTIVO';
    this.nuevoAsesor = this.asesoresDisponibles[0] ?? '';
    this.popupVisible = true;
  }

  confirmarAgregar(): void {
    const asesor = (this.nuevoAsesor || '').toString().trim();
    if (!asesor) return;
    this.filas.push({ id: this.genId(), grupo: this.nuevoGrupo, asesor, vals: this.valsVacios() });
    this.ordenarFilas();
    this.popupVisible = false;
    this.persistir();
  }

  // Carga de golpe todos los asesores de la sede que aún no estén, en RECEPTIVO.
  cargarAsesoresSede(): void {
    this.asesoresDisponibles.forEach(asesor => {
      this.filas.push({ id: this.genId(), grupo: 'RECEPTIVO', asesor, vals: this.valsVacios() });
    });
    this.ordenarFilas();
    this.persistir();
  }

  eliminarFila(id: string): void {
    this.filas = this.filas.filter(f => f.id !== id);
    this.persistir();
  }

  cambiarGrupo(fila: Fila, grupo: Grupo): void {
    fila.grupo = grupo;
    this.ordenarFilas();
    this.persistir();
  }

  limpiar(): void {
    if (!confirm('¿Borrar todos los datos de la pizarra de esta sede y fecha?')) return;
    this.cabecera = this.cabeceraVacia();
    this.filas = [];
    this.persistir();
  }

  private ordenarFilas(): void {
    this.filas.sort((a, b) => {
      const g = GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo);
      return g !== 0 ? g : a.asesor.localeCompare(b.asesor);
    });
  }

  // ── Agrupación para el template (RECEPTIVO / CAMPAÑA 1 / CAMPAÑA 2) ──
  filasDeGrupo(grupo: Grupo): Fila[] {
    return this.filas.filter(f => f.grupo === grupo);
  }

  gruposConFilas(): Grupo[] {
    return GRUPOS.filter(g => this.filasDeGrupo(g).length > 0);
  }

  // ── Totales ────────────────────────────────────────────────────────────────
  totalCol(key: string, filas: Fila[]): number {
    return filas.reduce((s, f) => s + (Number(f.vals[key]) || 0), 0);
  }

  // % de avance de una fila (avance total / meta total en unidades).
  avanceFila(f: Fila): number {
    const meta = this.colsMeta.reduce((s, c) => s + (Number(f.vals[c.key]) || 0), 0);
    const avance = this.colsAvance.reduce((s, c) => s + (Number(f.vals[c.key]) || 0), 0);
    return meta > 0 ? Math.round((avance / meta) * 100) : 0;
  }

  // Clase de color según el % de avance (semáforo).
  claseAvance(f: Fila): string {
    const p = this.avanceFila(f);
    if (p >= 100) return 'av-ok';
    if (p >= 60) return 'av-medio';
    if (p > 0) return 'av-bajo';
    return '';
  }

  // ── Exportar a Excel ─────────────────────────────────────────────────────────
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

    // Cabeceras de banda + columnas.
    ws.addRow([
      'TIPO', 'ASESOR',
      'META Retail', 'META Melamina', 'META Afiliaciones',
      'AVANCE Retail', 'AVANCE Melamina', 'AVANCE Afiliaciones',
      'CAL Iniciales', 'CAL 3pc',
      'INV Iniciales', 'INV Monto', 'INV Producto', 'INV Zona', '% Avance',
    ]);

    this.filas.forEach(f => {
      ws.addRow([
        f.grupo, f.asesor,
        ...this.colsMeta.map(c => f.vals[c.key]),
        ...this.colsAvance.map(c => f.vals[c.key]),
        ...this.colsCalidad.map(c => f.vals[c.key]),
        ...this.colsInv.map(c => f.vals[c.key]),
        this.avanceFila(f) + '%',
      ]);
    });

    // Estilo cabecera.
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

  // ── Helpers ──────────────────────────────────────────────────────────────
  private cabeceraVacia(): Cabecera {
    return {
      meta: 0, avance: 0, ticketPromedio: 0, operaciones: 0,
      margen: 0, capActual: 0, capAprobado: 0, incautaciones: 0, notasCredito: 0,
    };
  }

  private genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  trackFila = (_: number, f: Fila) => f.id;
  trackCol = (_: number, c: Col) => c.key;
}
