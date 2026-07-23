import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { ASESORES_CALL } from '../../shared/asesores';

interface Agrupado { clave: string; monto: number; n: number; }

@Component({
  selector: 'app-mi-panel',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './mi-panel.component.html',
  styleUrl: './mi-panel.component.css',
})
export class MiPanelComponent implements OnInit {
  private auth = inject(AuthService);
  private ventasSvc = inject(CargaVentasService);
  private fb = inject(UntypedFormBuilder);
  private sedeCfg = inject(SedeConfigService);

  nombre = '';
  vendedor = '';
  canal = '';
  sedeNombre = '';   // sede a la que pertenece (para la cabecera)
  sinVendedor = false;
  cargando = false;
  error = '';

  form!: UntypedFormGroup;      // rango opcional { desde, hasta }

  private todas: any[] = [];    // todas las ventas del vendedor
  ventas: any[] = [];           // filtradas por el rango (para el detalle)

  // KPIs
  montoTotal = 0;
  numVentas = 0;
  ticket = 0;
  montoMes = 0;

  porEntidad: Agrupado[] = [];
  porTipo: Agrupado[] = [];
  historial: { mes: string; monto: number; n: number }[] = [];

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    this.nombre = u?.nombre || '';
    this.vendedor = (u?.vendedor || '').trim();
    this.canal = u?.canal || '';
    const sede = (u?.sede || '').trim();
    this.sedeNombre = this.sedeCfg.getConfig(sede)?.nombre
      ?? (sede ? sede.charAt(0).toUpperCase() + sede.slice(1) : '');
    this.form = this.fb.group({ desde: [null], hasta: [null] });
    if (!this.vendedor) { this.sinVendedor = true; return; }
    this.cargar();
  }

  cargar(): void {
    this.cargando = true; this.error = '';
    // Fuente según canal:
    //  · Call    → tabla ventas_call    (evolutivo propio: mes actual + meses anteriores).
    //  · Realzza → tabla ventas_realzza (el "vendedor" es la sede; NC/refact por mes de afectación).
    //  · Sedes   → tabla ventas (afectaciones), como hasta ahora.
    const canal = (this.canal || '').toLowerCase();
    // En Ventas Call cada asesor se identifica por su CÓDIGO (CC1, CC5, …); la
    // tabla ventas_call guarda el código en `vendedor`, así que mapeamos el
    // nombre del usuario a su código antes de filtrar.
    const obs = canal === 'call'
      ? this.ventasSvc.obtenerVentasCanal('call', { vendedor: this.codigoCall(this.vendedor) })
      : canal === 'realzza'
        ? this.ventasSvc.obtenerVentasCanal('realzza', { vendedor: this.vendedor })
        : this.ventasSvc.obtenerVentasPorVendedor(this.vendedor);
    obs.subscribe({
      next: (rows) => { this.todas = rows || []; this.aplicar(); this.cargando = false; },
      error: () => { this.error = 'No se pudieron cargar tus ventas.'; this.cargando = false; },
    });
  }

  /**
   * Código del asesor Call (CC1, CC5…) a partir del nombre guardado en el usuario.
   * En Ventas Call la identidad es el código, no el nombre. Si el valor ya es un
   * código o no se encuentra, se devuelve tal cual para no romper el filtro.
   */
  private codigoCall(valor: string): string {
    const v = (valor || '').trim().toUpperCase();
    const a = ASESORES_CALL.find(x => x.nombre.toUpperCase() === v || x.value.toUpperCase() === v);
    return a ? a.value : (valor || '').trim();
  }

  /**
   * ¿La fila es una afectación que RESTA del monto real? (nota de crédito,
   * refacturación o incautación). Es la misma venta re-estampada con su fecha de
   * afectación (mes_af/anio_af): suma en su mes de venta y revierte en el de afectación.
   * PRONTO PAGO / CANCELADO / ACTIVO son ventas válidas y NO restan.
   */
  private esReductor(r: any): boolean {
    const e = (r?.estado_venta || '').toString().toUpperCase();
    return e.includes('NOTA DE CR') || e.includes('INCAUTAC') || e.includes('REFACTUR');
  }

  /** Aplica el rango de fechas (si hay) y recalcula KPIs, agrupaciones e historial. */
  aplicar(): void {
    const desde = this.form.value.desde ? this.ymd(this.form.value.desde) : null;
    const hasta = this.form.value.hasta ? this.ymd(this.form.value.hasta) : null;
    let rows = this.todas;
    if (desde || hasta) {
      rows = rows.filter(r => {
        const f = (r.fecha_cv || '').toString().slice(0, 10);
        if (!f) return false;
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
        return true;
      });
    }
    this.ventas = rows;

    // Monto real = ventas − (NC / refacturaciones / incautaciones). Como cada
    // afectación es la misma venta revertida, su aporte neto total es 0.
    this.montoTotal = rows.reduce((s, r) => s + (this.esReductor(r) ? 0 : Number(r.monto_consolidado || 0)), 0);
    this.numVentas = rows.filter(r => !this.esReductor(r)).length;
    this.ticket = this.numVentas ? this.montoTotal / this.numVentas : 0;

    // Mes en curso: suma ventas cuyo mes de VENTA es el actual y resta las
    // afectaciones cuyo mes de AFECTACIÓN es el actual (así cuadra el monto real).
    const hoy = new Date(), ay = hoy.getFullYear(), am = hoy.getMonth() + 1;
    this.montoMes = rows.reduce((s, r) => {
      let v = 0;
      const m = Number(r.monto_consolidado || 0);
      if (Number(r.anio_cv) === ay && Number(r.mes_cv) === am) v += m;
      if (this.esReductor(r) && Number(r.anio_af) === ay && Number(r.mes_af) === am) v -= m;
      return s + v;
    }, 0);

    this.porEntidad = this.agrupar(rows, 'entidad');
    this.porTipo = this.agrupar(rows, 'tipo_credito');
    this.historial = this.porMes(rows);
  }

  /** Agrupa por un campo sumando el monto real (las afectaciones netean a 0). */
  private agrupar(rows: any[], campo: string): Agrupado[] {
    const m = new Map<string, Agrupado>();
    for (const r of rows) {
      if (this.esReductor(r)) continue;   // la venta se revierte → no aporta al neto
      const k = (r[campo] ?? '').toString().trim() || '—';
      if (!m.has(k)) m.set(k, { clave: k, monto: 0, n: 0 });
      const o = m.get(k)!; o.monto += Number(r.monto_consolidado || 0); o.n++;
    }
    return [...m.values()].sort((a, b) => b.monto - a.monto);
  }

  /**
   * Historial mensual del monto real: cada venta suma en su mes de VENTA (CV) y
   * las afectaciones restan en su mes de AFECTACIÓN (AF). Así una venta anulada
   * un mes posterior mantiene su mes original y descuenta en el mes de la NC.
   */
  private porMes(rows: any[]): { mes: string; monto: number; n: number }[] {
    const m = new Map<string, { mes: string; monto: number; n: number }>();
    const add = (a: number, me: number, monto: number, dn: number) => {
      if (!a || !me) return;
      const k = `${a}-${String(me).padStart(2, '0')}`;
      if (!m.has(k)) m.set(k, { mes: k, monto: 0, n: 0 });
      const o = m.get(k)!; o.monto += monto; o.n += dn;
    };
    for (const r of rows) {
      const monto = Number(r.monto_consolidado || 0);
      add(Number(r.anio_cv), Number(r.mes_cv), monto, 1);                 // venta en su mes CV
      if (this.esReductor(r)) add(Number(r.anio_af), Number(r.mes_af), -monto, -1); // reversa en su mes AF
    }
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  limpiarRango(): void { this.form.patchValue({ desde: null, hasta: null }); this.aplicar(); }

  soles(v: number): string { return 'S/ ' + Math.round(v || 0).toLocaleString('es-PE'); }
  formatoSoles = (arg: any) => this.soles(arg.value);

  // 'YYYY-MM' → 'Jul - 2026'
  private readonly MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  formatMes(ym: string): string {
    const m = (ym || '').toString().match(/^(\d{4})-(\d{2})/);
    return m ? `${this.MESES[+m[2] - 1] || m[2]} - ${m[1]}` : ym;
  }
  mesAxisLabel = (arg: any) => this.formatMes(arg.value);
}
