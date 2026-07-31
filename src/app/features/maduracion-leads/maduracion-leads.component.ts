import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SheetsService } from '../../services/service-google.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

type Canal = 'call' | 'realzza';
type Fuente = 'KOMMO' | 'MARKETPLACE';

interface FilaMes {
  ym: number;                 // anio*12 + (mes-1), para ordenar
  label: string;              // 'dic 2025'
  // Conteo por bucket de maduración
  m0: number; m1: number; m2: number; m3: number; m4: number;
  totalVentas: number;        // conteo total
  // Monto (S/) por bucket de maduración
  mm0: number; mm1: number; mm2: number; mm3: number; mm4: number;
  montoTotal: number;
  leads: number;
  tendLeads: number | null;   // variación % de leads vs el mes anterior (MoM)
}

/** Una venta considerada en la maduración (para el popup de detalle mes a mes). */
interface VentaDetalle {
  ym: number;             // mes de la venta (para filtrar por mes)
  fecha: string;          // dd/MM/yyyy de la venta
  codigo: string;         // código CV
  dni: string;
  vendedor: string;
  entidad: string;        // entidad financiera de la venta/lead
  monto: number;
  maduracion: number;     // meses lead→venta (0 = mismo mes)
  conLead: boolean;       // si se cruzó con un lead KOMMO (si no, maduración asumida 0)
  origen: string;         // KOMMO / BBDD KOMMO / MARKET PLACE …
}

/**
 * Maduración de Leads (KOMMO / Market Place) por canal (Call / Realzza; luego Sedes).
 * Cuenta las ventas de origen KOMMO por mes y las clasifica por el tiempo que tardó
 * el lead en madurar: (mes de la venta) − (mes de "FECHA DE LEAD ASIGNADO" de la
 * gestión KOMMO, cruzando por DNI). "Leads Ingresados" = leads subidos por mes.
 *  - Call:    ventas_call.contacto ∈ {KOMMO, BD KOMMO LEONCITO}; DNI ↔ 'DNI CLIENTE'.
 *  - Realzza: ventas_realzza.tipo_base ∈ {KOMMO, BBDD KOMMO}; DNI ↔ 'DNI CLIENTE REALZZA'.
 *  - Market Place: contacto/tipo_base = MARKET PLACE; gestión KOMMO con MARKET PLACE (L/R)=SI.
 */
@Component({
  selector: 'app-maduracion-leads',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './maduracion-leads.component.html',
  styleUrl: './maduracion-leads.component.css',
})
export class MaduracionLeadsComponent implements OnInit {
  private ventasSvc = inject(CargaVentasService);
  private sheets = inject(SheetsService);
  private fb = inject(UntypedFormBuilder);

  form!: UntypedFormGroup;
  canal: Canal = 'call';
  fuente: Fuente = 'KOMMO';
  cargando = false;
  error = '';

  // Data cruda
  private ventas: any[] = [];
  private kommo: any[] = [];
  private leadsPorMes: { anio: number; mes: number; total: number }[] = [];
  private leadsPorDia: { anio: number; mes: number; dia: number; total: number }[] = [];

  // Leads por día (gráfico) + detalle de ventas consideradas mes a mes.
  leadsDiaData: any[] = [];
  private ventasDetalle: VentaDetalle[] = [];

  // Resultado
  filas: FilaMes[] = [];
  // KPIs
  kTotalVentas = 0;
  kTotalLeads = 0;
  kMismoMes = 0;        // % de ventas que maduraron el mismo mes
  kMadPromedio = 0;     // meses promedio de maduración (ponderado)

  // Gráfico
  chartData: any[] = [];
  chartMetric: 'buckets' | 'ventas-leads' = 'buckets';

