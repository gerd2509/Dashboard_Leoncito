import { Component, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';
import { ASESORES_CALL, ASESORES_REALZZA, nombreCorto } from '../../shared/asesores';

// Mapa código→nombre combinando AMBOS rosters actuales (Call + Realzza): un asesor
// puede haber pasado de canal (ej. Kelly/Anita/Brenda: Call→Realzza desde set-2026)
// y sus ventas de meses anteriores siguen apareciendo con su código de entonces —
// el nombre debe resolverse igual, sin importar en qué roster esté HOY.
const CODIGO_A_NOMBRE: Record<string, string> = Object.fromEntries(
  [...ASESORES_CALL, ...ASESORES_REALZZA].map(a => [a.value, a.nombre]));

interface MesCol { anio: number; mes: number; label: string; proyeccion: boolean; }
interface FilaLinea { asesor: string; nombre: string; valores: number[]; total: number; }
type Categoria = 'MOTOS' | 'MELAMINA' | 'RESTO';

/**
 * "Ventas por Línea": monto neto (− NC/incautaciones) por asesor × mes, separado en
 * Motos / Melamina / Resto. Motos y Melamina salen de margen_ventas.linea_real cuando
 * la venta ya tiene margen calculado (meses cerrados, exacto); si el mes aún no está
 * cubierto por margen (se actualiza con rezago) se aproxima por texto del producto —
 * de ahí que ese mes se marque como "(Proyección)".
 */
@Component({
  selector: 'app-ventas-linea',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './ventas-linea.component.html',
  styleUrl: './ventas-linea.component.css',
})
export class VentasLineaComponent implements OnInit {
  form: UntypedFormGroup;
  isLoading = false;
  error = '';

  canal: 'CALL' | 'REALZZA' = 'CALL';
  meses: MesCol[] = [];
  filas: FilaLinea[] = [];
  totales: number[] = [];
  totalGeneral = 0;

  private readonly MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  private readonly CAT_IDX: Record<Categoria, number> = { MOTOS: 0, MELAMINA: 1, RESTO: 2 };

  constructor(private fb: UntypedFormBuilder, private ventasSrv: CargaVentasService) {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);   // últimos 3 meses por defecto
    this.form = this.fb.group({ desde: [desde], hasta: [hoy] });
  }

  async ngOnInit(): Promise<void> { await this.cargar(); }

  setCanal(c: 'CALL' | 'REALZZA'): void {
    if (this.canal === c) return;
    this.canal = c;
    this.cargar();
  }

  async cargar(): Promise<void> {
    const desde = this.form.value.desde as Date;
    const hasta = this.form.value.hasta as Date;
    if (!desde || !hasta) return;
    this.isLoading = true;
    this.error = '';
    try {
      const { rows, mesesProyeccion } = await lastValueFrom(this.ventasSrv.obtenerVentasLineaAsesor({
        canal: this.canal,
        anioDesde: desde.getFullYear(), mesDesde: desde.getMonth() + 1,
        anioHasta: hasta.getFullYear(), mesHasta: hasta.getMonth() + 1,
      }));
      this.construir(rows || [], mesesProyeccion || [], desde, hasta);
    } catch (e: any) {
      console.error('Error al cargar Ventas por Línea:', e);
      this.error = 'No se pudo cargar la información. Reintenta o reduce el rango de meses.';
      this.meses = []; this.filas = []; this.totales = []; this.totalGeneral = 0;
    } finally {
      this.isLoading = false;
    }
  }

  private construir(
    rows: { asesor: string; anio: number; mes: number; categoria: Categoria; monto: number; ops: number }[],
    mesesProyeccion: string[],
    desde: Date, hasta: Date,
  ): void {
    // Columnas = un grupo (Motos/Melamina/Resto) por cada mes del rango.
    const meses: MesCol[] = [];
    const idxMes = new Map<string, number>();
    const tDesde = desde.getFullYear() * 12 + desde.getMonth();
    const tHasta = hasta.getFullYear() * 12 + hasta.getMonth();
    for (let t = tDesde; t <= tHasta && meses.length < 36; t++) {
      const anio = Math.floor(t / 12), mes = (t % 12) + 1;
      const key = `${anio}-${String(mes).padStart(2, '0')}`;
      idxMes.set(`${anio}-${mes}`, meses.length);
      meses.push({ anio, mes, label: `${this.MESES_CORTOS[mes - 1]} ${anio}`, proyeccion: mesesProyeccion.includes(key) });
    }
    this.meses = meses;
    const nCols = meses.length * 3;

    const porAsesor = new Map<string, number[]>();
    rows.forEach(r => {
      const mi = idxMes.get(`${r.anio}-${r.mes}`);
      if (mi === undefined) return;
      const key = (r.asesor || '').toString().trim();
      if (!key) return;
      let arr = porAsesor.get(key);
      if (!arr) { arr = new Array(nCols).fill(0); porAsesor.set(key, arr); }
      arr[mi * 3 + this.CAT_IDX[r.categoria]] += r.monto || 0;
    });

    // Roster conocido primero (en su orden, aunque tenga 0 en el rango) + cualquier
    // código/nombre con datos que no esté en el roster actual (para no perder histórico).
    const roster = this.canal === 'CALL' ? ASESORES_CALL : ASESORES_REALZZA;
    const filas: FilaLinea[] = [];
    const vistos = new Set<string>();
    roster.forEach(a => {
      const key = this.canal === 'CALL' ? a.value : a.nombre.toUpperCase().trim();
      vistos.add(key);
      const valores = porAsesor.get(key) || new Array(nCols).fill(0);
      filas.push({ asesor: key, nombre: nombreCorto(a.nombre), valores, total: valores.reduce((s, v) => s + v, 0) });
    });
    porAsesor.forEach((valores, key) => {
      if (vistos.has(key)) return;
      const total = valores.reduce((s, v) => s + v, 0);
      if (total === 0) return;
      // Código/nombre fuera del roster ACTUAL de este canal (ej. pasó al otro canal
      // después): se resuelve el nombre igual por el mapa combinado, en vez de
      // mostrar el código crudo.
      const nombre = this.canal === 'CALL' ? (CODIGO_A_NOMBRE[key] ? nombreCorto(CODIGO_A_NOMBRE[key]) : key) : nombreCorto(key);
      filas.push({ asesor: key, nombre, valores, total });
    });
    filas.sort((a, b) => b.total - a.total);
    this.filas = filas;

    const totales = new Array(nCols).fill(0);
    filas.forEach(f => f.valores.forEach((v, i) => totales[i] += v));
    this.totales = totales;
    this.totalGeneral = totales.reduce((s, v) => s + v, 0);
  }

  soles(n: number): string { return 'S/ ' + Math.round(n || 0).toLocaleString('es-PE'); }
}
