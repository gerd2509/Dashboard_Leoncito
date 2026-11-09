import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpEventType } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { ASESORES_CALL_EN_CARTERA_PISO } from '../../shared/asesores';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

interface FilaEvolucion {
  anio: number;
  mes: number;
  mesLabel: string;
  sede: string;
  asignados: number;
  vendidos: number;
  monto: number;
  ticketPromedio: number;
  conversion: number;
  congelado: boolean;
}

interface TotalMes { asignados: number; vendidos: number; monto: number; ticketPromedio: number; conversion: number; }
interface GrupoMes { mesLabel: string; filas: FilaEvolucion[]; total: TotalMes; }

interface SerieSede { key: string; nombre: string; color: string; }
export type TipoChart = 'line' | 'bar' | 'area' | 'spline';

/** Resumen de un mes (sin DNI, sin detalle): sede (o grupo) → { asignados, vendidos, monto }. */
type ResumenMes = Map<string, { nombre: string; asignados: number; vendidos: number; monto: number }>;
/** Resumen de un mes CRUZADO sede × tipo de cliente. Clave = `${sede}||${grupo}`. */
type ResumenTipoSede = Map<string, { sede: string; grupo: string; asignados: number; vendidos: number; monto: number }>;

/** Fila granular (mes, sede, grupo de tipo de cliente) — la base de la vista "por tipo
 *  de cliente", que luego se filtra a una sede o se agrega entre todas ("Todas"). */
interface FilaTipoGranular {
  anio: number; mes: number; mesLabel: string;
  sede: string; grupo: string;
  asignados: number; vendidos: number; monto: number;
  congelado: boolean;
}

/** Modo de vista: por sede de piso, o por tipo de cliente (Afiliaciones/Reenganche/Dormidos). */
export type ModoVista = 'sede' | 'tipo';
// Los snapshots de la dimensión "tipo de cliente" se guardan en la MISMA tabla que los
// de sede (cartera_mensual_snapshot), con este prefijo en la columna `sede`, para no
// necesitar una tabla/endpoint nuevo — se filtran por prefijo al leer.
const PREFIJO_TIPO = 'TIPO::';

/**
 * Concreción de Cartera por Sede — evolución mensual de "cartera vendida / cartera
 * asignada" por sede, a partir de varias bases de Excel subidas MES A MES (persistidas
 * en BD, no solo en memoria como Comparativo Cartera vs Ventas). El cruce con las
 * ventas es el mismo criterio que ese módulo (y que Avance de Cartera): por DNI, sede
 * de CIERRE de la venta, solo estados de venta real (sin NC/incautación).
 *
 * Un mes que ya quedó en el pasado se CONGELA la primera vez que se calcula (snapshot
 * en `cartera_mensual_snapshot`): una Nota de Crédito o incautación posterior a ese
 * cierre no le vuelve a mover el número. El mes en curso siempre se calcula en vivo.
 */
@Component({
  selector: 'app-concrecion-cartera',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './concrecion-cartera.component.html',
  styleUrl: './concrecion-cartera.component.css',
})
export class ConcrecionCarteraComponent implements OnInit {
  private ventasSrv = inject(CargaVentasService);
  private sedeCfg = inject(SedeConfigService);
  private snack = inject(MatSnackBar);

  form: UntypedFormGroup;
  isLoading = false;
  yaCalculado = false;
  nombreArchivo = '';
  aviso = '';

  // Progreso real de la subida de la base (fase 1: bytes enviados; fase 2: el
  // servidor guarda las filas — bases grandes pueden tardar un momento ahí).
  subiendoBase = false;
  progresoBase = 0;
  procesandoBase = false;

  filas: FilaEvolucion[] = [];
  filasTipoGranular: FilaTipoGranular[] = [];   // una fila por (mes, sede, grupo) — ver filasVistaTipo
  sedesDisponibles: string[] = [];
  sedeOptions: string[] = [];
  tiposDisponibles: string[] = [];
  puntos: any[] = [];
  seriesActivas: SerieSede[] = [];
  mesesConBase: string[] = [];   // etiquetas de los meses que ya tienen base cargada

