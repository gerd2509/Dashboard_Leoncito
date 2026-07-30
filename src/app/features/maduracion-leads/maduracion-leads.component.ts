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
  m0: number; m1: number; m2: number; m3: number; m4: number;
  totalVentas: number;
  leads: number;
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
    }).subscribe({
      next: ({ ventas, kommo, leads }) => {
        this.ventas = ([] as any[]).concat(...ventas);
        this.kommo = kommo || [];
        this.leadsPorMes = leads || [];
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
    let sumaMeses = 0, conLead = 0;
    for (const v of this.ventas) {
      if (!filtroVenta(v)) continue;
      const anio = +v.anio_cv, mes = +v.mes_cv;
      if (!anio || !mes) continue;
      const ymVenta = anio * 12 + (mes - 1);
      if (ymVenta < ymDesde || ymVenta > ymHasta) continue;

      const fila = this.filaDe(mapa, ymVenta, anio, mes);
      fila.totalVentas++;

      const dni = this.dig(v.doc_identidad) || this.dig(v.dni_txt);
      const ymLead = dni ? idxLead.get(dni) : undefined;
      let dif = 0;
      if (ymLead !== undefined) { dif = Math.max(0, ymVenta - ymLead); conLead++; sumaMeses += dif; }
      // Sin lead cruzado → se cuenta como maduración 0 (mismo mes) para no perder la venta.
      if (dif <= 0) fila.m0++;
      else if (dif === 1) fila.m1++;
      else if (dif === 2) fila.m2++;
      else if (dif === 3) fila.m3++;
      else fila.m4++;
    }

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

    // KPIs
    this.kTotalVentas = this.filas.reduce((s, f) => s + f.totalVentas, 0);
    this.kTotalLeads = this.filas.reduce((s, f) => s + f.leads, 0);
    const totalM0 = this.filas.reduce((s, f) => s + f.m0, 0);
    this.kMismoMes = this.kTotalVentas ? (totalM0 / this.kTotalVentas) * 100 : 0;
    this.kMadPromedio = conLead ? sumaMeses / conLead : 0;

    this.armarChart();
  }

  private filaDe(mapa: Map<number, FilaMes>, ym: number, anio: number, mes: number): FilaMes {
    let f = mapa.get(ym);
    if (!f) {
      f = { ym, label: `${this.MESES[mes - 1]} ${anio}`, m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, totalVentas: 0, leads: 0 };
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

  /** Etiqueta de Total Ventas con el % de crecimiento debajo (+/−). */
  lblVentas = (info: any): string => {
    const c = info?.point?.data?.crec;
    const cre = (c === null || c === undefined) ? '' : `\n${c > 0 ? '▲ +' : (c < 0 ? '▼ ' : '')}${c}%`;
    return `${info.value}${cre}`;
  };

  // ── Totales (fila TOTAL de la tabla) ──
  get tot() {
    return this.filas.reduce((a, f) => ({
      m0: a.m0 + f.m0, m1: a.m1 + f.m1, m2: a.m2 + f.m2, m3: a.m3 + f.m3, m4: a.m4 + f.m4,
      totalVentas: a.totalVentas + f.totalVentas, leads: a.leads + f.leads,
    }), { m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, totalVentas: 0, leads: 0 });
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
