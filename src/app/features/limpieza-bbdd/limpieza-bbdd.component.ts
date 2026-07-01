import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { lastValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { SheetsService } from '../../services/service-google.service';

/** Columnas que contienen teléfonos a consolidar (orden de salida, izquierda → derecha). */
const COLUMNAS_TELEFONO = [
  'CEL actual',
  'Telefono',
  'Fax',
  'Movil',
  'Nextel',
  'ProvedorExterno1',
  'ProvedorExterno2',
  'ProvedorExterno3',
];

const COLUMNA_DNI = 'Dni';

// Columnas del formulario de gestión Call Center (/data/call).
const G_DNI = 'DNI CLIENTE';
const G_CELULAR = 'CELULAR GESTIONADO';
const G_ESTADO = 'ESTADO DE GESTIÓN';
const G_FECHA = 'Marca temporal';

type Modo = 'sedes' | 'call';
type Estado = 'CONTACTO' | 'NO CONTACTO' | 'SIN GESTION';

interface FilaPreview {
  dni: string;
  numeros: string[];
}

interface NumeroEstado {
  numero: string;
  estado: Estado;
}

interface DniCall {
  dni: string;
  base: Record<string, any>;   // valores de columnas NO teléfono (del 1er registro del DNI)
  numeros: NumeroEstado[];     // números únicos con su estado de gestión
}

@Component({
  selector: 'app-limpieza-bbdd',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ...DX_COMMON_MODULES],
  templateUrl: './limpieza-bbdd.component.html',
  styleUrls: ['./limpieza-bbdd.component.css'],
})
export class LimpiezaBbddComponent {
  private sheets = inject(SheetsService);

  // ── Modo activo ──
  modo: Modo | null = null;

  // ── Estado de UI ──
  arrastrando = false;
  procesando = false;
  error = '';
  nombreArchivo = '';

  // ── Rango de fechas (modo Call) ──
  fechaInicio: Date | null = null;
  fechaFin: Date | null = null;

  // ── Resultado del procesamiento ──
  listoParaDescargar = false;
  private headersSalida: string[] = [];
  private filasSalida: Record<string, any>[] = [];

  // Modo Call: salida reconstruida al exportar
  private dnisCall: DniCall[] = [];
  private headersOriginales: string[] = [];
  private telHeadersOrden: string[] = [];
  private baseHeaders: string[] = [];

  // ── Métricas comunes ──
  totalFilasLeidas = 0;
  totalDnis = 0;
  numerosAntes = 0;
  numerosUnicos = 0;
  duplicadosEliminados = 0;
  maxNumerosPorDni = 0;

  // ── Métricas modo Call ──
  gestionesRango = 0;
  callContacto = 0;
  callNoContacto = 0;
  callSinGestion = 0;
  callSinTelefono = 0;

  // ── Vista previa ──
  preview: FilaPreview[] = [];       // modo Sedes
  previewCall: DniCall[] = [];       // modo Call (con color)
  columnasNumero: string[] = [];

  // ──────────────────────────────────────────────────────────────────────────
  // Selección de modo
  // ──────────────────────────────────────────────────────────────────────────
  seleccionarModo(m: Modo): void {
    this.modo = m;
    this.reiniciar();
  }

  volverModos(): void {
    this.modo = null;
    this.reiniciar();
  }

  get puedeCargarCall(): boolean {
    return !!this.fechaInicio && !!this.fechaFin;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Eventos de carga
  // ──────────────────────────────────────────────────────────────────────────
  onDragOver(evt: DragEvent): void {
    evt.preventDefault();
    this.arrastrando = true;
  }

  onDragLeave(evt: DragEvent): void {
    evt.preventDefault();
    this.arrastrando = false;
  }

  onDrop(evt: DragEvent): void {
    evt.preventDefault();
    this.arrastrando = false;
    if (this.modo === 'call' && !this.puedeCargarCall) {
      this.error = 'Selecciona el rango de fechas antes de cargar el archivo.';
      return;
    }
    const file = evt.dataTransfer?.files?.[0];
    if (file) this.procesarArchivo(file);
  }

  onFileChange(evt: Event): void {
    const target = evt.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) this.procesarArchivo(file);
    target.value = '';
  }