  // Sede de piso (actual) vs Tipo de cliente (Afiliaciones/Reenganche/Dormidos, como
  // en Avance de Cartera) — ambas dimensiones se calculan siempre juntas en
  // `actualizar()`, así que cambiar de modo es instantáneo (no vuelve a pedir datos).
  // El selector de sede aplica en LOS DOS modos: en "tipo de cliente", "Todas" suma
  // todas las sedes por grupo y una sede específica muestra el desglose de ESA sede.
  modoVista: ModoVista = 'sede';
  readonly modosVista: { value: ModoVista; label: string; icon: string }[] = [
    { value: 'sede', label: 'Por sede', icon: 'store' },
    { value: 'tipo', label: 'Por tipo de cliente', icon: 'category' },
  ];

  // Tipo de gráfico elegido (línea/barras/área/suavizada) + popup de ayuda.
  readonly tiposChart: { value: TipoChart; label: string; icon: string }[] = [
    { value: 'line',   label: 'Línea',    icon: 'show_chart' },
    { value: 'spline', label: 'Suavizada', icon: 'ssid_chart' },
    { value: 'bar',    label: 'Barras',   icon: 'bar_chart' },
    { value: 'area',   label: 'Área',     icon: 'area_chart' },
  ];
  chartTipo: TipoChart = 'line';
  mostrarInfoChart = false;
  popupChartVisible = false;   // gráfico ampliado, como en Evolución de Registros

