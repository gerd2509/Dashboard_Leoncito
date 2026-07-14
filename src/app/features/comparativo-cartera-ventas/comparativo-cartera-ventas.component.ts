import { Component, ViewChild, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { DxDataGridComponent } from 'devextreme-angular';
import * as XLSX from 'xlsx';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { lastValueFrom } from 'rxjs';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ExcelExportService } from '../../services/excel/excel.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { SedeConfigService } from '../../services/sede-config.service';

interface FilaCartera {
  dni: string;
  vendedor: string;
  tipoBase: string;
  tipoCliente: string;
  sede: string;
}

// Una venta de cartera ya cruzada (solo los que convirtieron).
interface VentaCartera {
  vendedor: string;
  tipoBase: string;
  tipoCliente: string;
  sede: string;
  dni: string;
  cliente: string;
  ops: number;
  monto: number;
}

// Fila del resumen por sede (vista principal, tipo avance de cartera).
interface ResumenSede {
  sede: string;
  asignados: number;
  vendidos: number;
  conversion: number;
  monto: number;
}

@Component({
  selector: 'app-comparativo-cartera-ventas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './comparativo-cartera-ventas.component.html',
  styleUrl: './comparativo-cartera-ventas.component.css'
})
export class ComparativoCarteraVentasComponent {
  private ventasSrv = inject(CargaVentasService);
  private excelSrv = inject(ExcelExportService);
  private cap = inject(CapSedesService);
  private sedeCfg = inject(SedeConfigService);
  private snack = inject(MatSnackBar);

  @ViewChild('grid', { static: false }) grid!: DxDataGridComponent;

  form: UntypedFormGroup;
  isLoading = false;
  cartera: FilaCartera[] = [];
  nombreArchivo = '';
  aviso = '';
  yaCruzado = false;

  // Todos los convertidos + la vista filtrada por sede que ve el grid.
  private convertidosAll: VentaCartera[] = [];
  ventasCartera: VentaCartera[] = [];

  // Vista principal: avance por sede.
  resumenSedes: ResumenSede[] = [];

  // Sedes para el selector + cartera asignada por sede.
  sedesDisponibles: string[] = [];
  private asignadosPorSede = new Map<string, number>();
  private totalAsignados = 0;

  // Cartera deduplicada (para recontar asignados por CAP) + CAP por sede.
  private carteraUnica: FilaCartera[] = [];
  private capPorSede = new Map<string, Set<string>>();   // sedeKey → nombres normalizados activos
  capAplicado = false;   // true cuando el detalle está filtrado por el CAP de la sede

