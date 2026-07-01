import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatIconModule } from '@angular/material/icon';
import { lastValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { RutaMapsService } from '../../services/ruta-maps.service';
import { Coordenada, TravelMode } from './models/ruta.model';

/** Nombres tolerantes (may/min, acentos, espacios) de las columnas de coordenadas. */
const HEADER_LAT = ['latitud', 'lat'];
const HEADER_LNG = ['longitud', 'lng', 'lon', 'long'];
/** Columnas candidatas para construir el nombre legible del punto. */
const HEADER_NOMBRE = ['direccion', 'nombrevia', 'nombre', 'distrito', 'microzona'];

/**
 * Caja delimitadora aproximada de Perú (con un margen de holgura). Sirve para
 * detectar coordenadas claramente erróneas (p. ej. lng -30 cae en el Atlántico)
 * que harían imposible trazar la ruta en Google Maps.
 */
const RANGO_PERU = { latMin: -18.5, latMax: 0.5, lngMin: -81.5, lngMax: -68.0 };

/**
 * Tope de puntos por enlace de Google Maps. La app móvil acepta de forma fiable
 * ~10 puntos (origen + destino + 8 intermedios). Si hay más, el enlace puede
 * fallar o truncarse, sobre todo en celular.
 */
const MAX_PUNTOS_LINK = 10;

/**
 * Componente de optimización y exportación de rutas GPS.
 *
 * Uso embebido (desde otra grilla/listado):
 *   <app-gps-ruta [coordenadas]="puntosSeleccionados"></app-gps-ruta>
 *
 * Uso standalone (módulo del menú): la grilla interna permite agregar, editar e
 * importar puntos manualmente.
 */
@Component({
  selector: 'app-gps-ruta',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, MatIconModule],
  templateUrl: './gps-ruta.component.html',
  styleUrls: ['./gps-ruta.component.css'],
})
export class GpsRutaComponent implements OnChanges {
  private readonly rutaMaps = inject(RutaMapsService);

  /** Puntos provenientes de una grilla/listado externo (opcional). */
  @Input() coordenadas: Coordenada[] = [];

  /** Lista de trabajo: editable internamente y mutada al optimizar. */
  puntos: Coordenada[] = [];

  travelmode: TravelMode = 'driving';
  readonly modos: { id: TravelMode; texto: string }[] = [
    { id: 'driving', texto: 'En auto' },
    { id: 'walking', texto: 'A pie' },
    { id: 'bicycling', texto: 'En bici' },
    { id: 'transit', texto: 'Transporte público' },
  ];

  // ── Estado de UI ──
  loading = false;
  error = '';
  info = '';
  optimizada = false;
  distanciaKm: number | null = null;
  duracionMin: number | null = null;
  nombreArchivo = '';

