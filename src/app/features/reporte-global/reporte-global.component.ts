import { Component, inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

interface ColPivot { key: string; label: string; }
interface FilaPivot { sedeKey: string; sede: string; color: string; valores: Record<string, number>; total: number; }
interface Pivot { cols: ColPivot[]; filas: FilaPivot[]; totales: Record<string, number>; totalGeneral: number; }
interface RankVendedor { vendedor: string; propio: number; global: number; total: number; }
interface RankSede { sedeKey: string; sede: string; color: string; vendedores: RankVendedor[]; propio: number; global: number; total: number; }

@Component({
  selector: 'app-reporte-global',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './reporte-global.component.html',
  styleUrl: './reporte-global.component.css',
})
export class ReporteGlobalComponent implements OnInit {
  private ventas = inject(CargaVentasService);
  private sedeCfg = inject(SedeConfigService);

  form: UntypedFormGroup;
  isLoading = false;

  anios = [2025, 2026];
  meses = [
    { v: 0, t: 'Todo el año' }, { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' },
    { v: 4, t: 'Abril' }, { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' },
    { v: 8, t: 'Agosto' }, { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' }, { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];

  // Cuadros (pivots sede × columna).
  aliadosOps: Pivot | null = null;
  aliadosMonto: Pivot | null = null;
  motosOps: Pivot | null = null;
  motosMonto: Pivot | null = null;
  motosMarca: Pivot | null = null;   // motos por marca × sede (# motos)
  motosTipo: Pivot | null = null;    // motos por tipo × sede (# motos)
  rankingSedes: RankSede[] = [];     // ranking de vendedores por sede (propio/global)
  rankTot = { propio: 0, global: 0, total: 0 };
  colapsadas = new Set<string>();    // sedes colapsadas en el ranking

  toggleSede(key: string): void { this.colapsadas.has(key) ? this.colapsadas.delete(key) : this.colapsadas.add(key); }
  estaColapsada(key: string): boolean { return this.colapsadas.has(key); }
  toggleTodas(): void {
    if (this.colapsadas.size < this.rankingSedes.length) this.rankingSedes.forEach(s => this.colapsadas.add(s.sedeKey));
    else this.colapsadas.clear();
  }
  margenLinea: Pivot | null = null;
  // Margen % por sede (ventas vs margen).
  margenSede: { sedeKey: string; sede: string; color: string; ventas: number; margen: number; pct: number }[] = [];
  totMargenSede = { ventas: 0, margen: 0, pct: 0 };

  // KPIs
  kNetoGlobal = 0;
  kAliadosNeto = 0;
  kAliadosPct = 0;
  kMotosGGOps = 0;
  kMotosGGNeto = 0;
  kMargenTotal = 0;

  private readonly coloresSede: Record<string, string> = {
    motupe: '#1565C0', olmos: '#00695C', ferrenafe: '#6A1B9A', jayanca: '#E65100',
    mochumi: '#2E7D32', morrope: '#AD1457', lambayeque: '#283593', oyotun: '#558B2F',
    cayalti: '#00838F', chongoyape: '#4E342E', realzza: '#455A64', otras: '#78909C',
  };
  // Orden preferido de las entidades aliadas.
  private readonly ORDEN_ALIADO = ['GLOBAL GO', 'BRILLA', 'EFECTIVA'];

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({ anio: [2026], mes: [0] });
  }

  async ngOnInit(): Promise<void> { await this.cargar(); }

  private color(k: string): string { return this.coloresSede[k] || '#607D8B'; }

  /** Normaliza la sede: quita el prefijo 'SEDE RELENOR', reconoce Realzza y agrupa
   *  las no-sede (oficinas / incautados / La Victoria) en "Otras". */
  private sedeInfo(raw: string): { key: string; nombre: string } {
    let n = this.sedeCfg.normalizar(raw || '');
    if (n.includes('realzza')) return { key: 'realzza', nombre: 'Realzza' };
    n = n.replace(/^sederelenor/, '');
    const nombre = this.sedeCfg.getConfig(n)?.nombre;
    if (nombre) return { key: n, nombre };
    return { key: 'otras', nombre: 'Otras' };
  }

  async cargar(): Promise<void> {
    this.isLoading = true;
    const { anio, mes } = this.form.value;
    try {
      const [rows, motos, margen] = await Promise.all([
        lastValueFrom(this.ventas.obtenerReporteGlobal(anio, mes || undefined)),
        lastValueFrom(this.ventas.obtenerReporteGlobalMotos(anio, mes || undefined)),
        lastValueFrom(this.ventas.obtenerMargenLineaSede(anio, mes || undefined)),
      ]);
      this.construir(rows || []);
      this.construirMotos(motos || []);
      this.construirMargen(margen || []);
    } catch (e) {
      console.error('Error reporte global:', e);
      this.aliadosOps = this.aliadosMonto = this.motosOps = this.motosMonto = this.margenLinea = null;
      this.motosMarca = this.motosTipo = null; this.rankingSedes = [];
    }
    this.isLoading = false;
  }

  /** Arma un pivot sede × columna a partir de entradas sueltas. */
  private buildPivot(entradas: { sedeKey: string; sede: string; col: string; value: number }[], cols: ColPivot[]): Pivot {
    const bySede = new Map<string, FilaPivot>();
    const totales: Record<string, number> = {};
    cols.forEach(c => (totales[c.key] = 0));
    for (const e of entradas) {
      let f = bySede.get(e.sedeKey);
      if (!f) {
        f = { sedeKey: e.sedeKey, sede: e.sede, color: this.color(e.sedeKey), valores: {}, total: 0 };
        cols.forEach(c => (f!.valores[c.key] = 0));
        bySede.set(e.sedeKey, f);
      }
      if (!(e.col in f.valores)) f.valores[e.col] = 0;
      f.valores[e.col] += e.value;
      f.total += e.value;
      totales[e.col] = (totales[e.col] || 0) + e.value;
    }
    const filas = [...bySede.values()].sort((a, b) => b.total - a.total);
    const totalGeneral = filas.reduce((s, f) => s + f.total, 0);
    return { cols, filas, totales, totalGeneral };
  }

  private construir(rowsAll: { sede: string; entidad: string | null; es_moto: boolean; neto: number; ops: number }[]): void {
    // Solo sedes reconocidas (10 físicas + Realzza). Se excluye "Otras" (oficina/online,
    // incautados, La Victoria, variantes RETAIL) de todas las tablas y KPIs.
    const rows = rowsAll.filter(r => this.sedeInfo(r.sede).key !== 'otras');
    const norm = (e: string | null) => (e || '').toString().trim().toUpperCase();
    // KPIs base
    this.kNetoGlobal = rows.reduce((s, r) => s + (r.neto || 0), 0);
    this.kAliadosNeto = rows.filter(r => norm(r.entidad) && norm(r.entidad) !== 'LEONCITO').reduce((s, r) => s + (r.neto || 0), 0);
    this.kAliadosPct = this.kNetoGlobal > 0 ? Math.round((this.kAliadosNeto / this.kNetoGlobal) * 1000) / 10 : 0;
    const motosGG = rows.filter(r => r.es_moto && norm(r.entidad) === 'GLOBAL GO');
    this.kMotosGGOps = motosGG.reduce((s, r) => s + (r.ops || 0), 0);
    this.kMotosGGNeto = motosGG.reduce((s, r) => s + (r.neto || 0), 0);

    // ── A) Aliados por entidad × sede (entidad ≠ LEONCITO) ──
    const aliRows = rows.filter(r => norm(r.entidad) && norm(r.entidad) !== 'LEONCITO');
    const aliEnts = [...new Set(aliRows.map(r => norm(r.entidad)))]
      .sort((a, b) => (this.ORDEN_ALIADO.indexOf(a) + 1 || 99) - (this.ORDEN_ALIADO.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const aliCols: ColPivot[] = aliEnts.map(e => ({ key: e, label: e }));
    const opsEnt: any[] = [], montoEnt: any[] = [];
    for (const r of aliRows) {
      const info = this.sedeInfo(r.sede);
      opsEnt.push({ sedeKey: info.key, sede: info.nombre, col: norm(r.entidad), value: r.ops || 0 });
      montoEnt.push({ sedeKey: info.key, sede: info.nombre, col: norm(r.entidad), value: r.neto || 0 });
    }
    this.aliadosOps = this.buildPivot(opsEnt, aliCols);
    this.aliadosMonto = this.buildPivot(montoEnt, aliCols);

    // ── B) Motos por sede (GLOBAL GO / Propio Leoncito / Otros) ──
    const motoCols: ColPivot[] = [
      { key: 'GLOBAL GO', label: 'GLOBAL GO' },
      { key: 'LEONCITO', label: 'Propio (Leoncito)' },
      { key: 'OTROS', label: 'Otros' },
    ];
    const bucketMoto = (e: string) => (e === 'GLOBAL GO' ? 'GLOBAL GO' : e === 'LEONCITO' ? 'LEONCITO' : 'OTROS');
    const motoRows = rows.filter(r => r.es_moto);
    const opsMoto: any[] = [], montoMoto: any[] = [];
    for (const r of motoRows) {
      const info = this.sedeInfo(r.sede);
      const b = bucketMoto(norm(r.entidad));
      opsMoto.push({ sedeKey: info.key, sede: info.nombre, col: b, value: r.ops || 0 });
      montoMoto.push({ sedeKey: info.key, sede: info.nombre, col: b, value: r.neto || 0 });
    }
    this.motosOps = this.buildPivot(opsMoto, motoCols);
    this.motosMonto = this.buildPivot(montoMoto, motoCols);
  }

  /** Tablas de motos: por marca × sede, por tipo × sede y ranking de vendedores por sede. */
  private construirMotos(rowsAll: { sede: string; credito: 'PROPIO' | 'GLOBAL'; marca: string; tipo: string; vendedor: string; motos: number }[]): void {
    // Solo sedes reconocidas (se excluye "Otras").
    const rows = rowsAll.filter(r => this.sedeInfo(r.sede).key !== 'otras');
    // ── Motos por MARCA × sede (# motos) ──
    const ordenMarca = ['WANXIN', 'SSENDA'];
    const marcas = [...new Set(rows.map(r => r.marca))]
      .sort((a, b) => (ordenMarca.indexOf(a) + 1 || 99) - (ordenMarca.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const marcaCols: ColPivot[] = marcas.map(m => ({ key: m, label: this.titulo(m) }));
    const entMarca = rows.map(r => { const i = this.sedeInfo(r.sede); return { sedeKey: i.key, sede: i.nombre, col: r.marca, value: r.motos || 0 }; });
    this.motosMarca = this.buildPivot(entMarca, marcaCols);

    // ── Motos por TIPO × sede (# motos) — carguera ya viene reclasificada del backend ──
    const ordenTipo = ['MOTO LINEAL', 'MOTOTAXI', 'MOTO CARGUERA'];
    const tipos = [...new Set(rows.map(r => r.tipo))]
      .sort((a, b) => (ordenTipo.indexOf(a) + 1 || 99) - (ordenTipo.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const tipoCols: ColPivot[] = tipos.map(t => ({ key: t, label: this.titulo(t) }));
    const entTipo = rows.map(r => { const i = this.sedeInfo(r.sede); return { sedeKey: i.key, sede: i.nombre, col: r.tipo, value: r.motos || 0 }; });
    this.motosTipo = this.buildPivot(entTipo, tipoCols);

    // ── Ranking de vendedores por sede (propio / global) ──
    const bySede = new Map<string, RankSede>();
    for (const r of rows) {
      const i = this.sedeInfo(r.sede);
      let s = bySede.get(i.key);
      if (!s) { s = { sedeKey: i.key, sede: i.nombre, color: this.color(i.key), vendedores: [], propio: 0, global: 0, total: 0 }; bySede.set(i.key, s); }
      let v = s.vendedores.find(x => x.vendedor === r.vendedor);
      if (!v) { v = { vendedor: r.vendedor, propio: 0, global: 0, total: 0 }; s.vendedores.push(v); }
      const n = r.motos || 0;
      if (r.credito === 'GLOBAL') { v.global += n; s.global += n; } else { v.propio += n; s.propio += n; }
      v.total += n; s.total += n;
    }
    this.rankingSedes = [...bySede.values()].sort((a, b) => b.total - a.total);
    this.rankingSedes.forEach(s => s.vendedores.sort((a, b) => b.total - a.total));
    this.rankTot = {
      propio: this.rankingSedes.reduce((s, x) => s + x.propio, 0),
      global: this.rankingSedes.reduce((s, x) => s + x.global, 0),
      total: this.rankingSedes.reduce((s, x) => s + x.total, 0),
    };
  }

  /** Título legible (WANXIN→Wanxin, MOTO CARGUERA→Moto Carguera, MOTOTAXI→Mototaxi). */
  private titulo(s: string): string {
    return (s || '').toString().trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) || '—';
  }

  private construirMargen(rowsAll: { sede: string; linea_real: string; valor_venta: number; margen_total: number; ops: number }[]): void {
    // Excluye sedes no reconocidas ("Otras": oficinas / incautados / La Victoria) de ambos cuadros.
    const rows = rowsAll.filter(r => this.sedeInfo(r.sede).key !== 'otras');
    this.kMargenTotal = rows.reduce((s, r) => s + (r.margen_total || 0), 0);
    // Columnas = líneas reales, ordenadas por monto total desc.
    const totalPorLinea = new Map<string, number>();
    rows.forEach(r => totalPorLinea.set(r.linea_real, (totalPorLinea.get(r.linea_real) || 0) + (r.valor_venta || 0)));
    const lineas = [...totalPorLinea.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
    const cols: ColPivot[] = lineas.map(l => ({ key: l, label: this.tituloLinea(l) }));
    const entradas = rows.map(r => {
      const info = this.sedeInfo(r.sede);
      return { sedeKey: info.key, sede: info.nombre, col: r.linea_real, value: r.valor_venta || 0 };
    });
    this.margenLinea = this.buildPivot(entradas, cols);

    // Margen % por sede = margen_total / valor_venta (cuánto margen deja cada sede).
    const bySede = new Map<string, { sede: string; color: string; ventas: number; margen: number }>();
    for (const r of rows) {
      const info = this.sedeInfo(r.sede);
      let f = bySede.get(info.key);
      if (!f) { f = { sede: info.nombre, color: this.color(info.key), ventas: 0, margen: 0 }; bySede.set(info.key, f); }
      f.ventas += r.valor_venta || 0;
      f.margen += r.margen_total || 0;
    }
    this.margenSede = [...bySede.entries()]
      .map(([k, f]) => ({ sedeKey: k, ...f, pct: f.ventas > 0 ? Math.round((f.margen / f.ventas) * 1000) / 10 : 0 }))
      .sort((a, b) => b.margen - a.margen);
    const tv = this.margenSede.reduce((s, f) => s + f.ventas, 0);
    const tm = this.margenSede.reduce((s, f) => s + f.margen, 0);
    this.totMargenSede = { ventas: tv, margen: tm, pct: tv > 0 ? Math.round((tm / tv) * 1000) / 10 : 0 };
  }

  private tituloLinea(l: string): string {
    const s = (l || '').toString().trim();
    return s.replace(/^LINEA\s+/i, '').replace(/\b\w/g, c => c.toUpperCase()) || 'Sin Línea';
  }

  /** "APELLIDO1 APELLIDO2 NOMBRE1 …" → "Nombre1 Apellido1" (title case) para acortar el ranking. */
  nombreRank(full: string): string {
    const n = (full || '').trim();
    if (!n || n.startsWith('(')) return n;
    const p = n.split(/\s+/).filter(Boolean);
    const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '');
    if (p.length >= 3) return `${cap(p[2])} ${cap(p[0])}`;   // nombre + primer apellido
    if (p.length === 2) return `${cap(p[0])} ${cap(p[1])}`;
    return cap(p[0]);
  }

  soles(n: number): string { return 'S/ ' + (Math.round(n || 0)).toLocaleString('es-PE'); }
  claseMargen(pct: number): string { return pct >= 20 ? 'ok' : pct >= 10 ? 'warn' : 'low'; }

  // ── Export Excel ──
  async exportar(): Promise<void> {
    const wb = new Workbook();
    const { anio, mes } = this.form.value;
    const suf = mes ? `${anio}-${String(mes).padStart(2, '0')}` : `${anio}`;
    if (this.aliadosOps) this.hojaPivot(wb, 'Aliados (ops)', this.aliadosOps, false);
    if (this.aliadosMonto) this.hojaPivot(wb, 'Aliados (monto)', this.aliadosMonto, true);
    if (this.motosOps) this.hojaPivot(wb, 'Motos (ops)', this.motosOps, false);
    if (this.motosMonto) this.hojaPivot(wb, 'Motos (monto)', this.motosMonto, true);
    if (this.motosMarca) this.hojaPivot(wb, 'Motos x Marca', this.motosMarca, false);
    if (this.motosTipo) this.hojaPivot(wb, 'Motos x Tipo', this.motosTipo, false);
    if (this.rankingSedes.length) {
      const ws = wb.addWorksheet('Ranking Motos x Sede');
      const hr = ws.addRow(['Sede', 'Vendedor', 'Propio', 'Global', 'Total']);
      hr.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } }; });
      for (const s of this.rankingSedes) {
        s.vendedores.forEach(v => ws.addRow([s.sede, v.vendedor, v.propio, v.global, v.total]));
        const sr = ws.addRow([`TOTAL ${s.sede}`, '', s.propio, s.global, s.total]);
        sr.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FB' } }; });
      }
      ws.columns.forEach((col, i) => { col.width = i <= 1 ? 24 : 10; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }
    if (this.margenLinea) this.hojaPivot(wb, 'Ventas x Linea', this.margenLinea, true);
    if (this.margenSede.length) {
      const ws = wb.addWorksheet('Margen x Sede');
      const hr = ws.addRow(['Sede', 'Ventas', 'Margen', 'Margen %']);
      hr.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3949AB' } }; });
      this.margenSede.forEach(f => ws.addRow([f.sede, Math.round(f.ventas), Math.round(f.margen), f.pct]));
      const tr = ws.addRow(['TOTAL', Math.round(this.totMargenSede.ventas), Math.round(this.totMargenSede.margen), this.totMargenSede.pct]);
      tr.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FB' } }; });
      ws.getColumn(2).numFmt = '#,##0'; ws.getColumn(3).numFmt = '#,##0'; ws.getColumn(4).numFmt = '0.0"%"';
      ws.columns.forEach((col, i) => { col.width = i === 0 ? 22 : 14; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    FileSaver.saveAs(blob, `Reporte_Global_${suf}.xlsx`);
  }

  private hojaPivot(wb: Workbook, nombre: string, p: Pivot, moneda: boolean): void {
    const ws = wb.addWorksheet(nombre);
    const headers = ['Sede', ...p.cols.map(c => c.label), 'Total'];
    const hr = ws.addRow(headers);
    hr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } };
    });
    for (const f of p.filas) {
      ws.addRow([f.sede, ...p.cols.map(c => Math.round(f.valores[c.key] || 0)), Math.round(f.total)]);
    }
    const totalRow = ws.addRow(['TOTAL', ...p.cols.map(c => Math.round(p.totales[c.key] || 0)), Math.round(p.totalGeneral)]);
    totalRow.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FB' } }; });
    if (moneda) {
      ws.eachRow((row, i) => { if (i > 1) row.eachCell((cell, col) => { if (col > 1) cell.numFmt = '#,##0'; }); });
    }
    ws.columns.forEach((col, i) => { col.width = i === 0 ? 22 : 15; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
}
