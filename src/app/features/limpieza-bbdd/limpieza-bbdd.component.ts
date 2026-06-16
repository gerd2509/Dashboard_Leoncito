import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';

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

interface FilaPreview {
  dni: string;
  numeros: string[];
}

@Component({
  selector: 'app-limpieza-bbdd',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './limpieza-bbdd.component.html',
  styleUrls: ['./limpieza-bbdd.component.css'],
})
export class LimpiezaBbddComponent {
  // ── Estado de UI ──
  arrastrando = false;
  procesando = false;
  error = '';
  nombreArchivo = '';

  // ── Resultado del procesamiento ──
  listoParaDescargar = false;
  private headersSalida: string[] = [];
  private filasSalida: Record<string, any>[] = [];

  // ── Métricas ──
  totalFilasLeidas = 0;
  totalDnis = 0;
  numerosAntes = 0;
  numerosUnicos = 0;
  duplicadosEliminados = 0;
  maxNumerosPorDni = 0;

  // ── Vista previa (primeras filas) ──
  preview: FilaPreview[] = [];
  columnasNumero: string[] = [];

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
    this.filasSalida = [];
    this.headersSalida = [];
    this.totalFilasLeidas = 0;
    this.totalDnis = 0;
    this.numerosAntes = 0;
    this.numerosUnicos = 0;
    this.duplicadosEliminados = 0;
    this.maxNumerosPorDni = 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lógica principal de limpieza
  // ──────────────────────────────────────────────────────────────────────────
  private procesarArchivo(file: File): void {
    this.reiniciar();
    this.nombreArchivo = file.name;
    this.procesando = true;

    const reader = new FileReader();
    reader.onload = (e) => {
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

        this.limpiar(filas);
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

  private limpiar(filas: Record<string, any>[]): void {
    this.totalFilasLeidas = filas.length;

    // Resolver los nombres reales de las cabeceras (tolerante a may/min y acentos).
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

    // Columnas que NO son teléfono (se conservan tal cual del primer registro del DNI).
    const headersBase = headersOriginales.filter((h) => !telHeaders.includes(h));

    // Agrupar por DNI. Si no hay DNI, cada fila es su propio grupo (no se mezclan).
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

    // Cuántas columnas de teléfono necesita el archivo de salida.
    let maxNumeros = 0;
    grupos.forEach((g) => (maxNumeros = Math.max(maxNumeros, g.numeros.length)));
    maxNumeros = Math.max(maxNumeros, 1);

    // Cabeceras de teléfono de salida: reutiliza las originales y agrega extra si hace falta.
    const colsNumero: string[] = [];
    for (let i = 0; i < maxNumeros; i++) {
      colsNumero.push(telHeaders[i] ?? `Telefono ${i + 1}`);
    }

    this.headersSalida = [...headersBase, ...colsNumero];
    this.columnasNumero = colsNumero;

    // Construir filas de salida con números alineados a la izquierda.
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

    // Métricas.
    this.totalDnis = grupos.size;
    this.numerosAntes = totalNumerosAntes;
    this.numerosUnicos = totalUnicos;
    this.duplicadosEliminados = Math.max(0, totalNumerosAntes - totalUnicos);
    this.maxNumerosPorDni = maxNumeros;

    // Vista previa (primeras 8 filas con su DNI y números).
    this.preview = salida.slice(0, 8).map((f) => ({
      dni: String(f[dniHeader] ?? ''),
      numeros: colsNumero.map((c) => String(f[c] ?? '')).filter((v) => v !== ''),
    }));
  }

  /** Busca una cabecera ignorando mayúsculas, espacios y acentos. */
  private buscarHeader(headers: string[], objetivo: string): string | undefined {
    const norm = (s: string) =>
      s
        .toString()
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '');
    const objetivoNorm = norm(objetivo);
    return headers.find((h) => norm(h) === objetivoNorm);
  }

  /**
   * Extrae números de teléfono de un valor de celda. Una celda puede contener
   * varios números separados por / , ; - espacios o saltos de línea.
   * Devuelve solo dígitos, descartando vacíos.
   */
  private extraerNumeros(valor: any): string[] {
    if (valor === null || valor === undefined) return [];
    const texto = String(valor).trim();
    if (!texto) return [];

    return texto
      .split(/[\/,;\n\r|]+/)
      .map((p) => p.replace(/\D/g, '')) // solo dígitos
      .filter((p) => p.length > 0);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Descarga
  // ──────────────────────────────────────────────────────────────────────────
  async descargar(): Promise<void> {
    if (!this.filasSalida.length) return;

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Base Limpia');

    // Cabecera.
    const headerRow = worksheet.addRow(this.headersSalida);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A5FAD' },
      };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFCCDAEE' } },
      };
    });

    // Datos.
    for (const fila of this.filasSalida) {
      const valores = this.headersSalida.map((h) => fila[h] ?? '');
      const row = worksheet.addRow(valores);
      row.eachCell((cell) => {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      });
    }

    // Ancho automático de columnas.
    worksheet.columns.forEach((col) => {
      if (!col || !col.values) return;
      const lengths = col.values
        .filter((v) => v != null)
        .map((v) => v.toString().length + 2);
      col.width = lengths.length ? Math.min(40, Math.max(12, ...lengths)) : 14;
    });

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const base = this.nombreArchivo.replace(/\.[^/.]+$/, '') || 'base';
    FileSaver.saveAs(blob, `${base}_LIMPIA.xlsx`);
  }
}
