import { Component, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { lastValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { SheetsService } from '../../services/service-google.service';

type Modo = 'call' | 'realzza';

// Candidatos de cabecera DNI en las hojas de cartera / ventas (la columna puede
// venir como DNI, Dni, dni, DocIdentidad, Documento, etc.). La normalización iguala
// mayúsculas/tildes/espacios; el fallback por coincidencia atrapa el resto.
const CANDIDATOS_DNI = [
  'DNI', 'Dni', 'dni', 'DNI CLIENTE', 'DNICLIENTE', 'DNI_CLIENTE', 'NRO DNI', 'N° DNI', 'NUM DNI',
  'DocIdentidad', 'DOC IDENTIDAD', 'DOCIDENTIDAD', 'DOCUMENTO IDENTIDAD', 'DOCUMENTO DE IDENTIDAD',
  'DOCUMENTO', 'NRO DOCUMENTO', 'DOC', 'NRO DOC',
];
// Fragmentos para el fallback (cabecera que CONTENGA alguno).
const FRAG_DNI = ['dni', 'docidentidad', 'documento', 'identidad'];

// Candidatos y fragmentos para la columna de ASESOR en las hojas de cartera.
const CANDIDATOS_ASESOR = [
  'ASESOR', 'Asesor', 'asesor', 'ASESOR ASIGNADO', 'ASESOR CONTACT', 'ASESOR DE VENTA', 'ASESORVENTA',
  'VENDEDOR', 'EJECUTIVO', 'GESTOR', 'RESPONSABLE', 'PROMOTOR',
];
const FRAG_ASESOR = ['asesor', 'vendedor', 'ejecutivo', 'gestor', 'promotor', 'responsable'];

interface Etapa { nombre: string; op: number; ratio: number; codigo: string; }

// Detalle por asesor dentro de una cartera: cuánto tiene asignado y cuánto le falta.
interface DetalleAsesor {
  asesor: string;
  asignados: number;
  gestionados: number;
  pendientes: number;   // FALTA = asignados − gestionados
  contactados: number;
  interesados: number;
  ventas: number;
  pctAvance: number;    // gestionados / asignados
}

interface Embudo {
  titulo: string;
  color: string;
  kommoLeads: boolean;
  asignados: number;
  etapas: Etapa[];
  marketPlace?: number;
  hoja?: string;
  detalle?: DetalleAsesor[];   // detalle por asesor (si la cartera trae columna de asesor)
}

// Estado agregado por DNI en una gestión.
interface EstadoDni { gestionado: boolean; contactado: boolean; interesado: boolean; }

@Component({
  selector: 'app-embudos-gestion',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './embudos-gestion.component.html',
  styleUrls: ['./embudos-gestion.component.css'],
})
export class EmbudosGestionComponent {
  private sheets = inject(SheetsService);

  modo: Modo | null = null;
  arrastrando = false;
  procesando = false;
  error = '';
  nombreArchivo = '';
  listo = false;
  fecha: Date = new Date();

  embudos: Embudo[] = [];

  // Popup para ampliar un embudo individual
  popupVisible = false;
  embudoSel: Embudo | null = null;
  abrirEmbudo(e: Embudo): void { this.embudoSel = e; this.popupVisible = true; }

  // Popup del detalle por asesor de una cartera
  popupDetalleVisible = false;
  embudoDetalle: Embudo | null = null;
  abrirDetalle(e: Embudo): void { this.embudoDetalle = e; this.popupDetalleVisible = true; }

  private readonly paleta = ['#2E5DAA', '#3E8E41', '#E0701A', '#6A1B9A', '#00838F', '#AD1457', '#37474F'];

  get nombreModo(): string { return this.modo === 'realzza' ? 'Realzza' : 'Call'; }

  seleccionarModo(m: Modo): void { this.modo = m; this.reiniciar(); }
  volverModos(): void { this.modo = null; this.reiniciar(); }

  onDragOver(e: DragEvent): void { e.preventDefault(); this.arrastrando = true; }
  onDragLeave(e: DragEvent): void { e.preventDefault(); this.arrastrando = false; }
  onDrop(e: DragEvent): void {
    e.preventDefault(); this.arrastrando = false;
    const f = e.dataTransfer?.files?.[0]; if (f) this.procesarArchivo(f);
  }
  onFileChange(e: Event): void {
    const t = e.target as HTMLInputElement;
    const f = t.files?.[0]; if (f) this.procesarArchivo(f);
    t.value = '';
  }

  reiniciar(): void {
    this.listo = false; this.error = ''; this.nombreArchivo = ''; this.embudos = [];
  }

  private procesarArchivo(file: File): void {
    this.reiniciar();
    this.nombreArchivo = file.name;
    this.procesando = true;

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        await this.construirEmbudos(wb);
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

  // ── Núcleo ──
  private async construirEmbudos(wb: XLSX.WorkBook): Promise<void> {
    // 1) Identificar hojas especiales: VENTAS y KOMMO (leads). El resto = carteras.
    const hojas = wb.SheetNames;
    const hojaVentas = hojas.find(h => this.norm(h) === 'ventas' || this.norm(h).includes('venta'));
    const hojaKommo = hojas.find(h => {
      const n = this.norm(h);
      return n === 'kommo' || n === 'kommoleads' || (n.includes('kommo') && n.includes('lead'));
    });
    const hojasCartera = hojas.filter(h => h !== hojaVentas && h !== hojaKommo);
    if (!hojasCartera.length && !hojaKommo) throw new Error('El Excel no tiene hojas de cartera ni hoja KOMMO (además de VENTAS).');

    // 2) Leer VENTAS: set de DNIs + clasificación de la venta.
    //    - Call:    columna CONTACTO  → KOMMO / MARKET PLACE.
    //    - Realzza: columna TipoBase  → KOMMO / MARKET PLACE / BBDD KOMMO.
    let ventasSet = new Set<string>();
    let ventasKommo = 0, ventasMarket = 0, ventasBbddKommo = 0;
    if (hojaVentas) {
      const rowsV = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[hojaVentas], { defval: '', raw: false });
      if (rowsV.length) {
        const headers = Object.keys(rowsV[0]);
        const dniV = this.buscarHeader(headers, CANDIDATOS_DNI) ?? this.buscarIncluye(headers, FRAG_DNI);
        const colCanal = this.modo === 'realzza'
          ? (this.buscarHeader(headers, ['TipoBase', 'TIPO BASE', 'TIPO DE BASE']) ?? this.buscarIncluye(headers, ['tipobase', 'tipodebase']))
          : (this.buscarHeader(headers, ['CONTACTO', 'Contacto']) ?? this.buscarIncluye(headers, ['contacto']));
        rowsV.forEach(r => {
          if (dniV) { const d = this.dig(r[dniV]); if (d) ventasSet.add(d); }
          const c = colCanal ? this.norm(r[colCanal]) : '';
          if (c === 'kommo') ventasKommo++;
          else if (c === 'marketplace') ventasMarket++;
          else if (c === 'bbddkommo') ventasBbddKommo++;
        });
      }
    }

    // 3) Gestión del mes: modo (call/campo) filtrado en backend por "Marca temporal";
    //    Kommo se trae completo y se filtra por FECHA DE LEAD ASIGNADO (el backend no filtra por esa columna).
    const mes = this.fecha.getMonth(), anio = this.fecha.getFullYear();
    const desde = new Date(anio, mes, 1), hasta = new Date(anio, mes + 1, 0);
    let dataModo: any[] = [], dataKommo: any[] = [];
    try {
      [dataModo, dataKommo] = await Promise.all([
        lastValueFrom(this.modo === 'realzza'
          ? this.sheets.getSheetDataCampoRango({ desde, hasta })   // Google Form campo/realzza
          : this.sheets.getSheetDataCallRango({ desde, hasta })),  // Google Form call
        lastValueFrom(this.sheets.getSheetKOMMO()),
      ]);
    } catch {
      throw new Error('No se pudo cargar la gestión (revisa la conexión al servidor).');
    }

    // Kommo del mes según FECHA DE LEAD ASIGNADO (d/m/yyyy).
    const kommoMes = dataKommo.filter(r => this.fechaEnMes(r['FECHA DE LEAD ASIGNADO'], mes, anio));

    // TODAS las carteras (incluida "cartera kommo") cruzan contra la gestión del modo
    // (Call Center en modo Call / Realzza en modo Realzza). La gestión Kommo solo se
    // usa para el embudo KOMMO (LEADS).
    const idxModo = this.indexar(dataModo, 'DNI CLIENTE', 'ESTADO DE GESTIÓN', 'RESULTADO DE GESTIÓN');

    // 4) Un embudo por cartera.
    const embudos: Embudo[] = [];
    let ci = 0;
    for (const hoja of hojasCartera) {
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[hoja], { defval: '', raw: false });
      if (!rows.length) continue;
      const headers = Object.keys(rows[0]);
      const dniCol = this.buscarHeader(headers, CANDIDATOS_DNI) ?? this.buscarIncluye(headers, FRAG_DNI);
      if (!dniCol) continue;
      const asesorCol = this.buscarHeader(headers, CANDIDATOS_ASESOR) ?? this.buscarIncluye(headers, FRAG_ASESOR);

      const dnis = Array.from(new Set(rows.map(r => this.dig(r[dniCol])).filter(d => d)));

      let gestionados = 0, contactados = 0, interesados = 0, ventasDni = 0;
      for (const d of dnis) {
        const e = idxModo.get(d);
        if (e?.gestionado) gestionados++;
        if (e?.contactado) contactados++;
        if (e?.interesado) interesados++;
        if (ventasSet.has(d)) ventasDni++;
      }
      // En Realzza, la "cartera kommo" toma sus ventas de VENTAS con TipoBase = BBDD KOMMO
      // (en vez del cruce por DNI). Las demás carteras siguen por cruce de DNI.
      const esCarteraKommo = this.norm(hoja).includes('kommo');
      const ventas = (this.modo === 'realzza' && esCarteraKommo) ? ventasBbddKommo : ventasDni;
      const emb = this.armarEmbudo(hoja, dnis.length, gestionados, contactados, interesados, ventas, this.paleta[ci++ % this.paleta.length], false);
      emb.hoja = hoja;
      // Detalle por asesor (solo si la cartera trae una columna de asesor).
      emb.detalle = asesorCol ? this.calcularDetalleAsesor(rows, dniCol, asesorCol, idxModo, ventasSet) : [];
      embudos.push(emb);
    }

    // 5) Embudo KOMMO (LEADS), desde la hoja "kommo" del Excel + la gestión Kommo del mes.
    //    ASIGNADOS = filas de la hoja (leads); CONTACTADOS = filas con "Modificado por" no vacío;
    //    GESTIONADOS = registros de gestión Kommo con FECHA DE LEAD ASIGNADO en el mes;
    //    INTERESADOS = de esos, RESULTADO DE GESTIÓN = INTERESADO; VENTAS = ventas con CONTACTO = KOMMO.
    if (hojaKommo) {
      const rowsK = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[hojaKommo], { defval: '', raw: false });
      const headersK = rowsK.length ? Object.keys(rowsK[0]) : [];
      const colMod = this.buscarHeader(headersK, ['Modificado por', 'MODIFICADO POR']) ?? this.buscarIncluye(headersK, ['modificadopor']);
      const asignados = rowsK.length;
      const contactados = colMod ? rowsK.filter(r => (r[colMod] ?? '').toString().trim() !== '').length : 0;
      const gestionados = kommoMes.length;
      const interesados = kommoMes.filter(r => (r['RESULTADO DE GESTIÓN'] || '').toString().trim().toUpperCase() === 'INTERESADO').length;

      // TOTAL VENTAS del embudo Kommo = ventas KOMMO + ventas MARKET PLACE (ambas en la columna CONTACTO).
      const ventasTotalK = ventasKommo + ventasMarket;
      const emb = this.armarEmbudo('KOMMO (LEADS)', asignados, gestionados, contactados, interesados, ventasTotalK, this.paleta[ci++ % this.paleta.length], true);
      emb.marketPlace = ventasMarket;
      embudos.push(emb);
    }

    this.embudos = embudos;
  }

  /** ¿La fecha (d/m/yyyy | d.m.yyyy | yyyy-m-d) cae en el mes/año dados? */
  private fechaEnMes(valor: any, mes: number, anio: number): boolean {
    if (!valor) return false;
    const s = valor.toString().trim().split(' ')[0];
    const p = s.split(/[\/.\-]/).map((x: string) => x.trim());
    if (p.length < 3) return false;
    let d: number, m: number, y: number;
    if (p[0].length === 4) { y = +p[0]; m = +p[1]; d = +p[2]; }
    else { d = +p[0]; m = +p[1]; y = +p[2]; }
    void d;
    if (isNaN(m) || isNaN(y)) return false;
    return (m - 1) === mes && y === anio;
  }

  private armarEmbudo(titulo: string, asignados: number, gestionados: number, contactados: number,
                      interesados: number, ventas: number, color: string, kommoLeads: boolean): Embudo {
    const r = (n: number) => (asignados > 0 ? Math.round((n / asignados) * 1000) / 10 : 0);
    // DERIVADOS = TOTAL VENTAS (según lo definido).
    let etapas: Etapa[] = [
      { nombre: 'ASIGNADOS',    op: asignados,   ratio: 100,           codigo: '' },
      { nombre: 'GESTIONADOS',  op: gestionados, ratio: r(gestionados), codigo: '' },
      { nombre: 'CONTACTADOS',  op: contactados, ratio: r(contactados), codigo: '' },
      { nombre: 'INTERESADOS',  op: interesados, ratio: r(interesados), codigo: '' },
      { nombre: 'DERIVADOS',    op: ventas,      ratio: r(ventas),      codigo: '' },
      { nombre: 'TOTAL VENTAS', op: ventas,      ratio: r(ventas),      codigo: '' },
    ];
    // Solo en el embudo KOMMO: CONTACTADOS va en 2º lugar (antes de GESTIONADOS).
    if (kommoLeads) etapas = [etapas[0], etapas[2], etapas[1], etapas[3], etapas[4], etapas[5]];
    const codigos = ['RG/A', 'RCT/A', 'RI/A', 'RD/A', 'RV/A', ''];
    etapas.forEach((e, i) => (e.codigo = codigos[i]));
    return { titulo, color, kommoLeads, asignados, etapas };
  }

  /**
   * Detalle por asesor de una cartera: agrupa los DNIs por asesor y, cruzando con
   * la gestión del mes, calcula asignados / gestionados / FALTA (pendientes) /
   * contactados / interesados / ventas / % avance. Ordena por los que más faltan.
   */
  private calcularDetalleAsesor(rows: Record<string, any>[], dniCol: string, asesorCol: string,
                                idxModo: Map<string, EstadoDni>, ventasSet: Set<string>): DetalleAsesor[] {
    const porAsesor = new Map<string, Set<string>>();
    for (const r of rows) {
      const dni = this.dig(r[dniCol]);
      if (!dni) continue;
      const asesor = (r[asesorCol] ?? '').toString().trim().toUpperCase() || 'SIN ASESOR';
      if (!porAsesor.has(asesor)) porAsesor.set(asesor, new Set());
      porAsesor.get(asesor)!.add(dni);
    }

    const detalle: DetalleAsesor[] = [];
    porAsesor.forEach((dnis, asesor) => {
      let g = 0, c = 0, i = 0, v = 0;
      dnis.forEach(d => {
        const e = idxModo.get(d);
        if (e?.gestionado) g++;
        if (e?.contactado) c++;
        if (e?.interesado) i++;
        if (ventasSet.has(d)) v++;
      });
      const asignados = dnis.size;
      detalle.push({
        asesor, asignados, gestionados: g, pendientes: asignados - g,
        contactados: c, interesados: i, ventas: v,
        pctAvance: asignados > 0 ? Math.round((g / asignados) * 1000) / 10 : 0,
      });
    });
    detalle.sort((a, b) => b.pendientes - a.pendientes);
    return detalle;
  }

  onCellPreparedDetalle(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'data') {
      if (e.column.dataField === 'pendientes' && e.data.pendientes > 0) {
        e.cellElement.style.color = '#b71c1c';
        e.cellElement.style.fontWeight = '700';
      }
      if (e.column.dataField === 'pctAvance') {
        const p = e.data.pctAvance;
        e.cellElement.style.fontWeight = '700';
        e.cellElement.style.color = p >= 80 ? '#2E7D32' : p >= 50 ? '#E65100' : '#b71c1c';
      }
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.backgroundColor = '#f0f3fa';
    }
  }

  /** Índice DNI(dígitos) → estado agregado (gestionado/contactado/interesado). */
  private indexar(data: any[], colDni: string, colEstado: string, colResultado: string): Map<string, EstadoDni> {
    const map = new Map<string, EstadoDni>();
    for (const item of data) {
      const dni = this.dig(item[colDni]);
      if (!dni) continue;
      const estado = (item[colEstado] || '').toString().trim().toUpperCase();
      const resultado = (item[colResultado] || '').toString().trim().toUpperCase();
      let e = map.get(dni);
      if (!e) { e = { gestionado: true, contactado: false, interesado: false }; map.set(dni, e); }
      if (estado === 'CONTACTO') e.contactado = true;
      if (resultado === 'INTERESADO') e.interesado = true;
    }
    return map;
  }

  // ── Helpers ──
  private buscarHeader(headers: string[], candidatos: string[]): string | undefined {
    for (const c of candidatos) {
      const o = this.norm(c);
      const h = headers.find(x => this.norm(x) === o);
      if (h) return h;
    }
    return undefined;
  }
  private buscarIncluye(headers: string[], fragmentos: string[]): string | undefined {
    return headers.find(h => { const n = this.norm(h); return fragmentos.some(f => n.includes(f)); });
  }
  private norm(s: any): string {
    return (s ?? '').toString().toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }
  private dig(v: any): string { return (v ?? '').toString().replace(/\D/g, ''); }

  anchoBarra(e: Etapa): number {
    // Ancho relativo al asignados (la 1ª etapa = 100%). Mínimo visible, tope 100%.
    // El ancho mínimo real lo garantiza el CSS (min-width) para que el número quepa dentro.
    return Math.min(100, Math.max(e.ratio, e.op > 0 ? 4 : 0));
  }
}
