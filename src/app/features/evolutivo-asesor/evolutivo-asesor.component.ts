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

  /** Suma el monto/ops del asesor elegido por mes, rellenando con 0 los meses sin
   *  venta (para que el evolutivo no tenga huecos en el rango elegido). */
  private recomputarSerie(): void {
    const desde = this.form.value.desde as Date;
    const hasta = this.form.value.hasta as Date;
    const ymDesde = desde.getFullYear() * 12 + desde.getMonth();
    const ymHasta = hasta.getFullYear() * 12 + hasta.getMonth();

    const porMes = new Map<number, { monto: number; ops: number }>();
    for (let ym = ymDesde; ym <= ymHasta; ym++) porMes.set(ym, { monto: 0, ops: 0 });

    if (this.asesorSel) {
      for (const r of this.rawRows) {
        const key = (r.asesor || '').toString().trim().toUpperCase();
        // Variantes/typos del mismo asesor en los datos (ej. "NICOLL" vs "NICOL" de
        // Brenda) que si no se normalizan no calzan con nadie del roster.
        if ((ALIAS_REALZZA[key] || key) !== this.asesorSel) continue;
        const ym = r.anio * 12 + (r.mes - 1);
        const cur = porMes.get(ym);
        if (!cur) continue;
        cur.monto += Number(r.monto) || 0;
        cur.ops += Number(r.ops) || 0;
      }
    }

    this.filas = Array.from(porMes.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ym, v]) => ({ ym, label: `${this.MESES[ym % 12]} ${Math.floor(ym / 12)}`, monto: Math.round(v.monto), ops: v.ops }));

    this.chartData = this.filas.map(f => ({ mes: f.label, Monto: f.monto }));
    this.kTotalMonto = this.filas.reduce((s, f) => s + f.monto, 0);
    this.kTotalOps = this.filas.reduce((s, f) => s + f.ops, 0);
    this.kPromedioMes = this.filas.length ? this.kTotalMonto / this.filas.length : 0;
  }

  get nombreAsesorSel(): string {
    return this.roster.find(r => r.value === this.asesorSel)?.nombre || '';
  }

  soles(n: number): string { return 'S/ ' + Math.round(n || 0).toLocaleString('es-PE'); }

  /** Etiqueta de las barras/puntos: oculta el "S/ 0" de los meses sin venta. */
  lblMonto = (info: any): string => (info?.value ? this.soles(info.value) : '');
}
