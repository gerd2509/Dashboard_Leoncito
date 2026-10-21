import { Component, OnInit, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';
import { ASESORES_CALL, ASESORES_REALZZA, ALIAS_REALZZA } from '../../shared/asesores';

type Canal = 'CALL' | 'REALZZA';
type TiendaRealzza = 'REALZZA' | 'REALZZA PIURA' | 'REALZZA LIMA';
type Categoria = 'MOTOS' | 'MELAMINA' | 'RESTO';

interface AsesorOpcion { value: string; nombre: string; }
interface FilaMesAsesor { ym: number; label: string; monto: number; ops: number; }
interface RawRow { asesor: string; anio: number; mes: number; categoria: Categoria; monto: number; ops: number; }
/** Fila del resumen global: un asesor, su total del rango y su curva mensual (para
 *  el mini-gráfico) — montos nada más, en el mismo orden que `filas`. */
interface ResumenAsesor { value: string; nombre: string; monto: number; ops: number; serie: number[]; }

/**
 * "Evolutivo por Asesor": elige Call o Realzza (y, dentro de Realzza, Chiclayo/Piura/
 * Lima), elige UN asesor de la tienda y un rango de meses, y muestra la evolución
 * mensual de SU monto vendido (para medir el desempeño individual en el tiempo, no
 * el total de la tienda). Misma fuente que "Ventas por Línea" (/ventas-linea-asesor):
 * trae TODOS los asesores del canal/tienda de una sola vez y el filtro por asesor se
 * hace en el navegador (cambiar de asesor no dispara otra consulta al backend).
 */
@Component({
  selector: 'app-evolutivo-asesor',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './evolutivo-asesor.component.html',
  styleUrl: './evolutivo-asesor.component.css',
})
export class EvolutivoAsesorComponent implements OnInit {
  private ventasSrv = inject(CargaVentasService);
  private cap = inject(CapSedesService);

  form: UntypedFormGroup;
  isLoading = false;
  error = '';

  canal: Canal = 'CALL';
  tienda: TiendaRealzza = 'REALZZA';

  roster: AsesorOpcion[] = [];
  asesorSel: string | null = null;

  private rawRows: RawRow[] = [];
  filas: FilaMesAsesor[] = [];
  chartData: any[] = [];

  /** Resumen de TODOS los asesores del roster (total + curva mensual en miniatura),
   *  ordenado de mayor a menor monto. Se muestra arriba, antes de elegir un asesor. */
  resumenGlobal: ResumenAsesor[] = [];
  /** Meses del rango elegido, en el MISMO orden que `ResumenAsesor.serie` — una
   *  columna por mes en la tabla del resumen global. `calc` se arma UNA vez acá
   *  (no en el template) para que la referencia no cambie en cada detección de
   *  cambios — si no, dx-data-grid recrearía la columna constantemente. */
  mesesColumnas: { ym: number; label: string; calc: (rowData: ResumenAsesor) => number }[] = [];

  kTotalMonto = 0;
  kTotalOps = 0;
  kPromedioMes = 0;

  private readonly MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);   // últimos 12 meses
    this.form = this.fb.group({ desde: [desde], hasta: [hoy] });
  }

  async ngOnInit(): Promise<void> {
    await this.cargarRoster();
    await this.cargar();
  }

  async setCanal(c: Canal): Promise<void> {
    if (this.canal === c) return;
    this.canal = c; this.tienda = 'REALZZA'; this.asesorSel = null;
    await this.cargarRoster();
    await this.cargar();
  }

  async setTienda(t: TiendaRealzza): Promise<void> {
    if (this.tienda === t) return;
    this.tienda = t; this.asesorSel = null;
    await this.cargarRoster();
    await this.cargar();
  }

  setAsesor(v: string | null): void {
    this.asesorSel = v;
    this.recomputarSerie();
  }

  /** Roster de asesores de la tienda elegida. Call/Realzza Chiclayo = lista fija
   *  (shared/asesores.ts); Piura/Lima = en vivo desde el Maestro CAP. */
  private async cargarRoster(): Promise<void> {
    if (this.canal === 'CALL') {
      this.roster = ASESORES_CALL.map(a => ({ value: a.value, nombre: a.nombre }));
    } else if (this.tienda === 'REALZZA') {
      this.roster = ASESORES_REALZZA.map(a => ({ value: a.nombre.toUpperCase().trim(), nombre: a.nombre }));
    } else {
      try {
        const nombres = await this.cap.vendedoresActivos(this.tienda);
        this.roster = (nombres || []).map(n => ({ value: n, nombre: n }));
      } catch { this.roster = []; }
    }
    if (this.asesorSel && !this.roster.some(r => r.value === this.asesorSel)) this.asesorSel = null;
  }

  async cargar(): Promise<void> {
    const desde = this.form.value.desde as Date;
    const hasta = this.form.value.hasta as Date;
    if (!desde || !hasta) return;
    this.isLoading = true; this.error = '';
    try {
      const { rows } = await lastValueFrom(this.ventasSrv.obtenerVentasLineaAsesor({
        canal: this.canal,
        anioDesde: desde.getFullYear(), mesDesde: desde.getMonth() + 1,
        anioHasta: hasta.getFullYear(), mesHasta: hasta.getMonth() + 1,
        tienda: this.canal === 'REALZZA' ? this.tienda : undefined,
      }));
      this.rawRows = rows || [];
      this.recomputarSerie();
    } catch (e) {
      console.error('Error al cargar Evolutivo por Asesor:', e);
      this.error = 'No se pudo cargar la información. Reintenta o reduce el rango de meses.';
      this.rawRows = [];
      this.recomputarSerie();
    } finally {
      this.isLoading = false;
    }
  }

  /** Monto/ops por mes de UN asesor, rellenando con 0 los meses sin venta (para que
   *  el evolutivo no tenga huecos en el rango elegido). Normaliza variantes/typos
   *  conocidas (ej. "NICOLL" vs "NICOL" de Brenda) antes de comparar. */
  private serieDe(asesorValue: string, ymDesde: number, ymHasta: number): { ym: number; monto: number; ops: number }[] {
    const porMes = new Map<number, { monto: number; ops: number }>();
    for (let ym = ymDesde; ym <= ymHasta; ym++) porMes.set(ym, { monto: 0, ops: 0 });
    for (const r of this.rawRows) {
      const key = (r.asesor || '').toString().trim().toUpperCase();
      if ((ALIAS_REALZZA[key] || key) !== asesorValue) continue;
      const ym = r.anio * 12 + (r.mes - 1);
      const cur = porMes.get(ym);
      if (!cur) continue;
      cur.monto += Number(r.monto) || 0;
      cur.ops += Number(r.ops) || 0;
    }
    return Array.from(porMes.entries()).sort((a, b) => a[0] - b[0]).map(([ym, v]) => ({ ym, monto: Math.round(v.monto), ops: v.ops }));
  }

  /** Recalcula el detalle del asesor elegido Y el resumen global (todo el roster),
   *  ambos en el mismo rango de fechas elegido. */
  private recomputarSerie(): void {
    const desde = this.form.value.desde as Date;
    const hasta = this.form.value.hasta as Date;
    const ymDesde = desde.getFullYear() * 12 + desde.getMonth();
    const ymHasta = hasta.getFullYear() * 12 + hasta.getMonth();

    this.mesesColumnas = [];
    for (let ym = ymDesde; ym <= ymHasta; ym++) {
      const i = this.mesesColumnas.length;
      this.mesesColumnas.push({
        ym, label: `${this.MESES[ym % 12]} ${Math.floor(ym / 12)}`,
        calc: (rowData: ResumenAsesor) => rowData.serie[i] ?? 0,
      });
    }

    const serieSel = this.asesorSel ? this.serieDe(this.asesorSel, ymDesde, ymHasta) : [];
    this.filas = serieSel.map(v => ({ ...v, label: `${this.MESES[v.ym % 12]} ${Math.floor(v.ym / 12)}` }));
    this.chartData = this.filas.map(f => ({ mes: f.label, Monto: f.monto }));
    this.kTotalMonto = this.filas.reduce((s, f) => s + f.monto, 0);
    this.kTotalOps = this.filas.reduce((s, f) => s + f.ops, 0);
    this.kPromedioMes = this.filas.length ? this.kTotalMonto / this.filas.length : 0;

    this.resumenGlobal = this.roster
      .map(r => {
        const serie = this.serieDe(r.value, ymDesde, ymHasta);
        return {
          value: r.value, nombre: r.nombre,
          monto: serie.reduce((s, v) => s + v.monto, 0),
          ops: serie.reduce((s, v) => s + v.ops, 0),
          serie: serie.map(v => v.monto),
        };
      })
      .sort((a, b) => b.monto - a.monto);
  }

  /** Al hacer click en una fila del resumen global, selecciona ese asesor en el detalle. */
  verDetalleDe(a: ResumenAsesor): void {
    this.asesorSel = a.value;
    this.recomputarSerie();
  }

  get nombreAsesorSel(): string {
    return this.roster.find(r => r.value === this.asesorSel)?.nombre || '';
  }

  soles(n: number): string { return 'S/ ' + Math.round(n || 0).toLocaleString('es-PE'); }

  /** Etiqueta de las barras/puntos: oculta el "S/ 0" de los meses sin venta. */
  lblMonto = (info: any): string => (info?.value ? this.soles(info.value) : '');
}
