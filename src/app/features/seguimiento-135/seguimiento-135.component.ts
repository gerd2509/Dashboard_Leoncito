import { Component, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { DxDataGridComponent } from 'devextreme-angular';
import { lastValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { SheetsService } from '../../services/service-google.service';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ASESORES_CALL, ASESORES_REALZZA } from '../../shared/asesores';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

type Canal = 'call' | 'realzza';
type Fuente = 'auto' | 'excel';

/** Seguimiento de un cliente bajo el método 1-3-5-7. */
interface Seg {
  dni: string;
  celular: string;
  cliente: string;
  asesor: string;
  fechaDia1: Date | null;   // 1ª gestión (día 1); null = sin iniciar
  d3: boolean;              // hubo gestión en la ventana del día 3 (±1)
  d5: boolean;              // día 5 (±1)
  d7: boolean;              // día 7 (±1)
  llamadas: number;         // # de contactos del cliente (historial cargado)
  venta: boolean;          // cerró venta (cruce por DNI)
  hitos: number;           // cuántos de d3/d5/d7 cumplió (0-3)
  ultimoContacto: Date | null;  // fecha del ÚLTIMO contacto (incluye meses previos)
  diasSinContacto: number;      // días desde el último contacto hasta hoy
  estado: string;          // SIN INICIAR / EN PROCESO / COMPLETO / CERRÓ VENTA
}

/** Resumen por asesor. */
interface SegAsesor {
  asesor: string; clientes: number; completos: number; ventas: number;
  d3: number; d5: number; d7: number; pctCompleto: number; pctVenta: number;
}

@Component({
  selector: 'app-seguimiento-135',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './seguimiento-135.component.html',
  styleUrls: ['./seguimiento-135.component.css'],
})
export class Seguimiento135Component {
  private sheets = inject(SheetsService);
  private ventasSrv = inject(CargaVentasService);

  // CC/RZ código → nombre (para cruzar el vendedor de las ventas con el asesor de la gestión,
  // que en Call viene como código y en la gestión como nombre completo).
  private ccANombre = new Map<string, string>(
    [...ASESORES_CALL, ...ASESORES_REALZZA].map((a) => [a.value.toUpperCase(), a.nombre.toUpperCase()]));
  private normNom(s: any): string {
    return (s ?? '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  canal: Canal = 'call';
  fuente: Fuente = 'auto';
  fecha: Date = new Date();

  arrastrando = false;
  procesando = false;
  error = '';
  nombreArchivo = '';
  listo = false;

  filas: Seg[] = [];
  porAsesor: SegAsesor[] = [];

  // KPIs
  kTotal = 0; kIniciados = 0; kD3 = 0; kD5 = 0; kD7 = 0; kCompletos = 0; kVentas = 0; kConversion = 0;

  @ViewChild(DxDataGridComponent, { static: false }) grid!: DxDataGridComponent;

  get nombreCanal(): string { return this.canal === 'realzza' ? 'Realzza' : 'Call'; }

  setCanal(c: Canal): void { if (this.canal === c) return; this.canal = c; this.reiniciar(); if (this.fuente === 'auto') this.cargar(); }
  setFuente(f: Fuente): void { if (this.fuente === f) return; this.fuente = f; this.reiniciar(); if (f === 'auto') this.cargar(); }

  ngOnInit(): void { this.cargar(); }

  reiniciar(): void {
    this.listo = false; this.error = ''; this.nombreArchivo = '';
    this.filas = []; this.porAsesor = [];
    this.kTotal = this.kIniciados = this.kD3 = this.kD5 = this.kD7 = this.kCompletos = this.kVentas = this.kConversion = 0;
  }

  // ── Carga automática (universo = clientes gestionados del mes) ──
  cargar(): void {
    this.reiniciar();
    this.procesando = true;
    this.construir(null)
      .then(() => { this.listo = true; })
      .catch((e) => { this.error = e?.message ?? 'No se pudo calcular el seguimiento.'; })
      .finally(() => { this.procesando = false; });
  }

  // ── Import de BBDD (universo = DNIs del Excel) ──
  onDragOver(e: DragEvent): void { e.preventDefault(); this.arrastrando = true; }
  onDragLeave(e: DragEvent): void { e.preventDefault(); this.arrastrando = false; }
  onDrop(e: DragEvent): void { e.preventDefault(); this.arrastrando = false; const f = e.dataTransfer?.files?.[0]; if (f) this.procesarArchivo(f); }
  onFileChange(e: Event): void { const t = e.target as HTMLInputElement; const f = t.files?.[0]; if (f) this.procesarArchivo(f); t.value = ''; }

  private procesarArchivo(file: File): void {
    this.reiniciar();
    this.nombreArchivo = file.name;
    this.procesando = true;
    const reader = new FileReader();
    reader.onload = async (ev: any) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json<Record<string, any>>(hoja, { defval: '', raw: false });
        if (!filas.length) throw new Error('El archivo no tiene filas.');
        await this.construir(filas);
        this.listo = true;
      } catch (err: any) {
        this.error = err?.message ?? 'No se pudo procesar el archivo.';
      } finally {
        this.procesando = false;
      }
    };
    reader.onerror = () => { this.error = 'Error al leer el archivo.'; this.procesando = false; };
    reader.readAsArrayBuffer(file);
  }

  // ── Núcleo ──────────────────────────────────────────────────────────────────
  private async construir(filasExcel: Record<string, any>[] | null): Promise<void> {
    const anio = this.fecha.getFullYear(), mes = this.fecha.getMonth() + 1;
    // Mes seleccionado (+8 días de colchón para el hito del día 7 de fin de mes).
    const mesIni = new Date(anio, mes - 1, 1);
    const mesFin = new Date(anio, mes, 8);
    // Ventana AMPLIA: 60 días antes del mes → captura el historial de meses previos
    // (para que un cliente gestionado el mes pasado NO aparezca como "sin gestionar").
    const desde = new Date(anio, mes - 1, 1); desde.setDate(desde.getDate() - 60);
    const hasta = mesFin;
    const hoyDia = this.soloDia(new Date());

    const [ges, ven] = await Promise.all([
      lastValueFrom(this.canal === 'realzza' ? this.sheets.getSheetDataCampoRango({ desde, hasta }) : this.sheets.getSheetDataCallRango({ desde, hasta })),
      lastValueFrom(this.canal === 'realzza' ? this.ventasSrv.obtenerVentasRealzzaModulo(anio) : this.ventasSrv.obtenerVentasCanal('call', { anio, mes })),
    ]);

    // Índice gestión por DNI: fechas + asesor.
    // Índice de gestión por DNI: cada llamada con SU asesor (para anclar el seguimiento
    // al asesor que hizo la 1ª llamada = "dueño" del cliente).
    const colAsesor = this.canal === 'realzza' ? 'ASESOR REALZZA' : 'ASESOR CONTACT';
    const idx = new Map<string, { rows: { fecha: Date; asesor: string }[]; celular: string }>();
    for (const g of (ges || [])) {
      if ((g['ESTADO DE GESTIÓN'] || '').toString().trim().toUpperCase() !== 'CONTACTO') continue;  // solo contactos efectivos
      const dni = this.dig(g['DNI CLIENTE']); if (!dni) continue;
      const f = this.parseFecha(g['Marca temporal']); if (!f) continue;
      const raw = (g[colAsesor] || '').toString().trim().toUpperCase();
      const asesor = (this.ccANombre.get(raw) || raw);   // nombre para mostrar (conserva Ñ/acentos)
      let e = idx.get(dni); if (!e) { e = { rows: [], celular: '' }; idx.set(dni, e); }
      e.rows.push({ fecha: f, asesor });
      if (!e.celular) e.celular = this.dig(g['CELULAR GESTIONADO']);
    }

    // Ventas efectivas por DNI → set de ASESORES que cerraron esa venta (por DNI).
    const ventaByDni = new Map<string, Set<string>>();
    for (const v of (ven || [])) {
      if (this.canal === 'realzza' && +v.mes_cv !== mes) continue;
      const est = (v.estado_venta || '').toString().toUpperCase();
      if (est.includes('NOTA DE') || est.includes('INCAUTAC')) continue;
      if ((Number(v.monto_consolidado) || 0) <= 0) continue;
      const dni = this.dig(v.doc_identidad); if (!dni) continue;
      const raw = (v.vendedor || v.asesor_venta || '').toString().trim().toUpperCase();
      const asesor = this.normNom(this.ccANombre.get(raw) || raw);
      let s = ventaByDni.get(dni); if (!s) { s = new Set(); ventaByDni.set(dni, s); }
      if (asesor) s.add(asesor);
    }

    // Universo: Excel (DNIs importados) o los gestionados del mes.
    let universo: { dni: string; cliente: string; cel: string }[];
    if (filasExcel) {
      const headers = Object.keys(filasExcel[0]);
      const hDni = this.buscarHeader(headers, ['dni', 'documento', 'docidentidad']);
      const hNom = this.buscarHeader(headers, ['nombre', 'cliente', 'razonsocial']);
      const hTel = this.buscarHeader(headers, ['celular', 'telefono', 'movil', 'numero', 'cel', 'fono']);
      if (!hDni) throw new Error('No se encontró la columna de DNI en el archivo.');
      const vistos = new Set<string>();
      universo = [];
      for (const f of filasExcel) {
        const dni = this.dig(f[hDni]); if (!dni || vistos.has(dni)) continue;
        vistos.add(dni);
        const celMatch = hTel ? (f[hTel] || '').toString().match(/\d{6,}/) : null;
        universo.push({ dni, cliente: hNom ? (f[hNom] || '').toString().trim() : '', cel: celMatch ? celMatch[0] : '' });
      }
    } else {
      // Auto: universo = clientes con contacto DENTRO del mes elegido (el historial previo
      // se usa solo para calcular día 1 real y último contacto, no infla el conteo).
      universo = [...idx.entries()]
        .filter(([, e]) => e.rows.some((r) => r.fecha >= mesIni && r.fecha <= mesFin))
        .map(([dni]) => ({ dni, cliente: '', cel: '' }));
    }

    // Arma el seguimiento por cliente.
    const filas: Seg[] = universo.map(({ dni, cliente, cel }) => {
      const e = idx.get(dni);
      const ventasSet = ventaByDni.get(dni);
      const celular = (e && e.celular) || cel || '';
      if (!e || !e.rows.length) {
        // Sin gestión: no hay dueño; la venta (si la hay) fue sin seguimiento.
        const venta = !!ventasSet && ventasSet.size > 0;
        return { dni, celular, cliente, asesor: '', fechaDia1: null, d3: false, d5: false, d7: false, llamadas: 0, venta, hitos: 0, ultimoContacto: null, diasSinContacto: 999, estado: venta ? 'CERRÓ VENTA' : 'SIN INICIAR' };
      }
      // Dueño = asesor de la PRIMERA llamada (real, incluye meses previos). Los hitos y la
      // venta solo cuentan si son de ÉL.
      const rows = e.rows.slice().sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
      const duenoDisp = rows[0].asesor;
      const dueno = this.normNom(duenoDisp);
      const propias = rows.filter((r) => this.normNom(r.asesor) === dueno);
      const dia1 = propias[0].fecha;
      const ultimo = rows[rows.length - 1].fecha;                       // último contacto (cualquier asesor)
      const diasSinContacto = Math.round((hoyDia.getTime() - this.soloDia(ultimo).getTime()) / 86400000);
      const offset = (f: Date) => Math.floor((this.soloDia(f).getTime() - this.soloDia(dia1).getTime()) / 86400000);
      const enVentana = (lo: number, hi: number) => propias.some((r) => { const o = offset(r.fecha); return o >= lo && o <= hi; });
      const d3 = enVentana(1, 3);   // día 3 ±1
      const d5 = enVentana(3, 5);   // día 5 ±1
      const d7 = enVentana(5, 7);   // día 7 ±1
      const hitos = (d3 ? 1 : 0) + (d5 ? 1 : 0) + (d7 ? 1 : 0);
      const venta = !!ventasSet && ventasSet.has(dueno);   // solo si el MISMO asesor cerró la venta
      const estado = venta ? 'CERRÓ VENTA' : (hitos === 3 ? 'COMPLETO' : 'EN PROCESO');
      return { dni, celular, cliente, asesor: duenoDisp, fechaDia1: dia1, d3, d5, d7, llamadas: rows.length, venta, hitos, ultimoContacto: ultimo, diasSinContacto, estado };
    });

    this.filas = filas.sort((a, b) => (a.fechaDia1?.getTime() || 0) - (b.fechaDia1?.getTime() || 0));
    this.calcularKpis();
    this.calcularPorAsesor();
  }

  private calcularKpis(): void {
    const f = this.filas;
    this.kTotal = f.length;
    this.kIniciados = f.filter((x) => x.fechaDia1).length;
    this.kD3 = f.filter((x) => x.d3).length;
    this.kD5 = f.filter((x) => x.d5).length;
    this.kD7 = f.filter((x) => x.d7).length;
    this.kCompletos = f.filter((x) => x.hitos === 3).length;
    this.kVentas = f.filter((x) => x.venta).length;
    this.kConversion = this.kIniciados > 0 ? Math.round((this.kVentas / this.kIniciados) * 1000) / 10 : 0;
  }

  private calcularPorAsesor(): void {
    const m = new Map<string, SegAsesor>();
    for (const x of this.filas) {
      if (!x.asesor) continue;
      let a = m.get(x.asesor);
      if (!a) { a = { asesor: x.asesor, clientes: 0, completos: 0, ventas: 0, d3: 0, d5: 0, d7: 0, pctCompleto: 0, pctVenta: 0 }; m.set(x.asesor, a); }
      a.clientes++;
      if (x.d3) a.d3++; if (x.d5) a.d5++; if (x.d7) a.d7++;
      if (x.hitos === 3) a.completos++;
      if (x.venta) a.ventas++;
    }
    this.porAsesor = [...m.values()].map((a) => ({
      ...a,
      pctCompleto: a.clientes > 0 ? Math.round((a.completos / a.clientes) * 1000) / 10 : 0,
      pctVenta: a.clientes > 0 ? Math.round((a.ventas / a.clientes) * 1000) / 10 : 0,
    })).sort((a, b) => b.pctCompleto - a.pctCompleto || b.clientes - a.clientes);
  }

  // ── Helpers ──
  private dig(v: any): string { return (v ?? '').toString().replace(/\D/g, '').replace(/^0+/, ''); }
  private soloDia(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  private buscarHeader(headers: string[], frags: string[]): string | undefined {
    const norm = (s: string) => s.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
    return headers.find((h) => { const n = norm(h); return frags.some((f) => n.includes(f)); });
  }
  private parseFecha(s: any): Date | null {
    if (!s) return null;
    const m = s.toString().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return isNaN(d.getTime()) ? null : d;
  }

  siNo = (v: boolean) => (v ? 'Sí' : '—');
  fmtFecha = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '');

  onCellPrepared(e: any): void {
    if (e.rowType !== 'data') return;
    const campo = e.column.dataField;
    if (['d3', 'd5', 'd7', 'venta'].includes(campo)) {
      e.cellElement.style.setProperty('background-color', e.value ? '#e7f6ea' : '#fdeeee', 'important');
      e.cellElement.style.color = e.value ? '#2E7D32' : '#b23b3b';
      e.cellElement.style.fontWeight = '700';
      e.cellElement.style.textAlign = 'center';
    }
    if (campo === 'diasSinContacto') {
      const d = Number(e.value);
      const bg = d >= 999 ? '' : d <= 2 ? '#e7f6ea' : d <= 6 ? '#fff4e0' : '#fdeeee';
      if (bg) e.cellElement.style.setProperty('background-color', bg, 'important');
      e.cellElement.style.fontWeight = '700'; e.cellElement.style.textAlign = 'center';
    }
    if (campo === 'estado') {
      const c: Record<string, string> = { 'CERRÓ VENTA': '#c8e6c9', 'COMPLETO': '#d7eaff', 'EN PROCESO': '#fff9c4', 'SIN INICIAR': '#ffcdd2' };
      if (c[e.value]) e.cellElement.style.setProperty('background-color', c[e.value], 'important');
      e.cellElement.style.fontWeight = '700'; e.cellElement.style.textAlign = 'center';
    }
  }

  // ── Export Excel ──
  async exportar(): Promise<void> {
    const wb = new Workbook();
    const suf = `${this.nombreCanal}_${this.fecha.getFullYear()}-${String(this.fecha.getMonth() + 1).padStart(2, '0')}`;
    const ws = wb.addWorksheet('Seguimiento 1-3-5-7');
    const hr = ws.addRow(['DNI', 'Celular', 'Cliente', 'Asesor', 'Día 1', 'Día 3', 'Día 5', 'Día 7', 'Contactos', 'Últ. contacto', 'Días s/cont.', 'Venta', 'Estado']);
    hr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } }; });
    for (const f of this.filas) {
      ws.addRow([f.dni, f.celular, f.cliente, f.asesor, this.fmtFecha(f.fechaDia1), this.siNo(f.d3), this.siNo(f.d5), this.siNo(f.d7), f.llamadas, this.fmtFecha(f.ultimoContacto), f.diasSinContacto >= 999 ? '' : f.diasSinContacto, this.siNo(f.venta), f.estado]);
    }
    ws.columns.forEach((c, i) => { c.width = i === 2 || i === 3 ? 26 : 12; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    if (this.porAsesor.length) {
      const wa = wb.addWorksheet('Por asesor');
      const h2 = wa.addRow(['Asesor', 'Clientes', 'Día 3', 'Día 5', 'Día 7', 'Completos', '% Completo', 'Ventas', '% Venta']);
      h2.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF293964' } }; });
      for (const a of this.porAsesor) wa.addRow([a.asesor, a.clientes, a.d3, a.d5, a.d7, a.completos, a.pctCompleto, a.ventas, a.pctVenta]);
      wa.columns.forEach((c, i) => { c.width = i === 0 ? 28 : 12; });
      wa.views = [{ state: 'frozen', ySplit: 1 }];
    }
    const buf = await wb.xlsx.writeBuffer();
    FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Seguimiento_135_${suf}.xlsx`);
  }
}