  // Color fijo por sede (mismo orden siempre que haya los mismos datos).
  private readonly PALETA = ['#1A5FAD', '#E65100', '#2E7D32', '#6A1B9A', '#C62828', '#00838F', '#F9A825', '#5D4037'];

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);   // últimos 6 meses
    this.form = this.fb.group({ desde, hasta: hoy, sede: 'TODAS', mesCarga: hoy });
  }

  async ngOnInit(): Promise<void> {
    await this.cargarMesesConBase();
    await this.actualizar();
  }

  private async cargarMesesConBase(): Promise<void> {
    try {
      const meses = await lastValueFrom(this.ventasSrv.obtenerMesesCarteraMensual());
      this.mesesConBase = (meses || []).map(m => `${MESES_CORTOS[m.mes - 1]} ${m.anio}`);
    } catch { this.mesesConBase = []; }
  }

  // ── Utilidades (mismo criterio que Comparativo Cartera vs Ventas / Avance de Cartera) ──
  private norm(s: any): string {
    return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  }
  private soloDigitos(v: any): string {
    return (v ?? '').toString().replace(/\D/g, '').replace(/^0+/, '');
  }
  private sinTildes(v: any): string {
    return (v ?? '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
  private sedeKeyVenta(raw: any): string {
    return this.sedeCfg.normalizar((raw ?? '').toString()).replace(/^sederelenor/, '');
  }
  private sedeReconocida(sede: any): boolean {
    return !!this.sedeCfg.getConfig(this.sedeKeyVenta(sede))?.nombre;
  }
  private estadoExcluido(estado: any): boolean {
    const s = this.sinTildes(estado);
    return /NOTA DE/.test(s) || /INCAUTAC/.test(s);
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
  private sedeSlug(nombre: string): string {
    return (nombre || 'sede').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'sede';
  }
  /** Agrupa el TIPO DE CLIENTE crudo del Excel en los mismos 3 cuadros que usa Avance
   *  de Cartera: NUEVO/AFILIACION → Afiliaciones · Lover A/Reenganche/Cancelado →
   *  Lover A · Lover B/Dormido/No Vigente → Lover B. Cualquier otro valor se muestra
   *  tal cual (p.ej. si el Excel trae una categoría nueva que no está mapeada). */
  private grupoTipo(tipo: string): string {
    const t = (tipo || '').toString().toUpperCase();
    if (!t || t === 'SIN TIPO') return 'SIN TIPO';
    if (/NUEVO|AFILIAC/.test(t)) return 'AFILIACIONES (Nuevos)';
    if (/LOVER\s*A|REENGANCHE|CANCELAD/.test(t)) return 'LOVER A — Reenganche / Cancelado';
    if (/LOVER\s*B|DORMIDO|NO\s*VIGENTE/.test(t)) return 'LOVER B — Dormidos / No Vigentes';
    return t;
  }

  // ── Importar Excel de la base asignada de UN mes (se guarda en BD, reemplaza ese mes) ──
  importar(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    this.nombreArchivo = file.name;
    const mesCarga: Date = this.form.value.mesCarga || new Date();
    const anio = mesCarga.getFullYear();
    const mes = mesCarga.getMonth() + 1;
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as any[];
        if (!rows.length) { this.toast('El Excel de la base está vacío.', true); return; }

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

        const filas = rows.map(r => ({
          dni:         cDni  ? String(r[cDni]) : '',
          vendedor:    (cVend ? String(r[cVend]) : '').trim().toUpperCase() || 'SIN VENDEDOR',
          tipoBase:    (cBase ? String(r[cBase]) : '').trim().toUpperCase() || 'SIN BASE',
          tipoCliente: (cCli  ? String(r[cCli])  : '').trim().toUpperCase() || 'SIN TIPO',
          sede:        (cSede ? String(r[cSede]) : '').trim().toUpperCase(),
        })).filter(f => this.soloDigitos(f.dni));

        if (!filas.length) { this.toast('No se encontró ninguna fila con DNI válido.', true); return; }

        this.subirBase(anio, mes, filas);
      } catch (err) {
        console.error('❌ importar cartera mensual:', err);
        this.toast('No se pudo leer el Excel de la base.', true);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /** Sube la base ya parseada con progreso real (subida) + indicador de
   *  procesamiento (guardado en BD) hasta que el servidor confirma. */
  private subirBase(anio: number, mes: number, filas: { dni: string; vendedor: string; tipoBase: string; tipoCliente: string; sede: string }[]): void {
    this.subiendoBase = true;
    this.procesandoBase = false;
    this.progresoBase = 0;

    this.ventasSrv.importarCarteraMensual(anio, mes, filas).subscribe({
      next: async (ev) => {
        if (ev.type === HttpEventType.UploadProgress) {
          if (ev.total) {
            this.progresoBase = Math.round((ev.loaded / ev.total) * 100);
            if (this.progresoBase >= 100) this.procesandoBase = true;
          } else {
            this.procesandoBase = true;
          }
        } else if (ev.type === HttpEventType.ResponseHeader || ev.type === HttpEventType.DownloadProgress) {
          this.progresoBase = 100;
          this.procesandoBase = true;
        } else if (ev.type === HttpEventType.Response) {
          this.subiendoBase = false;
          this.procesandoBase = false;
          const body = ev.body;
          if (body?.success) {
            this.toast(`Base de ${MESES_CORTOS[mes - 1]} ${anio} guardada: ${body.filas} filas.`, false);
            await this.cargarMesesConBase();
            await this.actualizar();
          } else {
            this.toast('No se pudo guardar la base en el servidor.', true);
          }
        }
      },
      error: (e) => {
        console.error('❌ subir cartera mensual:', e);
        this.subiendoBase = false;
        this.procesandoBase = false;
        this.toast('No se pudo guardar la base (revisa la conexión).', true);
      },
    });
  }

  /** Cruza la base asignada de UN mes con las ventas reales de ese mes → resumen por
   *  SEDE y, en la misma pasada (sin pedir los datos dos veces), resumen por SEDE +
   *  TIPO DE CLIENTE (Afiliaciones/Lover A/Lover B, igual que Avance de Cartera — así
   *  el desglose por tipo también se puede ver dentro de cada sede, no solo global).
   *  Vacíos si no hay base cargada para ese mes. Solo sedes de piso: las asesoras de
   *  Call Center (ASESORES_CALL_EN_CARTERA_PISO) no son sede física — se excluyen. */
  private async cruzarMes(anio: number, mes: number): Promise<{ porSede: ResumenMes; porTipoSede: ResumenTipoSede }> {
    const filasCartera = await lastValueFrom(this.ventasSrv.obtenerCarteraMensual(anio, mes));
    if (!filasCartera.length) return { porSede: new Map(), porTipoSede: new Map() };

    const ventas = await lastValueFrom(this.ventasSrv.obtenerVentas(anio, { mes }));

    const ventasPorDniSede = new Map<string, Map<string, { ops: number; monto: number }>>();
    (ventas || []).forEach(v => {
      if (!this.sedeReconocida(v.sede)) return;
      if (this.estadoExcluido(v.estado_venta)) return;
      const monto = Number(v.monto_consolidado) || 0;
      if (monto <= 0) return;
      const dni = this.soloDigitos(v.doc_identidad);
      if (!dni) return;
      const sedeKey = this.sedeKeyVenta(v.sede);
      const porSede = ventasPorDniSede.get(dni) ?? new Map<string, { ops: number; monto: number }>();
      const cur = porSede.get(sedeKey) ?? { ops: 0, monto: 0 };
      cur.ops += 1; cur.monto += monto;
      porSede.set(sedeKey, cur);
      ventasPorDniSede.set(dni, porSede);
    });

    const vistos = new Set<string>();
    const baseSedeKeyPorDni = new Map<string, string>();
    const tipoPorDni = new Map<string, string>();
    const asignadosPorSedeKey = new Map<string, { nombre: string; asignados: number }>();
    const asignadosPorSedeTipo = new Map<string, { sede: string; grupo: string; asignados: number }>();

    for (const r of filasCartera) {
      const dni = this.soloDigitos(r.dni);
      if (!dni || vistos.has(dni)) continue;
      vistos.add(dni);
      const vendedor = (r.vendedor || '').toString().trim().toUpperCase();

      if (ASESORES_CALL_EN_CARTERA_PISO.has(vendedor)) continue;   // no es sede física, se excluye

      const grupo = this.grupoTipo(r.tipoCliente);
      tipoPorDni.set(dni, grupo);

      const key = this.sedeCfg.normalizar(r.sede || '') || 'sin-sede';
      const nombre = this.sedeCfg.getConfig(key)?.nombre ?? (r.sede || 'SIN SEDE');
      baseSedeKeyPorDni.set(dni, key);
      const g = asignadosPorSedeKey.get(key) ?? { nombre, asignados: 0 };
      g.asignados++; asignadosPorSedeKey.set(key, g);

      const kST = `${nombre}||${grupo}`;
      const gST = asignadosPorSedeTipo.get(kST) ?? { sede: nombre, grupo, asignados: 0 };
      gST.asignados++; asignadosPorSedeTipo.set(kST, gST);
    }

    const vendidosPorSedeKey = new Map<string, { nombre: string; vendidos: number; monto: number }>();
    const vendidosPorSedeTipo = new Map<string, { sede: string; grupo: string; vendidos: number; monto: number }>();
    for (const [dni, key] of baseSedeKeyPorDni) {
      const porSede = ventasPorDniSede.get(dni);
      if (!porSede) continue;
      const grupo = tipoPorDni.get(dni) || 'SIN TIPO';
      for (const [sedeKeyVenta, agg] of porSede) {
        const nombreVenta = this.sedeCfg.getConfig(sedeKeyVenta)?.nombre;
        if (!nombreVenta) continue;   // ya filtrado arriba, por seguridad
        const g = vendidosPorSedeKey.get(sedeKeyVenta) ?? { nombre: nombreVenta, vendidos: 0, monto: 0 };
        g.vendidos += agg.ops; g.monto += agg.monto;
        vendidosPorSedeKey.set(sedeKeyVenta, g);

        const kST = `${nombreVenta}||${grupo}`;
        const gST = vendidosPorSedeTipo.get(kST) ?? { sede: nombreVenta, grupo, vendidos: 0, monto: 0 };
        gST.vendidos += agg.ops; gST.monto += agg.monto;
        vendidosPorSedeTipo.set(kST, gST);
      }
    }

    const claves = new Set<string>([...asignadosPorSedeKey.keys(), ...vendidosPorSedeKey.keys()]);
    const porSede: ResumenMes = new Map();
    for (const key of claves) {
      const a = asignadosPorSedeKey.get(key);
      const v = vendidosPorSedeKey.get(key);
      porSede.set(key, {
        nombre: a?.nombre ?? v?.nombre ?? key,
        asignados: a?.asignados ?? 0,
        vendidos: v?.vendidos ?? 0,
        monto: Math.round(v?.monto ?? 0),
      });
    }

    const clavesTipoSede = new Set<string>([...asignadosPorSedeTipo.keys(), ...vendidosPorSedeTipo.keys()]);
    const porTipoSede: ResumenTipoSede = new Map();
    for (const k of clavesTipoSede) {
      const a = asignadosPorSedeTipo.get(k);
      const v = vendidosPorSedeTipo.get(k);
      porTipoSede.set(k, {
        sede: a?.sede ?? v?.sede ?? k.split('||')[0],
        grupo: a?.grupo ?? v?.grupo ?? k.split('||')[1],
        asignados: a?.asignados ?? 0,
        vendidos: v?.vendidos ?? 0,
        monto: Math.round(v?.monto ?? 0),
      });
    }

    return { porSede, porTipoSede };
  }

  // ── Evolución del rango de meses elegido ────────────────────────────────────
  async actualizar(): Promise<void> {
    const desde: Date = this.form.value.desde;
    const hasta: Date = this.form.value.hasta;
    if (!desde || !hasta) return;
    this.isLoading = true;
    try {
      const hoy = new Date();
      const mesActualTotal = hoy.getFullYear() * 12 + hoy.getMonth();
      const tDesde = desde.getFullYear() * 12 + desde.getMonth();
      const tHasta = hasta.getFullYear() * 12 + hasta.getMonth();

      const meses: { anio: number; mes: number; label: string }[] = [];
      for (let t = tDesde; t <= tHasta && meses.length < 36; t++) {
        const anio = Math.floor(t / 12), mes = (t % 12) + 1;
        meses.push({ anio, mes, label: `${MESES_CORTOS[mes - 1]} ${anio}` });
      }

      const filas: FilaEvolucion[] = [];
      const filasTipoGranular: FilaTipoGranular[] = [];
      const sedesSet = new Set<string>();
      const tiposSet = new Set<string>();

      for (const { anio, mes, label } of meses) {
        const esPasado = (anio * 12 + (mes - 1)) < mesActualTotal;
        let resumenSede: ResumenMes | null = null;
        let resumenTipoSede: ResumenTipoSede | null = null;
        let congSede = false;
        let congTipo = false;

        if (esPasado) {
          const snap = await lastValueFrom(this.ventasSrv.obtenerSnapshotCarteraMensual(anio, mes));
          // Defensivo: snapshots congelados ANTES de quitar "Call Center" de este
          // módulo pudieron guardar esa fila — se descarta si aparece. Las filas de
          // la dimensión "tipo de cliente" viven en la misma tabla, con prefijo
          // "TIPO::<sede>::<grupo>" (sede + grupo juntos en la misma clave).
          const snapSede = snap.filter(s => s.sede !== 'Call Center' && !s.sede.startsWith(PREFIJO_TIPO));
          const snapTipo = snap.filter(s => s.sede.startsWith(PREFIJO_TIPO));
          if (snapSede.length) {
            resumenSede = new Map(snapSede.map(s => [s.sede, { nombre: s.sede, asignados: s.asignados, vendidos: s.vendidos, monto: s.monto }]));
            congSede = true;
          }
          if (snapTipo.length) {
            resumenTipoSede = new Map();
            for (const s of snapTipo) {
              const resto = s.sede.slice(PREFIJO_TIPO.length);
              const idx = resto.indexOf('::');
              const sedeNombre = idx >= 0 ? resto.slice(0, idx) : resto;
              const grupo = idx >= 0 ? resto.slice(idx + 2) : 'SIN TIPO';
              resumenTipoSede.set(`${sedeNombre}||${grupo}`, { sede: sedeNombre, grupo, asignados: s.asignados, vendidos: s.vendidos, monto: s.monto });
            }
            congTipo = true;
          }
        }

        // Si falta cualquiera de las dos dimensiones (mes en curso, o un mes pasado
        // que se congeló ANTES de que existiera el desglose por tipo), se calcula en
        // vivo — en una sola pasada por `cruzarMes` para no pedir los datos 2 veces.
        if (!resumenSede || !resumenTipoSede) {
          const cruzado = await this.cruzarMes(anio, mes);
          if (!resumenSede) {
            resumenSede = cruzado.porSede;
            if (esPasado && resumenSede.size) { this.congelarResumen(anio, mes, resumenSede); congSede = true; }
          }
          if (!resumenTipoSede) {
            resumenTipoSede = cruzado.porTipoSede;
            if (esPasado && resumenTipoSede.size) { this.congelarResumenTipoSede(anio, mes, resumenTipoSede); congTipo = true; }
          }
        }

        for (const r of resumenSede.values()) {
          sedesSet.add(r.nombre);
          filas.push({
            anio, mes, mesLabel: label, sede: r.nombre,
            asignados: r.asignados, vendidos: r.vendidos, monto: r.monto,
            ticketPromedio: r.vendidos ? r.monto / r.vendidos : 0,
            conversion: r.asignados ? r.vendidos / r.asignados : 0,
            congelado: congSede,
          });
        }
        for (const r of resumenTipoSede.values()) {
          tiposSet.add(r.grupo);
          filasTipoGranular.push({
            anio, mes, mesLabel: label, sede: r.sede, grupo: r.grupo,
            asignados: r.asignados, vendidos: r.vendidos, monto: r.monto,
            congelado: congTipo,
          });
        }
      }

      this.filas = filas;
      this.filasTipoGranular = filasTipoGranular;
      this.mesesOrden = meses;
      this.sedesDisponibles = Array.from(sedesSet).sort();
      this.sedeOptions = ['TODAS', ...this.sedesDisponibles];
      this.tiposDisponibles = Array.from(tiposSet).sort();
      this.construirChart();

      this.yaCalculado = true;
      if (!filas.length && !filasTipoGranular.length) this.toast('No hay ninguna base de cartera cargada en ese rango de meses.', false);
    } catch (e) {
      console.error('❌ actualizar concreción de cartera:', e);
      this.toast('No se pudo calcular la evolución (revisa la conexión).', true);
    } finally {
      this.isLoading = false;
    }
  }

  /** Congela (snapshot) el resumen por SEDE de un mes ya pasado. Nunca pisa un
   *  snapshot que ya exista — ver POST /cartera-mensual/snapshot. */
  private congelarResumen(anio: number, mes: number, resumen: ResumenMes): void {
    const filasSnap = Array.from(resumen.values()).map(r => ({ sede: r.nombre, asignados: r.asignados, vendidos: r.vendidos, monto: r.monto }));
    this.ventasSrv.guardarSnapshotCarteraMensual(anio, mes, filasSnap).subscribe({ error: () => {} });
  }

  /** Congela (snapshot) el resumen SEDE × TIPO DE CLIENTE de un mes ya pasado, en la
   *  misma tabla que el de sede, con la clave `TIPO::<sede>::<grupo>`. */
  private congelarResumenTipoSede(anio: number, mes: number, resumen: ResumenTipoSede): void {
    const filasSnap = Array.from(resumen.values()).map(r => ({ sede: `${PREFIJO_TIPO}${r.sede}::${r.grupo}`, asignados: r.asignados, vendidos: r.vendidos, monto: r.monto }));
    this.ventasSrv.guardarSnapshotCarteraMensual(anio, mes, filasSnap).subscribe({ error: () => {} });
  }

  /** Vista "por tipo de cliente": si hay una sede elegida, el desglose de ESA sede
   *  (una fila por grupo); si es "Todas", suma todas las sedes por grupo. */
  get filasVistaTipo(): FilaEvolucion[] {
    const sede = (this.form.value.sede || 'TODAS') as string;
    if (sede !== 'TODAS') {
      return this.filasTipoGranular
        .filter(f => f.sede === sede)
        .map(f => ({
          anio: f.anio, mes: f.mes, mesLabel: f.mesLabel, sede: f.grupo,
          asignados: f.asignados, vendidos: f.vendidos, monto: f.monto,
          ticketPromedio: f.vendidos ? f.monto / f.vendidos : 0,
          conversion: f.asignados ? f.vendidos / f.asignados : 0,
          congelado: f.congelado,
        }))
        .sort((a, b) => (a.anio * 12 + a.mes) - (b.anio * 12 + b.mes) || a.sede.localeCompare(b.sede));
    }
    const acc = new Map<string, FilaEvolucion>();
    for (const f of this.filasTipoGranular) {
      const k = `${f.mesLabel}||${f.grupo}`;
      const cur = acc.get(k) ?? {
        anio: f.anio, mes: f.mes, mesLabel: f.mesLabel, sede: f.grupo,
        asignados: 0, vendidos: 0, monto: 0, ticketPromedio: 0, conversion: 0, congelado: true,
      };
      cur.asignados += f.asignados;
      cur.vendidos += f.vendidos;
      cur.monto += f.monto;
      cur.congelado = cur.congelado && f.congelado;   // "Todas" solo se ve 🔒 si TODAS las sedes de ese mes ya congelaron
      acc.set(k, cur);
    }
    const out = [...acc.values()];
    for (const f of out) {
      f.ticketPromedio = f.vendidos ? f.monto / f.vendidos : 0;
      f.conversion = f.asignados ? f.vendidos / f.asignados : 0;
    }
    return out.sort((a, b) => (a.anio * 12 + a.mes) - (b.anio * 12 + b.mes) || a.sede.localeCompare(b.sede));
  }

  /** Filas de la tabla: en modo "sede" respeta el filtro de sede elegido; en modo
   *  "tipo de cliente" también — "Todas" suma todas las sedes, una sede específica
   *  muestra solo su propio desglose por tipo. */
  get filasVista(): FilaEvolucion[] {
    if (this.modoVista === 'tipo') return this.filasVistaTipo;
    const sede = (this.form.value.sede || 'TODAS') as string;
    const vista = sede === 'TODAS' ? this.filas : this.filas.filter(f => f.sede === sede);
    return [...vista].sort((a, b) => (a.anio * 12 + a.mes) - (b.anio * 12 + b.mes) || a.sede.localeCompare(b.sede));
  }

  /** Lo mismo que `filasVista`, pero agrupado por mes (un bloque por mes, con sus
   *  sedes adentro) — más ordenado que listar todo de golpe. */
  get gruposVista(): GrupoMes[] {
    const porMes = new Map<string, FilaEvolucion[]>();
    for (const f of this.filasVista) {
      if (!porMes.has(f.mesLabel)) porMes.set(f.mesLabel, []);
      porMes.get(f.mesLabel)!.push(f);
    }
    return this.mesesOrden
      .map(m => ({ mesLabel: m.label, filas: porMes.get(m.label) ?? [], total: this.totalDe(porMes.get(m.label) ?? []) }))
      .filter(g => g.filas.length);
  }

  /** Total de un mes (suma de todas sus sedes): conversión y ticket promedio
   *  se recalculan sobre los totales, no se promedian las filas. */
  private totalDe(filas: FilaEvolucion[]): TotalMes {
    const asignados = filas.reduce((s, f) => s + f.asignados, 0);
    const vendidos = filas.reduce((s, f) => s + f.vendidos, 0);
    const monto = filas.reduce((s, f) => s + f.monto, 0);
    return {
      asignados, vendidos, monto,
      ticketPromedio: vendidos ? monto / vendidos : 0,
      conversion: asignados ? vendidos / asignados : 0,
    };
  }

  /** Reconstruye solo el gráfico (sin volver a pedir datos) cuando cambia la sede elegida. */
  aplicarSede(): void {
    this.construirChart();
  }

  /** Cambia entre "por sede" y "por tipo de cliente" — ambas dimensiones ya están
   *  calculadas desde `actualizar()`, así que el cambio es instantáneo. */
  cambiarModoVista(m: ModoVista): void {
    if (this.modoVista === m) return;
    this.modoVista = m;
    this.construirChart();
  }

  cambiarTipoChart(t: TipoChart): void { this.chartTipo = t; }

  private mesesOrden: { anio: number; mes: number; label: string }[] = [];

  /** Chart en formato ancho (una fila por mes, una columna por sede o por grupo de
   *  tipo de cliente, según el modo y la sede elegida) a partir de `filasVista`. */
  private construirChart(): void {
    const base = this.filasVista;
    const etiquetas = this.modoVista === 'tipo'
      ? this.tiposDisponibles
      : (((this.form.value.sede || 'TODAS') as string) === 'TODAS'
          ? this.sedesDisponibles
          : this.sedesDisponibles.filter(s => s === this.form.value.sede));

    const porMesEtiqueta = new Map<string, Map<string, number>>();
    for (const f of base) {
      if (!porMesEtiqueta.has(f.mesLabel)) porMesEtiqueta.set(f.mesLabel, new Map());
      porMesEtiqueta.get(f.mesLabel)!.set(this.sedeSlug(f.sede), Math.round(f.conversion * 1000) / 10);
    }
    this.puntos = this.mesesOrden.map(m => {
      const row: any = { mesLabel: m.label };
      for (const et of etiquetas) row[this.sedeSlug(et)] = porMesEtiqueta.get(m.label)?.get(this.sedeSlug(et)) ?? null;
      return row;
    });
    this.seriesActivas = etiquetas.map((s, i) => ({ key: this.sedeSlug(s), nombre: s, color: this.PALETA[i % this.PALETA.length] }));
  }

  get maxConversion(): number {
    const valores = this.modoVista === 'tipo'
      ? this.filasTipoGranular.map(f => f.asignados ? f.vendidos / f.asignados : 0)
      : this.filas.map(f => f.conversion);
    return valores.reduce((m, v) => Math.max(m, v), 0) || 1;
  }
  barPct(conv: number): number { return Math.round((conv / this.maxConversion) * 100); }
  barClase(conv: number): string {
    const r = conv / this.maxConversion;
    return r >= 0.66 ? 'hi' : r >= 0.33 ? 'mid' : 'lo';
  }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: error ? 5000 : 3500,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }

  formatPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
  formatSoles(v: number): string { return `S/ ${Math.round(v).toLocaleString('es-PE')}`; }

  /** Exporta TODO el rango calculado (respeta el filtro de sede) a Excel, con
   *  formato: una banda por mes (para que se note el corte entre meses) y las
   *  columnas de conversión/ticket/monto con su propio formato numérico. */
  async exportarExcel(): Promise<void> {
    const grupos = this.gruposVista;
    if (!grupos.length) { this.toast('No hay datos para exportar.', true); return; }

    const wb = new Workbook();
    const ws = wb.addWorksheet('Concreción de Cartera');
    const headers = [this.modoVista === 'tipo' ? 'Tipo de Cliente' : 'Sede', 'Cartera asignada', 'Ventas de cartera', 'Concreción %', 'Ticket promedio S/', 'Monto S/'];
    const COLS = headers.length;

    const hr = ws.addRow(headers);
    hr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF293964' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const pintarFilaDatos = (row: any, bold: boolean) => {
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(4).numFmt = '0.0"%"';
      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(5).numFmt = '"S/" #,##0';
      row.getCell(6).alignment = { horizontal: 'right' };
      row.getCell(6).numFmt = '"S/" #,##0';
      if (bold) row.eachCell((cell: any) => { cell.font = { ...(cell.font || {}), bold: true }; });
      else row.getCell(6).font = { bold: true };
    };

    for (const g of grupos) {
      const mesRow = ws.addRow([g.mesLabel]);
      ws.mergeCells(mesRow.number, 1, mesRow.number, COLS);
      const mesCell = mesRow.getCell(1);
      mesCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      mesCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      mesCell.alignment = { horizontal: 'left', vertical: 'middle' };

      for (const f of g.filas) {
        const row = ws.addRow([
          f.sede, f.asignados, f.vendidos,
          Math.round(f.conversion * 1000) / 10,
          Math.round(f.ticketPromedio), Math.round(f.monto),
        ]);
        pintarFilaDatos(row, false);
      }

      const t = g.total;
      const totalRow = ws.addRow([
        'TOTAL', t.asignados, t.vendidos,
        Math.round(t.conversion * 1000) / 10,
        Math.round(t.ticketPromedio), Math.round(t.monto),
      ]);
      totalRow.eachCell((cell: any) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF0FB' } }; });
      pintarFilaDatos(totalRow, true);
    }

    ws.columns.forEach((col, i) => { col.width = i === 0 ? 22 : 18; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const sufModo = this.modoVista === 'tipo' ? '_PorTipoCliente' : '';
    const sedeSel = (this.form.value.sede && this.form.value.sede !== 'TODAS') ? `_${this.form.value.sede}` : '';
    FileSaver.saveAs(blob, `ConcrecionCartera${sufModo}${sedeSel}.xlsx`.replace(/\s+/g, '_'));
  }
}