  /** Cabeceras originales del Excel importado (para re-exportar en el mismo orden). */
  private importedHeaders: string[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['coordenadas']) {
      // Copia defensiva para no mutar el array del componente padre.
      this.puntos = (this.coordenadas ?? []).map((c) => ({ ...c }));
      this.resetResultado();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Optimización (vía backend)
  // ───────────────────────────────────────────────────────────────────────────
  async optimizarRuta(): Promise<void> {
    this.error = '';
    this.info = '';

    const { validos, excluidos } = this.separarValidos();
    if (validos.length < 2) {
      this.error = 'Se necesitan al menos 2 puntos con coordenadas válidas en Perú para optimizar.';
      return;
    }

    this.loading = true;
    try {
      const resp = await lastValueFrom(
        this.rutaMaps.optimizarRuta(validos, this.travelmode),
      );

      if (!resp?.success) {
        throw new Error(resp?.message || 'El backend no pudo optimizar la ruta.');
      }

      // Preferimos la lista ya reordenada por el backend; si no viene,
      // aplicamos el waypointOrder sobre la lista original.
      this.puntos = resp.puntosOptimizados?.length
        ? resp.puntosOptimizados
        : this.rutaMaps.aplicarOrdenOptimo(validos, resp.waypointOrder);

      this.distanciaKm =
        resp.distanciaMetros != null ? +(resp.distanciaMetros / 1000).toFixed(1) : null;
      this.duracionMin =
        resp.duracionSegundos != null ? Math.round(resp.duracionSegundos / 60) : null;
      this.optimizada = true;
      if (excluidos > 0) {
        this.info = `Ruta optimizada con ${validos.length} puntos. Se excluyeron ${excluidos} con coordenadas fuera de rango (en rojo).`;
      }
    } catch (err: any) {
      this.optimizada = false;
      this.error =
        err?.error?.message ||
        err?.message ||
        'Error al comunicarse con el servicio de optimización.';
    } finally {
      this.loading = false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Exportación a Google Maps (deep link universal: web + app móvil)
  // ───────────────────────────────────────────────────────────────────────────
  abrirEnGoogleMaps(): void {
    this.error = '';
    this.info = '';

    const { validos, excluidos } = this.separarValidos();
    if (validos.length < 2) {
      this.error = 'Se necesitan al menos 2 puntos con coordenadas válidas en Perú para abrir la navegación.';
      return;
    }

    // Google limita los puntos por enlace (sobre todo en la app móvil).
    let puntosLink = validos;
    const avisos: string[] = [];
    if (excluidos > 0) {
      avisos.push(`Se excluyeron ${excluidos} puntos con coordenadas fuera de rango.`);
    }
    if (validos.length > MAX_PUNTOS_LINK) {
      puntosLink = [...validos.slice(0, MAX_PUNTOS_LINK - 1), validos[validos.length - 1]];
      avisos.push(
        `Google Maps solo admite ~${MAX_PUNTOS_LINK} puntos por enlace; se abrieron los primeros ${MAX_PUNTOS_LINK - 1} + destino. Para rutas largas, divídela en tramos.`,
      );
    }

    try {
      const url = this.rutaMaps.construirUrlGoogleMaps(puntosLink, this.travelmode);
      window.open(url, '_blank');
      if (avisos.length) this.info = avisos.join(' ');
    } catch (err: any) {
      this.error = err?.message || 'No se pudo construir la URL de navegación.';
    }
  }

  /** Divide los puntos en utilizables (válidos en Perú) y cuenta los excluidos. */
  private separarValidos(): { validos: Coordenada[]; excluidos: number } {
    const validos = this.puntos.filter((p) => this.esCoordenadaUtil(p));
    return { validos, excluidos: this.puntos.length - validos.length };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Edición / utilidades de la grilla
  // ───────────────────────────────────────────────────────────────────────────
  /** Inicializa nuevas filas con valores numéricos (evita NaN). */
  onInitNewRow(e: any): void {
    e.data.lat = 0;
    e.data.lng = 0;
  }

  limpiar(): void {
    this.puntos = [];
    this.importedHeaders = [];
    this.nombreArchivo = '';
    this.resetResultado();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Importar Excel (carga las coordenadas "tal cual")
  // ───────────────────────────────────────────────────────────────────────────
  onFileChange(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.importarExcel(file);
    input.value = ''; // permite reimportar el mismo archivo
  }

  private importarExcel(file: File): void {
    this.resetResultado();
    this.nombreArchivo = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: '',
          raw: false,
        });

        if (!filas.length) throw new Error('El archivo no contiene filas de datos.');

        const headers = Object.keys(filas[0]);
        const latHeader = this.buscarHeader(headers, HEADER_LAT);
        const lngHeader = this.buscarHeader(headers, HEADER_LNG);
        if (!latHeader || !lngHeader) {
          throw new Error('No se encontraron las columnas "Latitud" y "Longitud".');
        }
        const nombreHeader = this.buscarHeader(headers, HEADER_NOMBRE);

        const puntos: Coordenada[] = [];
        let descartadas = 0;

        filas.forEach((fila, i) => {
          const lat = this.parseCoord(fila[latHeader]);
          const lng = this.parseCoord(fila[lngHeader]);
          if (lat == null || lng == null) {
            descartadas++;
            return;
          }
          puntos.push({
            lat,
            lng,
            nombre: nombreHeader ? String(fila[nombreHeader] ?? '').trim() : `Punto ${i + 1}`,
            meta: { ...fila }, // fila original completa para re-exportar
          });
        });

        if (!puntos.length) {
          throw new Error('Ninguna fila tenía coordenadas válidas.');
        }

        this.importedHeaders = headers;
        this.puntos = puntos;
        this.info = descartadas
          ? `Importadas ${puntos.length} filas. Se omitieron ${descartadas} sin coordenadas válidas.`
          : `Importadas ${puntos.length} filas correctamente.`;
      } catch (err: any) {
        this.error = err?.message ?? 'No se pudo leer el archivo.';
        this.puntos = [];
      }
    };
    reader.onerror = () => (this.error = 'Error al leer el archivo.');
    reader.readAsArrayBuffer(file);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Exportar Excel (misma estructura + orden optimizado)
  // ───────────────────────────────────────────────────────────────────────────
  async exportarExcel(): Promise<void> {
    if (!this.puntos.length) return;

    const wb = new Workbook();
    const ws = wb.addWorksheet('Ruta');

    // Si vino de un Excel importado conservamos sus columnas; si no, columnas básicas.
    const baseHeaders = this.importedHeaders.length
      ? this.importedHeaders
      : ['Nombre', 'Latitud', 'Longitud'];
    const headers = ['Orden', ...baseHeaders];

    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });

    this.puntos.forEach((p, i) => {
      const valores = headers.map((h) => {
        if (h === 'Orden') return i + 1;
        if (p.meta && h in p.meta) return p.meta[h];
        // Fallback para puntos cargados manualmente (sin meta).
        if (h === 'Nombre') return p.nombre ?? '';
        if (h === 'Latitud') return p.lat;
        if (h === 'Longitud') return p.lng;
        return '';
      });
      ws.addRow(valores);
    });

    ws.columns.forEach((col) => {
      if (!col?.values) return;
      const lengths = col.values.filter((v) => v != null).map((v) => v!.toString().length + 2);
      col.width = lengths.length ? Math.min(45, Math.max(10, ...lengths)) : 12;
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const base = (this.nombreArchivo.replace(/\.[^/.]+$/, '') || 'ruta') + '_OPTIMIZADA';
    FileSaver.saveAs(blob, `${base}.xlsx`);
  }

  private resetResultado(): void {
    this.optimizada = false;
    this.distanciaKm = null;
    this.duracionMin = null;
    this.error = '';
    this.info = '';
  }

  /** Busca la primera cabecera que coincida (ignora may/min, espacios y acentos). */
  private buscarHeader(headers: string[], objetivos: string[]): string | undefined {
    const norm = (s: string) =>
      s.toString().toLowerCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '');
    const objetivosNorm = objetivos.map(norm);
    return headers.find((h) => objetivosNorm.includes(norm(h)));
  }

  /**
   * Convierte un valor de celda a número geográfico. Tolera:
   *  - coma decimal ("-6,889962") y punto decimal ("-79.561718")
   *  - separadores de miles, espacios y símbolos no numéricos sueltos.
   * Devuelve null si no es un número parseable.
   */
  private parseCoord(valor: any): number | null {
    if (valor == null) return null;
    let s = String(valor).trim().replace(/\s+/g, '');
    if (!s) return null;

    const tieneComa = s.includes(',');
    const tienePunto = s.includes('.');
    if (tieneComa && tienePunto) {
      // El último separador es el decimal; el otro se asume de miles.
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.'); // formato europeo 1.234,56
      } else {
        s = s.replace(/,/g, ''); // formato US 1,234.56
      }
    } else if (tieneComa) {
      s = s.replace(',', '.'); // coma como decimal
    }

    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  /** Coordenada numéricamente válida en el rango global (-90..90 / -180..180). */
  private esCoordenadaValida(c: Coordenada): boolean {
    return (
      typeof c.lat === 'number' &&
      typeof c.lng === 'number' &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      c.lat >= -90 &&
      c.lat <= 90 &&
      c.lng >= -180 &&
      c.lng <= 180
    );
  }

  /**
   * Coordenada utilizable para trazar ruta: válida y dentro de Perú.
   * Las que caen fuera (p. ej. lng -30) romperían la ruta en Google Maps.
   */
  esCoordenadaUtil(c: Coordenada): boolean {
    return (
      this.esCoordenadaValida(c) &&
      c.lat >= RANGO_PERU.latMin &&
      c.lat <= RANGO_PERU.latMax &&
      c.lng >= RANGO_PERU.lngMin &&
      c.lng <= RANGO_PERU.lngMax
    );
  }

  /** Cantidad de puntos con coordenadas fuera de rango (resaltados en rojo). */
  get cantidadInvalidos(): number {
    return this.puntos.filter((p) => !this.esCoordenadaUtil(p)).length;
  }

  /** Resalta en rojo las celdas lat/lng de filas con coordenadas inválidas. */
  onCellPrepared(e: any): void {
    if (e.rowType !== 'data') return;
    if (e.column.dataField !== 'lat' && e.column.dataField !== 'lng') return;
    if (!this.esCoordenadaUtil(e.data)) {
      // setProperty con 'important' para ganarle al tema de DevExtreme.
      e.cellElement.style.setProperty('background-color', '#fdecea', 'important');
      e.cellElement.style.setProperty('color', '#b3261e', 'important');
      e.cellElement.style.setProperty('font-weight', '600', 'important');
    }
  }

  /** Elimina de la grilla todos los puntos con coordenadas fuera de rango. */
  eliminarInvalidos(): void {
    const antes = this.puntos.length;
    this.puntos = this.puntos.filter((p) => this.esCoordenadaUtil(p));
    const quitados = antes - this.puntos.length;
    this.info = quitados
      ? `Se eliminaron ${quitados} punto(s) con coordenadas fuera de Perú.`
      : '';
    this.error = '';
  }
}