  reiniciar(): void {
    this.listoParaDescargar = false;
    this.error = '';
    this.nombreArchivo = '';
    this.preview = [];
    this.previewCall = [];
    this.filasSalida = [];
    this.headersSalida = [];
    this.dnisCall = [];
    this.headersOriginales = [];
    this.telHeadersOrden = [];
    this.baseHeaders = [];
    this.totalFilasLeidas = 0;
    this.totalDnis = 0;
    this.numerosAntes = 0;
    this.numerosUnicos = 0;
    this.duplicadosEliminados = 0;
    this.maxNumerosPorDni = 0;
    this.gestionesRango = 0;
    this.callContacto = 0;
    this.callNoContacto = 0;
    this.callSinGestion = 0;
    this.callSinTelefono = 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lectura del archivo
  // ──────────────────────────────────────────────────────────────────────────
  private procesarArchivo(file: File): void {
    const listo = this.listoParaDescargar;
    this.reiniciar();
    this.nombreArchivo = file.name;
    this.procesando = true;
    void listo;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
          defval: '',
          raw: false,
        });

        if (!filas.length) {
          throw new Error('El archivo no contiene filas de datos.');
        }

        if (this.modo === 'call') {
          await this.limpiarCall(filas);
        } else {
          this.limpiarSedes(filas);
        }
        this.listoParaDescargar = true;
      } catch (err: any) {
        this.error = err?.message ?? 'No se pudo procesar el archivo.';
      } finally {
        this.procesando = false;
      }
    };
    reader.onerror = () => {
      this.error = 'Error al leer el archivo.';
      this.procesando = false;
    };
    reader.readAsArrayBuffer(file);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODO SEDES — consolida números por DNI (comportamiento original)
  // ──────────────────────────────────────────────────────────────────────────
  private limpiarSedes(filas: Record<string, any>[]): void {
    this.totalFilasLeidas = filas.length;

    const headersOriginales = Object.keys(filas[0]);
    const dniHeader = this.buscarHeader(headersOriginales, COLUMNA_DNI);
    const telHeaders = COLUMNAS_TELEFONO
      .map((c) => this.buscarHeader(headersOriginales, c))
      .filter((h): h is string => !!h);

    if (!dniHeader) {
      throw new Error(`No se encontró la columna "${COLUMNA_DNI}" en el archivo.`);
    }
    if (!telHeaders.length) {
      throw new Error('No se encontró ninguna columna de teléfonos para limpiar.');
    }

    const headersBase = headersOriginales.filter((h) => !telHeaders.includes(h));

    const grupos = new Map<string, { base: Record<string, any>; numeros: string[] }>();
    let totalNumerosAntes = 0;

    filas.forEach((fila, idx) => {
      const dniRaw = String(fila[dniHeader] ?? '').trim();
      const clave = dniRaw !== '' ? `dni:${dniRaw}` : `fila:${idx}`;

      let grupo = grupos.get(clave);
      if (!grupo) {
        grupo = { base: { ...fila }, numeros: [] };
        grupos.set(clave, grupo);
      }

      for (const h of telHeaders) {
        const nums = this.extraerNumeros(fila[h]);
        totalNumerosAntes += nums.length;
        for (const n of nums) {
          if (!grupo.numeros.includes(n)) grupo.numeros.push(n);
        }
      }
    });

    let maxNumeros = 0;
    grupos.forEach((g) => (maxNumeros = Math.max(maxNumeros, g.numeros.length)));
    maxNumeros = Math.max(maxNumeros, 1);

    const colsNumero: string[] = [];
    for (let i = 0; i < maxNumeros; i++) {
      colsNumero.push(telHeaders[i] ?? `Telefono ${i + 1}`);
    }

    this.headersSalida = [...headersBase, ...colsNumero];
    this.columnasNumero = colsNumero;

    const salida: Record<string, any>[] = [];
    let totalUnicos = 0;

    grupos.forEach((g) => {
      const fila: Record<string, any> = {};
      for (const h of headersBase) fila[h] = g.base[h] ?? '';
      colsNumero.forEach((col, i) => (fila[col] = g.numeros[i] ?? ''));
      salida.push(fila);
      totalUnicos += g.numeros.length;
    });

    this.filasSalida = salida;

    this.totalDnis = grupos.size;
    this.numerosAntes = totalNumerosAntes;
    this.numerosUnicos = totalUnicos;
    this.duplicadosEliminados = Math.max(0, totalNumerosAntes - totalUnicos);
    this.maxNumerosPorDni = maxNumeros;

    this.preview = salida.slice(0, 8).map((f) => ({
      dni: String(f[dniHeader] ?? ''),
      numeros: colsNumero.map((c) => String(f[c] ?? '')).filter((v) => v !== ''),
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODO CALL — consolida + cruza con la gestión Call Center (contacto/no contacto)
  // ──────────────────────────────────────────────────────────────────────────
  private async limpiarCall(filas: Record<string, any>[]): Promise<void> {
    this.totalFilasLeidas = filas.length;

    const headersOriginales = Object.keys(filas[0]);
    const dniHeader = this.buscarHeader(headersOriginales, COLUMNA_DNI);
    const telHeaders = COLUMNAS_TELEFONO
      .map((c) => this.buscarHeader(headersOriginales, c))
      .filter((h): h is string => !!h);

    if (!dniHeader) {
      throw new Error(`No se encontró la columna "${COLUMNA_DNI}" en el archivo.`);
    }
    if (!telHeaders.length) {
      throw new Error('No se encontró ninguna columna de teléfonos para limpiar.');
    }

    // 1) Cargar la gestión Call Center y armar el índice DNI → número → estado.
    const indiceGestion = await this.cargarGestionCall();

    // Columnas de teléfono en el ORDEN original del archivo (para reacomodar en su sitio).
    const telSet = new Set(telHeaders);
    this.headersOriginales = headersOriginales;
    this.telHeadersOrden = headersOriginales.filter((h) => telSet.has(h));
    this.baseHeaders = headersOriginales.filter((h) => !telSet.has(h));

    // 2) Agrupar por DNI y consolidar números únicos.
    const grupos = new Map<string, { base: Record<string, any>; numeros: string[] }>();
    let totalNumerosAntes = 0;

    filas.forEach((fila, idx) => {
      const dniRaw = String(fila[dniHeader] ?? '').trim();
      const clave = dniRaw !== '' ? `dni:${dniRaw}` : `fila:${idx}`;

      let grupo = grupos.get(clave);
      if (!grupo) {
        grupo = { base: { ...fila }, numeros: [] };
        grupos.set(clave, grupo);
      }
      for (const h of telHeaders) {
        const nums = this.extraerNumeros(fila[h]);
        totalNumerosAntes += nums.length;
        for (const n of nums) {
          if (!grupo.numeros.includes(n)) grupo.numeros.push(n);
        }
      }
    });

    // 3) Determinar el estado de cada número (por DNI + número contra la gestión).
    const dnis: DniCall[] = [];
    let totalUnicos = 0, cContacto = 0, cNoContacto = 0, cSinGestion = 0;

    grupos.forEach((g) => {
      const dni = String(g.base[dniHeader] ?? '').trim();
      const gestionDni = indiceGestion.get(this.soloDigitos(dni));
      const numeros: NumeroEstado[] = g.numeros.map((num) => {
        const estado = this.estadoDeNumero(num, gestionDni);
        if (estado === 'CONTACTO') cContacto++;
        else if (estado === 'NO CONTACTO') cNoContacto++;
        else cSinGestion++;
        return { numero: num, estado };
      });
      totalUnicos += numeros.length;
      dnis.push({ dni, base: g.base, numeros });
    });

    this.dnisCall = dnis;

    // 4) Métricas.
    this.totalDnis = grupos.size;
    this.numerosAntes = totalNumerosAntes;
    this.numerosUnicos = totalUnicos;
    this.duplicadosEliminados = Math.max(0, totalNumerosAntes - totalUnicos);
    this.callContacto = cContacto;
    this.callNoContacto = cNoContacto;
    this.callSinGestion = cSinGestion;
    // DNIs que quedarán sin teléfono tras eliminar los NO CONTACTO.
    this.callSinTelefono = dnis.filter((d) => this.numerosConservados(d).length === 0).length;
    this.maxNumerosPorDni = dnis.reduce((m, d) => Math.max(m, d.numeros.length), 0);

    // 5) Vista previa (primeros 10 DNIs, con color por estado).
    this.previewCall = dnis.slice(0, 10);
  }

  /** Trae la gestión Call Center del rango y arma DNI → (número → último estado). */
  private async cargarGestionCall(): Promise<Map<string, Map<string, Estado>>> {
    if (!this.fechaInicio || !this.fechaFin) {
      throw new Error('Selecciona el rango de fechas antes de procesar.');
    }
    const desde = new Date(this.fechaInicio); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(this.fechaFin); hasta.setHours(23, 59, 59, 999);

    let data: any[] = [];
    try {
      data = await lastValueFrom(this.sheets.getSheetData());
    } catch {
      throw new Error('No se pudo cargar la gestión Call Center (revisa la conexión al servidor).');
    }

    // DNI → número → { fecha, estado }  (guardamos la última gestión por número)
    const idx = new Map<string, Map<string, { fecha: Date; estado: Estado }>>();
    let enRango = 0;

    for (const item of data) {
      const fecha = this.parseMarcaTemporal(item[G_FECHA]);
      if (!fecha || fecha < desde || fecha > hasta) continue;

      const dni = this.soloDigitos(String(item[G_DNI] ?? ''));
      const numero = this.soloDigitos(String(item[G_CELULAR] ?? ''));
      if (!dni || !numero) continue;

      const estadoRaw = (item[G_ESTADO] || '').toString().trim().toUpperCase();
      const estado: Estado = estadoRaw === 'CONTACTO' ? 'CONTACTO'
        : estadoRaw === 'NO CONTACTO' ? 'NO CONTACTO' : 'SIN GESTION';
      if (estado === 'SIN GESTION') continue;

      enRango++;
      if (!idx.has(dni)) idx.set(dni, new Map());
      const porNum = idx.get(dni)!;
      const actual = porNum.get(numero);
      if (!actual || fecha > actual.fecha) porNum.set(numero, { fecha, estado });
    }

    this.gestionesRango = enRango;

    // Aplanar a DNI → número → estado
    const salida = new Map<string, Map<string, Estado>>();
    idx.forEach((porNum, dni) => {
      const m = new Map<string, Estado>();
      porNum.forEach((v, num) => m.set(num, v.estado));
      salida.set(dni, m);
    });
    return salida;
  }

  /** Estado de un número dentro de la gestión de su DNI (match por dígitos / últimos 9). */
  private estadoDeNumero(numero: string, gestionDni?: Map<string, Estado>): Estado {
    if (!gestionDni) return 'SIN GESTION';
    const n = this.soloDigitos(numero);
    if (gestionDni.has(n)) return gestionDni.get(n)!;
    const n9 = n.slice(-9);
    for (const [k, v] of gestionDni) {
      if (k.slice(-9) === n9 && n9.length >= 9) return v;
    }
    return 'SIN GESTION';
  }

  /** Números que se conservan al exportar: CONTACTO + no gestionados (se quitan los NO CONTACTO). */
  private numerosConservados(d: DniCall): NumeroEstado[] {
    return d.numeros.filter((n) => n.estado !== 'NO CONTACTO');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers de datos
  // ──────────────────────────────────────────────────────────────────────────
  private buscarHeader(headers: string[], objetivo: string): string | undefined {
    const norm = (s: string) =>
      s.toString().toLowerCase().trim().normalize('NFD')
        .replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
    const objetivoNorm = norm(objetivo);
    return headers.find((h) => norm(h) === objetivoNorm);
  }

  private extraerNumeros(valor: any): string[] {
    if (valor === null || valor === undefined) return [];
    const texto = String(valor).trim();
    if (!texto) return [];
    return texto
      .split(/[\/,;\n\r|]+/)
      .map((p) => p.replace(/\D/g, ''))
      .filter((p) => p.length > 0);
  }

  private soloDigitos(v: string): string {
    return (v || '').toString().replace(/\D/g, '');
  }

  // Parseo robusto de "Marca temporal" (dd/MM/yyyy [HH:mm[:ss]] [AM/PM])
  private parseMarcaTemporal(texto: any): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
    const m = texto.match(regex);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    let hour = m[4] ? parseInt(m[4], 10) : 0;
    const minute = m[5] ? parseInt(m[5], 10) : 0;
    const second = m[6] ? parseInt(m[6], 10) : 0;
    const ampm = m[7]?.toUpperCase() ?? null;
    if (ampm) {
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
    }
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const d = new Date(year, month, day, hour, minute, second, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  estadoClase(estado: Estado): string {
    return estado === 'CONTACTO' ? 'num-ok'
      : estado === 'NO CONTACTO' ? 'num-no' : 'num-neutro';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Descarga
  // ──────────────────────────────────────────────────────────────────────────
  async descargar(): Promise<void> {
    if (this.modo === 'call') return this.descargarCall();
    return this.descargarSedes();
  }

  private async descargarSedes(): Promise<void> {
    if (!this.filasSalida.length) return;

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Base Limpia');

    const headerRow = worksheet.addRow(this.headersSalida);
    this.estilarCabecera(headerRow);

    for (const fila of this.filasSalida) {
      const valores = this.headersSalida.map((h) => fila[h] ?? '');
      const row = worksheet.addRow(valores);
      row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'middle' }; });
    }

    this.autoAncho(worksheet);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    await this.guardar(workbook, '_LIMPIA');
  }

  /**
   * Modo Call: base limpia con los números reacomodados dentro de sus columnas de
   * teléfono originales (los NO CONTACTO se eliminan; los demás se realinean).
   * Los DNIs que quedan sin números van a la hoja SINTELEFONOS.
   */
  private async descargarCall(): Promise<void> {
    if (!this.dnisCall.length) return;

    // Slots = columnas de teléfono originales (en su sitio) + extra si hiciera falta.
    const conservadosPorDni = this.dnisCall.map((d) => ({
      d, nums: this.numerosConservados(d).map((n) => n),
    }));
    const maxNums = conservadosPorDni.reduce((m, x) => Math.max(m, x.nums.length), 0);

    const extraCols: string[] = [];
    for (let i = this.telHeadersOrden.length; i < maxNums; i++) {
      extraCols.push(`Telefono ${i + 1}`);
    }
    const slots = [...this.telHeadersOrden, ...extraCols];
    const outHeaders = [...this.headersOriginales, ...extraCols];
    const telSet = new Set(this.telHeadersOrden);

    const workbook = new Workbook();
    const ws = workbook.addWorksheet('Base Limpia');
    const wsSin = workbook.addWorksheet('SINTELEFONOS');

    this.estilarCabecera(ws.addRow(outHeaders));
    this.estilarCabecera(wsSin.addRow(this.baseHeaders));

    for (const { d, nums } of conservadosPorDni) {
      if (nums.length === 0) {
        // DNI sin teléfonos → hoja SINTELEFONOS con sus datos no-teléfono.
        wsSin.addRow(this.baseHeaders.map((h) => d.base[h] ?? ''));
        continue;
      }

      // Fila con columnas originales; teléfonos vaciados y luego rellenados en su sitio.
      const fila: Record<string, any> = {};
      for (const h of this.headersOriginales) fila[h] = telSet.has(h) ? '' : (d.base[h] ?? '');
      for (const c of extraCols) fila[c] = '';
      nums.forEach((n, i) => { if (slots[i]) fila[slots[i]] = n.numero; });

      const row = ws.addRow(outHeaders.map((h) => fila[h] ?? ''));
      // Pinta de verde las celdas de teléfono que fueron CONTACTO.
      nums.forEach((n, i) => {
        if (n.estado !== 'CONTACTO') return;
        const colIdx = outHeaders.indexOf(slots[i]) + 1;
        if (colIdx > 0) {
          row.getCell(colIdx).fill = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6F5DD' },
          };
        }
      });
      row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'middle' }; });
    }

    this.autoAncho(ws);
    this.autoAncho(wsSin);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    wsSin.views = [{ state: 'frozen', ySplit: 1 }];
    await this.guardar(workbook, '_CALL_LIMPIA');
  }

  private estilarCabecera(headerRow: any): void {
    headerRow.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCDAEE' } } };
    });
  }

  private autoAncho(worksheet: any): void {
    worksheet.columns.forEach((col: any) => {
      if (!col || !col.values) return;
      const lengths = col.values.filter((v: any) => v != null).map((v: any) => v.toString().length + 2);
      col.width = lengths.length ? Math.min(40, Math.max(12, ...lengths)) : 14;
    });
  }

  private async guardar(workbook: Workbook, sufijo: string): Promise<void> {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const base = this.nombreArchivo.replace(/\.[^/.]+$/, '') || 'base';
    FileSaver.saveAs(blob, `${base}${sufijo}.xlsx`);
  }
}
