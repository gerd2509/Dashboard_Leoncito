import { Component, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { lastValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { SheetsService } from '../../services/service-google.service';

/** Columnas de teléfono a considerar de la cartera importada. */
const COLUMNAS_TELEFONO = [
  'CEL actual', 'Telefono', 'Fax', 'Movil', 'Nextel',
  'ProvedorExterno1', 'ProvedorExterno2', 'ProvedorExterno3',
];

// Candidatos de cabecera para DNI y asesor en el Excel de cartera.
const CANDIDATOS_DNI = [
  'DNI', 'Dni', 'DNI CLIENTE', 'DNICLIENTE', 'DNI_CLIENTE', 'NRO DNI', 'N° DNI', 'NUM DNI',
  'DOCUMENTO', 'NRO DOCUMENTO', 'N° DOCUMENTO', 'DOC', 'DOC IDENTIDAD', 'DOCUMENTO IDENTIDAD',
  'DOCUMENTO DE IDENTIDAD', 'DOCIDENTIDAD', 'NRO DOC',
];
const CANDIDATOS_ASESOR = [
  'ASESOR CONTACT', 'ASESORCONTACT', 'ASESOR CONTACTO', 'ASESORCONTACTO',
  'ASIGNACION CONTACT', 'ASIGNACIONCONTACT', 'ASIGNACION CONTACTO', 'ASIGNACIONCONTACTO',
  'ASESOR REALZZA', 'ASIGNACION REALZZA',
];

// Columnas de la gestión (Call Center / Realzza).
const G_DNI = 'DNI CLIENTE';
const G_CELULAR = 'CELULAR GESTIONADO';
const G_ESTADO = 'ESTADO DE GESTIÓN';
const G_FECHA = 'Marca temporal';

type Modo = 'leoncito' | 'realzza';
type EstadoCliente = 'CONTACTO' | 'NO CONTACTO' | 'PENDIENTE';

interface ClienteCartera {
  dni: string;
  asesor: string;
  telefonos: string[];
  estado: EstadoCliente;
  fechaGestion: Date | null;
  diaGestion: number | null;
  raw: Record<string, any>;
}

interface ResumenAsesor {
  asesor: string;
  asignados: number;
  gestionados: number;
  contacto: number;
  noContacto: number;
  pendientes: number;
  avance: number; // %
}

interface RegGestion { fecha: Date; estado: EstadoCliente; }

@Component({
  selector: 'app-avance-cartera',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './avance-cartera.component.html',
  styleUrls: ['./avance-cartera.component.css'],
})
export class AvanceCarteraComponent {
  private sheets = inject(SheetsService);

  // ── Modo / estado UI ──
  modo: Modo | null = null;
  arrastrando = false;
  procesando = false;
  error = '';
  nombreArchivo = '';
  listo = false;

  // Mes de gestión a comparar (se usa mes + año).
  fecha: Date = new Date();

  // ── Datos calculados ──
  private headersOriginales: string[] = [];
  clientes: ClienteCartera[] = [];
  resumenAsesores: ResumenAsesor[] = [];
  porDia: { dia: string; Contacto: number; 'No Contacto': number; Total: number }[] = [];
  distribucion: { tipo: string; valor: number; color: string }[] = [];

  // KPIs globales
  totalCartera = 0;
  totalGestionados = 0;
  totalContacto = 0;
  totalNoContacto = 0;
  totalPendientes = 0;
  avanceGlobal = 0;
  gestionesMes = 0;

  // Proyección
  diasTranscurridos = 0;
  diasMes = 0;
  ritmoDiario = 0;
  diasParaTerminar = 0;

  get nombreCartera(): string {
    return this.modo === 'realzza' ? 'Realzza' : 'Leoncito';
  }
  get puedeCargar(): boolean { return !!this.fecha; }

  // ── Selección de modo ──
  seleccionarModo(m: Modo): void { this.modo = m; this.reiniciar(); }
  volverModos(): void { this.modo = null; this.reiniciar(); }

  // ── Carga de archivo ──
  onDragOver(e: DragEvent): void { e.preventDefault(); this.arrastrando = true; }
  onDragLeave(e: DragEvent): void { e.preventDefault(); this.arrastrando = false; }
  onDrop(e: DragEvent): void {
    e.preventDefault(); this.arrastrando = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this.procesarArchivo(file);
  }
  onFileChange(e: Event): void {
    const t = e.target as HTMLInputElement;
    const file = t.files?.[0];
    if (file) this.procesarArchivo(file);
    t.value = '';
  }

  reiniciar(): void {
    this.listo = false; this.error = ''; this.nombreArchivo = '';
    this.headersOriginales = [];
    this.clientes = []; this.resumenAsesores = []; this.porDia = []; this.distribucion = [];
    this.totalCartera = this.totalGestionados = this.totalContacto = 0;
    this.totalNoContacto = this.totalPendientes = this.avanceGlobal = this.gestionesMes = 0;
    this.diasTranscurridos = this.diasMes = this.ritmoDiario = this.diasParaTerminar = 0;
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
        const ws = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: false });
        if (!filas.length) throw new Error('El archivo no contiene filas de datos.');
        await this.calcularAvance(filas);
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

  // ── Núcleo: cruzar cartera con la gestión ──
  private async calcularAvance(filas: Record<string, any>[]): Promise<void> {
    this.headersOriginales = Object.keys(filas[0]);
    // DNI: candidatos exactos y, si falla, cualquier cabecera que contenga "dni"/"documento".
    const dniHeader = this.buscarHeader(this.headersOriginales, CANDIDATOS_DNI)
      ?? this.buscarHeaderIncluye(this.headersOriginales, ['dni', 'documento', 'docidentidad']);
    const asesorHeader = this.buscarHeader(this.headersOriginales, CANDIDATOS_ASESOR)
      ?? this.buscarHeaderIncluye(this.headersOriginales, ['asesorcontact', 'asignacioncontact', 'asesorrealzza', 'asesor', 'asignacion']);
    const telHeaders = COLUMNAS_TELEFONO
      .map(c => this.buscarHeaderExacto(this.headersOriginales, c))
      .filter((h): h is string => !!h);

    if (!dniHeader) throw new Error('No se encontró la columna de DNI en el archivo.');
    if (!asesorHeader) throw new Error('No se encontró la columna de asesor (ASESOR CONTACT / ASIGNACION CONTACT).');

    // 1) Índices de gestión del mes seleccionado (por DNI y por teléfono).
    const { porDni, porTel } = await this.cargarGestion();

    // 2) Clasificar cada cliente de la cartera.
    const clientes: ClienteCartera[] = filas.map(fila => {
      const dni = this.soloDigitos(String(fila[dniHeader] ?? ''));
      const asesor = (fila[asesorHeader] || 'SIN ASESOR').toString().trim().toUpperCase();
      const telefonos = telHeaders
        .flatMap(h => this.extraerNumeros(fila[h]))
        .filter((v, i, arr) => arr.indexOf(v) === i);

      // Busca la última gestión por DNI o por cualquiera de sus teléfonos.
      const candidatos: RegGestion[] = [];
      const g = porDni.get(dni); if (g) candidatos.push(g);
      telefonos.forEach(t => {
        const gt = porTel.get(t.slice(-9));
        if (gt) candidatos.push(gt);
      });

      let estado: EstadoCliente = 'PENDIENTE';
      let fechaGestion: Date | null = null;
      if (candidatos.length) {
        const ultima = candidatos.reduce((a, b) => (b.fecha > a.fecha ? b : a));
        estado = ultima.estado;
        fechaGestion = ultima.fecha;
      }

      return {
        dni, asesor, telefonos, estado, fechaGestion,
        diaGestion: fechaGestion ? fechaGestion.getDate() : null,
        raw: fila,
      };
    });

    this.clientes = clientes;
    this.construirResumen(clientes);
    this.construirPorDia(clientes);
    this.construirDistribucion();
    this.construirProyeccion();
  }

  /** Trae la gestión (Call o Realzza) y arma índices por DNI y por teléfono del mes seleccionado. */
  private async cargarGestion(): Promise<{ porDni: Map<string, RegGestion>; porTel: Map<string, RegGestion> }> {
    const mes = this.fecha.getMonth();
    const anio = this.fecha.getFullYear();

    let data: any[] = [];
    try {
      data = this.modo === 'realzza'
        ? await lastValueFrom(this.sheets.getSheetDataCampo())
        : await lastValueFrom(this.sheets.getSheetData());
    } catch {
      throw new Error('No se pudo cargar la gestión (revisa la conexión al servidor).');
    }

    const porDni = new Map<string, RegGestion>();
    const porTel = new Map<string, RegGestion>();
    let count = 0;

    for (const item of data) {
      const fecha = this.parseMarcaTemporal(item[G_FECHA]);
      if (!fecha || fecha.getMonth() !== mes || fecha.getFullYear() !== anio) continue;

      const estadoRaw = (item[G_ESTADO] || '').toString().trim().toUpperCase();
      const estado: EstadoCliente = estadoRaw === 'CONTACTO' ? 'CONTACTO' : 'NO CONTACTO';
      count++;

      const dni = this.soloDigitos(String(item[G_DNI] ?? ''));
      if (dni) this.guardarUltima(porDni, dni, { fecha, estado });

      const tel = this.soloDigitos(String(item[G_CELULAR] ?? '')).slice(-9);
      if (tel.length >= 9) this.guardarUltima(porTel, tel, { fecha, estado });
    }

    this.gestionesMes = count;
    return { porDni, porTel };
  }

  private guardarUltima(map: Map<string, RegGestion>, key: string, reg: RegGestion): void {
    const actual = map.get(key);
    if (!actual || reg.fecha > actual.fecha) map.set(key, reg);
  }

  // ── Agregados ──
  private construirResumen(clientes: ClienteCartera[]): void {
    const map = new Map<string, ResumenAsesor>();
    for (const c of clientes) {
      let r = map.get(c.asesor);
      if (!r) {
        r = { asesor: c.asesor, asignados: 0, gestionados: 0, contacto: 0, noContacto: 0, pendientes: 0, avance: 0 };
        map.set(c.asesor, r);
      }
      r.asignados++;
      if (c.estado === 'PENDIENTE') r.pendientes++;
      else {
        r.gestionados++;
        if (c.estado === 'CONTACTO') r.contacto++; else r.noContacto++;
      }
    }
    map.forEach(r => { r.avance = r.asignados > 0 ? Math.round((r.gestionados / r.asignados) * 100) : 0; });
    this.resumenAsesores = Array.from(map.values()).sort((a, b) => b.avance - a.avance || b.asignados - a.asignados);

    this.totalCartera = clientes.length;
    this.totalContacto = clientes.filter(c => c.estado === 'CONTACTO').length;
    this.totalNoContacto = clientes.filter(c => c.estado === 'NO CONTACTO').length;
    this.totalGestionados = this.totalContacto + this.totalNoContacto;
    this.totalPendientes = clientes.filter(c => c.estado === 'PENDIENTE').length;
    this.avanceGlobal = this.totalCartera > 0 ? Math.round((this.totalGestionados / this.totalCartera) * 100) : 0;
  }

  private construirPorDia(clientes: ClienteCartera[]): void {
    this.diasMes = new Date(this.fecha.getFullYear(), this.fecha.getMonth() + 1, 0).getDate();
    const filas: { dia: string; Contacto: number; 'No Contacto': number; Total: number }[] = [];
    for (let d = 1; d <= this.diasMes; d++) {
      filas.push({ dia: String(d), Contacto: 0, 'No Contacto': 0, Total: 0 });
    }
    clientes.forEach(c => {
      if (c.estado === 'PENDIENTE' || !c.diaGestion) return;
      const f = filas[c.diaGestion - 1];
      if (!f) return;
      if (c.estado === 'CONTACTO') f.Contacto++; else f['No Contacto']++;
      f.Total++;
    });
    this.porDia = filas;
  }

  private construirDistribucion(): void {
    this.distribucion = [
      { tipo: 'Contacto', valor: this.totalContacto, color: '#2E9E5B' },
      { tipo: 'No Contacto', valor: this.totalNoContacto, color: '#E0603A' },
      { tipo: 'Pendiente', valor: this.totalPendientes, color: '#9AA7BB' },
    ];
  }

  private construirProyeccion(): void {
    const hoy = new Date();
    const esMesActual = hoy.getMonth() === this.fecha.getMonth() && hoy.getFullYear() === this.fecha.getFullYear();
    this.diasTranscurridos = esMesActual ? hoy.getDate() : this.diasMes;
    this.ritmoDiario = this.diasTranscurridos > 0 ? Math.round(this.totalGestionados / this.diasTranscurridos) : 0;
    this.diasParaTerminar = this.ritmoDiario > 0 ? Math.ceil(this.totalPendientes / this.ritmoDiario) : 0;
  }

  claseAvance(pct: number): string {
    if (pct >= 80) return 'av-ok';
    if (pct >= 50) return 'av-medio';
    return 'av-bajo';
  }

  // ── Exportaciones ──
  async exportarPendientes(): Promise<void> {
    const pendientes = this.clientes.filter(c => c.estado === 'PENDIENTE');
    if (!pendientes.length) { this.error = 'No hay clientes pendientes para exportar.'; return; }
    await this.exportarClientes(pendientes, 'Pendientes', '_PENDIENTES', false);
  }

  async exportarDetalle(): Promise<void> {
    if (!this.clientes.length) return;
    await this.exportarClientes(this.clientes, 'Detalle', '_DETALLE', true);
  }

  private async exportarClientes(lista: ClienteCartera[], hoja: string, sufijo: string, conEstado: boolean): Promise<void> {
    const wb = new Workbook();
    const ws = wb.addWorksheet(hoja);
    const headers = conEstado
      ? [...this.headersOriginales, 'ESTADO AVANCE', 'FECHA GESTIÓN']
      : [...this.headersOriginales];

    const hr = ws.addRow(headers);
    hr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });

    for (const c of lista) {
      const base = this.headersOriginales.map(h => c.raw[h] ?? '');
      const extra = conEstado
        ? [c.estado, c.fechaGestion ? c.fechaGestion.toLocaleDateString('es-PE') : '']
        : [];
      const row = ws.addRow([...base, ...extra]);
      if (conEstado) {
        const argb = c.estado === 'CONTACTO' ? 'FFD6F5DD' : c.estado === 'NO CONTACTO' ? 'FFFAD9CE' : 'FFECEFF3';
        row.getCell(headers.length - 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      }
    }

    ws.columns.forEach(col => { col.width = 16; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const nombre = this.nombreArchivo.replace(/\.[^/.]+$/, '') || 'cartera';
    FileSaver.saveAs(blob, `${nombre}${sufijo}.xlsx`);
  }

  // ── Helpers ──
  private buscarHeader(headers: string[], candidatos: string[]): string | undefined {
    for (const c of candidatos) {
      const h = this.buscarHeaderExacto(headers, c);
      if (h) return h;
    }
    return undefined;
  }

  private buscarHeaderExacto(headers: string[], objetivo: string): string | undefined {
    const o = this.normHeader(objetivo);
    return headers.find(h => this.normHeader(h) === o);
  }

  /** Devuelve la 1ª cabecera cuyo nombre normalizado CONTENGA alguno de los fragmentos. */
  private buscarHeaderIncluye(headers: string[], fragmentos: string[]): string | undefined {
    return headers.find(h => {
      const n = this.normHeader(h);
      return fragmentos.some(f => n.includes(f));
    });
  }

  private normHeader(s: string): string {
    return s.toString().toLowerCase().trim().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  private extraerNumeros(valor: any): string[] {
    if (valor === null || valor === undefined) return [];
    const t = String(valor).trim();
    if (!t) return [];
    return t.split(/[\/,;\n\r|]+/).map(p => p.replace(/\D/g, '')).filter(p => p.length > 0);
  }

  private soloDigitos(v: string): string { return (v || '').toString().replace(/\D/g, ''); }

  private parseMarcaTemporal(texto: any): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const m = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/);
    if (!m) return null;
    const day = +m[1], month = +m[2] - 1, year = +m[3];
    let hour = m[4] ? +m[4] : 0; const min = m[5] ? +m[5] : 0; const sec = m[6] ? +m[6] : 0;
    const ap = m[7]?.toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  customizeTooltipPie = (arg: any) => ({ text: `${arg.argumentText}: ${arg.value} (${arg.percentText})` });
  customizeLabelPie = (arg: any) => `${arg.argumentText}: ${arg.valueText} (${arg.percentText})`;
  customizePointPie = (p: any) => ({ color: p.data?.color });
}