  private readonly MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  ngOnInit(): void {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 7, 1);   // ~8 meses
    this.form = this.fb.group({ desde: [desde], hasta: [hoy] });
    this.cargar();
  }

  setCanal(c: Canal): void { if (this.canal !== c) { this.canal = c; this.cargar(); } }
  setFuente(f: Fuente): void { if (this.fuente !== f) { this.fuente = f; this.recomputar(); } }

  cargar(): void {
    this.cargando = true; this.error = '';
    const desde = this.form.value.desde as Date;
    const hasta = this.form.value.hasta as Date;
    const anios: number[] = [];
    for (let y = desde.getFullYear(); y <= hasta.getFullYear(); y++) anios.push(y);

    // Ventas de cada año del rango (merge) + gestión KOMMO (todo) + leads por mes.
    const ventas$ = anios.map(a => this.ventasSvc.obtenerVentasCanal(this.canal, { anio: a }).pipe(catchError(() => of([]))));
    forkJoin({
      ventas: forkJoin(ventas$.length ? ventas$ : [of([])]),
      kommo: this.sheets.getSheetKOMMO().pipe(catchError(() => of([]))),
      leads: this.ventasSvc.obtenerLeadsPorMes(this.canal).pipe(catchError(() => of([]))),
      leadsDia: this.ventasSvc.obtenerLeadsPorDia(this.canal).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ ventas, kommo, leads, leadsDia }) => {
        this.ventas = ([] as any[]).concat(...ventas);
        this.kommo = kommo || [];
        this.leadsPorMes = leads || [];
        this.leadsPorDia = leadsDia || [];
        this.recomputar();
        this.cargando = false;
      },
      error: () => { this.error = 'No se pudo cargar la información.'; this.cargando = false; },
    });
  }

  // ── Cálculo de la maduración ────────────────────────────────────────────────
  private recomputar(): void {
    const desde = this.form.value.desde as Date;
    const hasta = this.form.value.hasta as Date;
    const ymDesde = desde.getFullYear() * 12 + desde.getMonth();
    const ymHasta = hasta.getFullYear() * 12 + hasta.getMonth();

    // Índice DNI → mes de ingreso del lead (FECHA DE LEAD ASIGNADO más antigua).
    const dniCol = this.canal === 'call' ? 'DNI CLIENTE' : 'DNI CLIENTE REALZZA';
    const mpCol = this.canal === 'call' ? 'MARKET PLACE L' : 'MARKET PLACE R';
    const soloMP = this.fuente === 'MARKETPLACE';
    const idxLead = new Map<string, number>();   // dni → ym de ingreso (mínimo)
    for (const r of this.kommo) {
      const dni = this.dig(r[dniCol]);
      if (!dni) continue;
      if (soloMP && !this.esSi(r[mpCol])) continue;
      const ym = this.ymDe(r['FECHA DE LEAD ASIGNADO']);
      if (ym === null) continue;
      const prev = idxLead.get(dni);
      if (prev === undefined || ym < prev) idxLead.set(dni, ym);
    }

    // Ventas del origen elegido (KOMMO o Market Place) dentro del rango.
    const filtroVenta = (v: any): boolean => {
      const clave = this.canal === 'call'
        ? (v.contacto || '').toString().toUpperCase().trim()
        : (v.tipo_base || '').toString().toUpperCase().trim();
      if (soloMP) return clave === 'MARKET PLACE';
      return clave === 'KOMMO' || clave === 'BD KOMMO LEONCITO' || clave === 'BBDD KOMMO';
    };

    const mapa = new Map<number, FilaMes>();
    const detalle: VentaDetalle[] = [];
    let sumaMeses = 0, conLead = 0;
    for (const v of this.ventas) {
      if (!filtroVenta(v)) continue;
      const anio = +v.anio_cv, mes = +v.mes_cv;
      if (!anio || !mes) continue;
      const ymVenta = anio * 12 + (mes - 1);
      if (ymVenta < ymDesde || ymVenta > ymHasta) continue;

      const fila = this.filaDe(mapa, ymVenta, anio, mes);
      const monto = Number(v.monto_consolidado || 0);
      fila.totalVentas++;
      fila.montoTotal += monto;

      const dni = this.dig(v.doc_identidad) || this.dig(v.dni_txt);
      const ymLead = dni ? idxLead.get(dni) : undefined;
      let dif = 0;
      const tieneLead = ymLead !== undefined;
      if (tieneLead) { dif = Math.max(0, ymVenta - ymLead!); conLead++; sumaMeses += dif; }
      // Sin lead cruzado → se cuenta como maduración 0 (mismo mes) para no perder la venta.
      if (dif <= 0)      { fila.m0++; fila.mm0 += monto; }
      else if (dif === 1) { fila.m1++; fila.mm1 += monto; }
      else if (dif === 2) { fila.m2++; fila.mm2 += monto; }
      else if (dif === 3) { fila.m3++; fila.mm3 += monto; }
      else                { fila.m4++; fila.mm4 += monto; }

      // Fila de detalle (para el popup "ver detalle de ventas mes a mes").
      const origen = this.canal === 'call'
        ? (v.contacto || '').toString().toUpperCase().trim()
        : (v.tipo_base || '').toString().toUpperCase().trim();
      const dd = String(+v.dia_cv || 1).padStart(2, '0');
      detalle.push({
        ym: ymVenta,
        fecha: `${dd}/${String(mes).padStart(2, '0')}/${anio}`,
        codigo: (v.codigo_cv ?? '').toString(),
        dni: dni || '—',
        vendedor: (v.vendedor || v.asesor_venta || '—').toString(),
        entidad: (v.entidad || '—').toString(),
        monto, maduracion: dif, conLead: tieneLead, origen: origen || '—',
      });
    }
    this.ventasDetalle = detalle.sort((a, b) => a.ym - b.ym || b.monto - a.monto);

    // Leads ingresados por mes (dentro del rango). Solo aplica a KOMMO:
    // la tabla de leads es de Kommo, no hay leads propios de Market Place.
    if (!soloMP) {
      for (const l of this.leadsPorMes) {
        if (!l.anio || !l.mes) continue;
        const ym = l.anio * 12 + (l.mes - 1);
        if (ym < ymDesde || ym > ymHasta) continue;
        const fila = this.filaDe(mapa, ym, l.anio, l.mes);
        fila.leads += l.total;
      }
    }

    // Ordena y quita los meses vacíos (sin ventas ni leads) — p.ej. Market Place
    // que recién arranca en junio: no muestra los meses anteriores en cero.
    this.filas = Array.from(mapa.values())
      .sort((a, b) => a.ym - b.ym)
      .filter(f => f.totalVentas > 0 || f.leads > 0);

    // Variación de leads mes a mes (MoM) para la columna de tendencia.
    let prevLeads: number | null = null;
    for (const f of this.filas) {
      f.tendLeads = (prevLeads !== null && prevLeads > 0) ? ((f.leads - prevLeads) / prevLeads) * 100 : null;
      prevLeads = f.leads;
    }

    // KPIs
    this.kTotalVentas = this.filas.reduce((s, f) => s + f.totalVentas, 0);
    this.kTotalLeads = this.filas.reduce((s, f) => s + f.leads, 0);
    const totalM0 = this.filas.reduce((s, f) => s + f.m0, 0);
    this.kMismoMes = this.kTotalVentas ? (totalM0 / this.kTotalVentas) * 100 : 0;
    this.kMadPromedio = conLead ? sumaMeses / conLead : 0;

    this.armarChart();
    this.armarLeadsDia();
  }

  /** Serie de leads ingresados por DÍA dentro del rango (solo aplica a KOMMO). */
  private armarLeadsDia(): void {
    const desde = this.form.value.desde as Date;
    const hasta = this.form.value.hasta as Date;
    const d0 = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()).getTime();
    const d1 = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate(), 23, 59, 59).getTime();
    this.leadsDiaData = this.leadsPorDia
      .map(l => ({ t: new Date(l.anio, l.mes - 1, l.dia).getTime(), l }))
      .filter(x => x.t >= d0 && x.t <= d1)
      .sort((a, b) => a.t - b.t)
      .map(({ l }) => ({
        dia: `${String(l.dia).padStart(2, '0')}/${String(l.mes).padStart(2, '0')}`,
        fecha: `${String(l.dia).padStart(2, '0')}/${String(l.mes).padStart(2, '0')}/${l.anio}`,
        leads: l.total,
      }));
  }

  get hayLeadsDia(): boolean { return this.hayLeads && this.leadsDiaData.length > 0; }
  get maxLeadsDia(): number { return this.leadsDiaData.reduce((m, x) => Math.max(m, x.leads), 0); }
  get promLeadsDia(): number {
    return this.leadsDiaData.length
      ? Math.round(this.leadsDiaData.reduce((s, x) => s + x.leads, 0) / this.leadsDiaData.length)
      : 0;
  }

  private filaDe(mapa: Map<number, FilaMes>, ym: number, anio: number, mes: number): FilaMes {
    let f = mapa.get(ym);
    if (!f) {
      f = {
        ym, label: `${this.MESES[mes - 1]} ${anio}`,
        m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, totalVentas: 0,
        mm0: 0, mm1: 0, mm2: 0, mm3: 0, mm4: 0, montoTotal: 0, leads: 0, tendLeads: null,
      };
      mapa.set(ym, f);
    }
    return f;
  }

  private armarChart(): void {
    let prev: number | null = null;
    this.chartData = this.filas.map(f => {
      // Crecimiento mes a mes de las ventas (%), como en Comparativo Ventas.
      const crec = (prev !== null && prev > 0) ? Math.round(((f.totalVentas - prev) / prev) * 100) : null;
      prev = f.totalVentas;
      return {
        mes: f.label,
        'Mismo Mes': f.m0, '1 Mes': f.m1, '2 Meses': f.m2, '3 Meses': f.m3, '4+ Meses': f.m4,
        'Total Ventas': f.totalVentas, 'Leads Ingresados': f.leads, crec,
      };
    });
  }

  setChartMetric(m: 'buckets' | 'ventas-leads'): void { this.chartMetric = m; }

  /** Etiqueta que oculta los ceros (para las barras apiladas). */
  lblNoCero = (info: any): string => (info?.value ? `${info.value}` : '');

  /** Etiqueta de % de crecimiento (línea de Market Place): "+23%" / "−16%". */
  lblCrec = (info: any): string => {
    const c = info?.value;
    if (c === null || c === undefined) return '';
    return `${c > 0 ? '+' : ''}${c}%`;
  };

  // ── Totales (fila TOTAL de la tabla) ──
  get tot() {
    return this.filas.reduce((a, f) => ({
      m0: a.m0 + f.m0, m1: a.m1 + f.m1, m2: a.m2 + f.m2, m3: a.m3 + f.m3, m4: a.m4 + f.m4,
      totalVentas: a.totalVentas + f.totalVentas,
      mm0: a.mm0 + f.mm0, mm1: a.mm1 + f.mm1, mm2: a.mm2 + f.mm2, mm3: a.mm3 + f.mm3, mm4: a.mm4 + f.mm4,
      montoTotal: a.montoTotal + f.montoTotal, leads: a.leads + f.leads,
    }), { m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, totalVentas: 0, mm0: 0, mm1: 0, mm2: 0, mm3: 0, mm4: 0, montoTotal: 0, leads: 0 });
  }

  /** % de una parte respecto del total (para la distribución por mes). */
  pct(parte: number, total: number): number { return total > 0 ? (parte / total) * 100 : 0; }

  // KPIs de distribución (del total de ventas, por tiempo de maduración).
  get distM0(): number { return this.pct(this.tot.m0, this.tot.totalVentas); }
  get distM1(): number { return this.pct(this.tot.m1, this.tot.totalVentas); }
  get distM2(): number { return this.pct(this.tot.m2, this.tot.totalVentas); }
  get distM3plus(): number { return this.pct(this.tot.m3 + this.tot.m4, this.tot.totalVentas); }

  /** ¿Hay leads para calcular conversión? (Market Place no tiene → columnas en "—"). */
  get hayLeads(): boolean { return this.fuente === 'KOMMO'; }

  // ── Popup para ver el gráfico en grande ──
  chartPopupVisible = false;
  verChartGrande(): void { this.chartPopupVisible = true; }

  // ── Leads por día: vista gráfico / tabla + popup en grande ──
  leadsDiaVista: 'grafico' | 'tabla' = 'grafico';
  setLeadsDiaVista(v: 'grafico' | 'tabla'): void { this.leadsDiaVista = v; }
  leadsDiaPopupVisible = false;
  verLeadsDiaGrande(): void { this.leadsDiaPopupVisible = true; }
  get totalLeadsDia(): number { return this.leadsDiaData.reduce((s, x) => s + x.leads, 0); }

  /** Etiqueta compacta de la serie de leads/día (oculta ceros). */
  lblLeadsDia = (info: any): string => (info?.value ? `${info.value}` : '');

  // ── Popup de detalle de ventas consideradas (mes a mes) ──
  detalleVisible = false;
  detalleTitulo = '';
  detalleFilas: VentaDetalle[] = [];

  verDetalleMes(f: FilaMes): void {
    this.detalleFilas = this.ventasDetalle.filter(v => v.ym === f.ym);
    this.detalleTitulo = f.label;
    this.detalleVisible = true;
  }
  verDetalleTodo(): void {
    this.detalleFilas = this.ventasDetalle;
    this.detalleTitulo = 'Todos los meses';
    this.detalleVisible = true;
  }
  get detalleMonto(): number { return this.detalleFilas.reduce((s, v) => s + v.monto, 0); }

  /** ym (anio*12+mes-1) → 'jul 2026'. */
  mesDe(ym: number): string { return `${this.MESES[ym % 12]} ${Math.floor(ym / 12)}`; }

  /** Etiqueta legible de la maduración de una venta del detalle. */
  madLabel(v: VentaDetalle): string {
    if (!v.conLead) return 'sin lead';
    if (v.maduracion === 0) return 'mismo mes';
    return v.maduracion === 1 ? '1 mes' : `${v.maduracion} meses`;
  }
  madClase(v: VentaDetalle): string {
    if (!v.conLead) return 'md-nolead';
    if (v.maduracion === 0) return 'md-0';
    if (v.maduracion === 1) return 'md-1';
    if (v.maduracion === 2) return 'md-2';
    return 'md-3';
  }

  actualizar(): void { this.cargar(); }

  // ── Helpers ──
  private dig(v: any): string { return (v ?? '').toString().replace(/\D/g, ''); }
  private esSi(v: any): boolean { const s = (v ?? '').toString().trim().toUpperCase(); return s === 'SI' || s === 'SÍ'; }
  /** 'd/m/yyyy' | 'd.m.yyyy' (con o sin hora) → anio*12+(mes-1); null si no parsea. */
  private ymDe(v: any): number | null {
    const parte = (v ?? '').toString().trim().split(/[ T]/)[0];
    if (!parte) return null;
    const p = parte.split(/[\/.\-]/).map((x: string) => parseInt(x, 10));
    if (p.length < 3 || p.some(isNaN)) return null;
    let d = p[0], m = p[1], y = p[2];
    if (p[0] > 31) { y = p[0]; m = p[1]; d = p[2]; }   // yyyy-mm-dd
    if (m < 1 || m > 12 || y < 2000) return null;
    return y * 12 + (m - 1);
  }
}
