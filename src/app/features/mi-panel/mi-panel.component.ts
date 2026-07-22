import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SedeConfigService } from '../../services/sede-config.service';

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
    this.ventasSvc.obtenerVentasPorVendedor(this.vendedor).subscribe({
      next: (rows) => { this.todas = rows || []; this.aplicar(); this.cargando = false; },
      error: () => { this.error = 'No se pudieron cargar tus ventas.'; this.cargando = false; },
    });
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

    this.montoTotal = rows.reduce((s, r) => s + Number(r.monto_consolidado || 0), 0);
    this.numVentas = rows.length;
    this.ticket = this.numVentas ? this.montoTotal / this.numVentas : 0;

    const hoy = new Date();
    this.montoMes = rows
      .filter(r => Number(r.anio_cv) === hoy.getFullYear() && Number(r.mes_cv) === (hoy.getMonth() + 1))
      .reduce((s, r) => s + Number(r.monto_consolidado || 0), 0);

    this.porEntidad = this.agrupar(rows, 'entidad');
    this.porTipo = this.agrupar(rows, 'tipo_credito');
    this.historial = this.porMes(rows);
  }

  private agrupar(rows: any[], campo: string): Agrupado[] {
    const m = new Map<string, Agrupado>();
    for (const r of rows) {
      const k = (r[campo] ?? '').toString().trim() || '—';
      if (!m.has(k)) m.set(k, { clave: k, monto: 0, n: 0 });
      const o = m.get(k)!; o.monto += Number(r.monto_consolidado || 0); o.n++;
    }
    return [...m.values()].sort((a, b) => b.monto - a.monto);
  }

  private porMes(rows: any[]): { mes: string; monto: number; n: number }[] {
    const m = new Map<string, { mes: string; monto: number; n: number }>();
    for (const r of rows) {
      const a = Number(r.anio_cv), me = Number(r.mes_cv);
      if (!a || !me) continue;
      const k = `${a}-${String(me).padStart(2, '0')}`;
      if (!m.has(k)) m.set(k, { mes: k, monto: 0, n: 0 });
      const o = m.get(k)!; o.monto += Number(r.monto_consolidado || 0); o.n++;
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