  // KPIs
  kAsignados = 0; kVendidos = 0; kMonto = 0;
  get kConversion(): number { return this.kAsignados ? this.kVendidos / this.kAsignados : 0; }

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({ mes: [new Date()], sede: [''] });
  }

  // ── Utilidades ──────────────────────────────────────────────────────────────
  private norm(s: any): string {
    return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  }
  private soloDigitos(v: any): string {
    return (v ?? '').toString().replace(/\D/g, '').replace(/^0+/, '');
  }
  private detectar(headers: string[], exactos: string[], fragmentos: string[]): string | null {
    const H = headers.map(h => ({ raw: h, n: this.norm(h).replace(/\s+/g, '') }));
    for (const e of exactos) {
      const t = this.norm(e).replace(/\s+/g, '');
      const f = H.find(h => h.n === t);
      if (f) return f.raw;
    }
    for (const fr of fragmentos) {
      const t = this.norm(fr).replace(/\s+/g, '');
      const f = H.find(h => h.n.includes(t));
      if (f) return f.raw;
    }
    return null;
  }

  // ── Importar Excel de piso (cartera) ─────────────────────────────────────────
  importar(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    this.nombreArchivo = file.name;
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as any[];
        if (!rows.length) { this.toast('El Excel de piso está vacío.', true); return; }

        const headers = Object.keys(rows[0]);
        const cDni  = this.detectar(headers, ['DNI', 'DNI CLIENTE', 'DOC IDENTIDAD', 'DOCIDENTIDAD', 'DOCUMENTO'], ['DNI', 'DOCIDENTIDAD', 'DOCUMENTO']);
        const cVend = this.detectar(headers, ['AsignacionFinal', 'AsesorFinal', 'ASIGNACION FINAL', 'ASESOR FINAL', 'VENDEDOR', 'ASESOR', 'ASIGNACION'], ['ASIGNACION', 'ASESOR', 'VENDEDOR', 'EJECUTIVO', 'PROMOTOR', 'GESTOR']);
        const cBase = this.detectar(headers, ['TIPO DE BASE', 'TIPOBASE', 'TIPO BASE'], ['TIPODEBASE', 'TIPOBASE']);
        const cCli  = this.detectar(headers, ['TIPO DE CLIENTE', 'TIPOCLIENTE', 'TIPO CLIENTE'], ['TIPODECLIENTE', 'TIPOCLIENTE']);
        const cSede = this.detectar(headers, ['ZONA', 'ZONAS', 'SEDE', 'TIENDA'], ['ZONA', 'SEDE', 'TIENDA']);

        const faltan: string[] = [];
        if (!cDni)  faltan.push('DNI');
        if (!cVend) faltan.push('vendedor (AsignacionFinal)');
        if (!cBase) faltan.push('tipo de base');
        if (!cCli)  faltan.push('tipo de cliente');
        this.aviso = faltan.length
          ? `⚠️ No se detectaron estas columnas en el Excel: ${faltan.join(', ')}. Se agruparán como "SIN DATO".`
          : '';

        this.cartera = rows.map(r => ({
          dni:         cDni  ? String(r[cDni]) : '',
          vendedor:    (cVend ? String(r[cVend]) : '').trim().toUpperCase() || 'SIN VENDEDOR',
          tipoBase:    (cBase ? String(r[cBase]) : '').trim().toUpperCase() || 'SIN BASE',
          tipoCliente: (cCli  ? String(r[cCli])  : '').trim().toUpperCase() || 'SIN TIPO',
          sede:        (cSede ? String(r[cSede]) : '').trim().toUpperCase(),
        })).filter(f => this.soloDigitos(f.dni));

        if (!this.cartera.length) { this.toast('No se encontró ninguna fila con DNI válido.', true); return; }
        await this.recalcular();
      } catch (err) {
        console.error('❌ importar cartera:', err);
        this.toast('No se pudo leer el Excel de piso.', true);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Cruce cartera ↔ ventas netas (Postgres) → solo convertidos ───────────────
  async recalcular(): Promise<void> {
    if (!this.cartera.length) { this.toast('Primero importa el Excel de piso.', true); return; }
    this.isLoading = true;
    try {
      const mes: Date = this.form.value.mes || new Date();
      const anio = mes.getFullYear();
      const nMes = mes.getMonth() + 1;

      const ventas = await lastValueFrom(this.ventasSrv.obtenerVentas(anio, { mes: nMes }));

      // Índice de VENTAS NETAS por DNI (excluye NC e Incautaciones y monto <= 0).
      const idx = new Map<string, { monto: number; ops: number; nombre: string }>();
      (ventas || []).forEach(v => {
        const estado = (v.estado_venta || '').toString().trim().toUpperCase();
        const esNC = estado === 'NOTA DE CRÉDITO' || estado === 'NOTA DE CREDITO';
        const esINC = estado === 'INCAUTACIÓN' || estado === 'INCAUTACION';
        const monto = Number(v.monto_consolidado) || 0;
        if (esNC || esINC || monto <= 0) return;
        const dni = this.soloDigitos(v.doc_identidad);
        if (!dni) return;
        const cur = idx.get(dni) || { monto: 0, ops: 0, nombre: '' };
        cur.monto += monto;
        cur.ops += 1;
        if (!cur.nombre) cur.nombre = (v.cliente_venta || '').toString();
        idx.set(dni, cur);
      });

      // Recorre la cartera (dedup por DNI). Solo los que tienen venta neta quedan.
      const vistos = new Set<string>();
      const convertidos: VentaCartera[] = [];
      const carteraUnica: FilaCartera[] = [];
      const asignadosPorSede = new Map<string, number>();
      let totalAsignados = 0;
      for (const r of this.cartera) {
        const dni = this.soloDigitos(r.dni);
        if (!dni || vistos.has(dni)) continue;
        vistos.add(dni);
        totalAsignados++;
        const sede = r.sede || 'SIN SEDE';
        asignadosPorSede.set(sede, (asignadosPorSede.get(sede) || 0) + 1);
        carteraUnica.push({ dni: r.dni, vendedor: r.vendedor, tipoBase: r.tipoBase, tipoCliente: r.tipoCliente, sede });
        const hit = idx.get(dni);
        if (!hit) continue;
        convertidos.push({
          vendedor: r.vendedor,
          tipoBase: r.tipoBase,
          tipoCliente: r.tipoCliente,
          sede,
          dni: r.dni,
          cliente: hit.nombre,
          ops: hit.ops,
          monto: hit.monto,
        });
      }
      this.carteraUnica = carteraUnica;

      // CAP por sede: solo asesores ACTIVOS que pertenecen a cada sede.
      await this.cargarCap();

      // Ventas de cartera agrupadas por sede (para el resumen / avance).
      const vendidosPorSede = new Map<string, { vendidos: number; monto: number }>();
      convertidos.forEach(c => {
        const cur = vendidosPorSede.get(c.sede) || { vendidos: 0, monto: 0 };
        cur.vendidos++; cur.monto += c.monto;
        vendidosPorSede.set(c.sede, cur);
      });
      this.resumenSedes = Array.from(asignadosPorSede.entries()).map(([sede, asig]) => {
        const v = vendidosPorSede.get(sede) || { vendidos: 0, monto: 0 };
        return { sede, asignados: asig, vendidos: v.vendidos, monto: Math.round(v.monto), conversion: asig ? v.vendidos / asig : 0 };
      }).sort((a, b) => b.monto - a.monto || b.vendidos - a.vendidos);

      this.convertidosAll = convertidos;
      this.asignadosPorSede = asignadosPorSede;
      this.totalAsignados = totalAsignados;
      this.sedesDisponibles = Array.from(new Set(this.cartera.map(c => c.sede)))
        .filter(s => s && s !== '' && s !== 'SIN SEDE').sort();
      this.yaCruzado = true;
      this.aplicarSede();

      if (!convertidos.length) {
        this.toast('No hubo ventas netas de la cartera en el mes seleccionado.', false);
      }
    } catch (e) {
      console.error('❌ recalcular comparativo:', e);
      this.toast('No se pudieron traer las ventas del sistema (revisa la conexión).', true);
    } finally {
      this.isLoading = false;
    }
  }

  // Construye el mapa CAP: sedeKey → nombres normalizados de asesores ACTIVOS.
  private async cargarCap(): Promise<void> {
    try {
      const rows = await this.cap.cargar();
      const map = new Map<string, Set<string>>();
      for (const r of rows) {
        if (r.estado !== 'ACTIVO') continue;
        if (!map.has(r.sedeKey)) map.set(r.sedeKey, new Set());
        map.get(r.sedeKey)!.add(this.normNombre(r.vendedor));
      }
      this.capPorSede = map;
    } catch {
      this.capPorSede = new Map();   // sin CAP → no se filtra (fallback)
    }
  }

  private normNombre(v: any): string {
    return (v ?? '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Filtra la vista (y los KPIs) por la sede elegida. En el detalle de una sede,
  // solo se muestran los asesores que pertenecen a esa sede según el CAP.
  aplicarSede(): void {
    const sede = (this.form.value.sede || '').toString();
    this.capAplicado = false;

    if (!sede) {
      this.ventasCartera = this.convertidosAll;
      this.kAsignados = this.totalAsignados;
      this.kVendidos = this.ventasCartera.length;
      this.kMonto = Math.round(this.ventasCartera.reduce((s, c) => s + c.monto, 0));
      this.todoExpandido = false;
      return;
    }

    // CAP de la sede (si no hay, no se filtra por asesor → fallback).
    const cap = this.capPorSede.get(this.sedeCfg.normalizar(sede));
    const conCap = !!cap && cap.size > 0;
    this.capAplicado = conCap;
    const enCap = (vendedor: string) => !conCap || cap!.has(this.normNombre(vendedor));

    const vista = this.convertidosAll.filter(c => c.sede === sede && enCap(c.vendedor));
    this.ventasCartera = vista;
    this.kAsignados = this.carteraUnica.filter(c => c.sede === sede && enCap(c.vendedor)).length;
    this.kVendidos = vista.length;
    this.kMonto = Math.round(vista.reduce((s, c) => s + c.monto, 0));
    this.todoExpandido = false;
  }

  get sedeSeleccionada(): string { return (this.form.value.sede || '').toString(); }

  // Vista principal = resumen por sede (cuando hay sedes y no se eligió ninguna).
  get mostrarResumen(): boolean {
    return this.yaCruzado && !this.sedeSeleccionada && this.sedesDisponibles.length > 0;
  }

  // Barra comparativa de conversión (relativa a la mejor sede).
  get maxConversion(): number {
    return this.resumenSedes.reduce((m, s) => Math.max(m, s.conversion), 0) || 1;
  }
  barPct(conv: number): number {
    return Math.round((conv / this.maxConversion) * 100);
  }
  barClase(conv: number): string {
    const r = conv / this.maxConversion;
    return r >= 0.66 ? 'hi' : r >= 0.33 ? 'mid' : 'lo';
  }

  seleccionarSede(sede: string): void {
    this.form.patchValue({ sede });
    this.aplicarSede();
  }
  volverAResumen(): void {
    this.form.patchValue({ sede: '' });
    this.aplicarSede();
  }

  exportar(): void {
    if (this.grid && this.ventasCartera.length) {
      this.excelSrv.exportarDesdeGrid('ComparativoCarteraVentasPiso', this.grid);
    }
  }

  // Expandir / colapsar todos los asesores del detalle.
  todoExpandido = false;
  toggleExpandir(): void {
    if (!this.grid) return;
    this.todoExpandido = !this.todoExpandido;
    if (this.todoExpandido) this.grid.instance.expandAll(0);
    else this.grid.instance.collapseAll(0);
  }

  onCellPrepared(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = '#fff';
      e.cellElement.style.fontWeight = '700';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'group') {
      e.cellElement.style.background = '#eaf0fb';
      e.cellElement.style.fontWeight = '800';
      e.cellElement.style.color = '#1E3A5F';
      e.cellElement.style.fontSize = '14px';
    }
    if (e.rowType === 'data' && e.column?.dataField === 'monto') {
      e.cellElement.style.fontWeight = '700';
      e.cellElement.style.color = '#1a3a6b';
    }
  }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'Cerrar', {
      duration: error ? 5000 : 2600,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: error ? ['snack-error'] : ['snack-ok'],
    });
  }

  formatPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
  formatSoles(v: number): string { return `S/ ${Math.round(v).toLocaleString('es-PE')}`; }

  // Formato de moneda para el grid/summaries → S/ (no "PEN").
  montoFormat = (v: number): string => `S/ ${Math.round(v || 0).toLocaleString('es-PE')}`;
}
