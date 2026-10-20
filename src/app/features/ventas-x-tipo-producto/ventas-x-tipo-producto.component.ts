import { Component, inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

/** Una fila ya agregada por (Tipo de Producto, Marca, Sede) del mes elegido. */
interface FilaProducto {
  tipoProducto: string; marca: string; sede: string; vendedor: string;
  cantidad: number; monto: number; margenTotal: number; ops: number;
}

/**
 * "Ventas × Tipo de Producto": cantidad y monto vendido del mes. Tipo de Producto y
 * Sede son FILTROS (combos) — se elige uno (o "Todos") y la grilla, agrupada por
 * Marca, muestra justo esa combinación. Ej.: Setiembre + Televisor + Lambayeque →
 * cuántos televisores (y de qué marca) se vendieron ahí ese mes.
 */
@Component({
  selector: 'app-ventas-x-tipo-producto',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './ventas-x-tipo-producto.component.html',
  styleUrl: './ventas-x-tipo-producto.component.css',
})
export class VentasXTipoProductoComponent implements OnInit {
  private ventasSrv = inject(CargaVentasService);

  form: UntypedFormGroup;
  isLoading = false;
  error = '';

  readonly anios = [2025, 2026];
  readonly meses = [
    { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' },
    { v: 4, t: 'Abril' }, { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' },
    { v: 8, t: 'Agosto' }, { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' },
    { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];

  // Todo lo del mes (sin filtrar) — de acá salen las opciones de los combos y los
  // mensajes de "sin datos" del template.
  filas: FilaProducto[] = [];
  tiposProductoDisponibles: string[] = [];
  sedesDisponibles: string[] = [];
  // Opciones de Marca: dependen del Tipo de Producto elegido (si hay uno).
  marcasDisponibles: string[] = [];

  // Filtros de combo (null/'' = "Todos"). Van APARTE del form de Año/Mes porque no
  // necesitan recargar del servidor, solo refiltrar lo ya traído.
  tipoProductoSel: string | null = null;
  marcaSel: string | null = null;
  sedeSel: string | null = null;

  // Lo que de verdad ve la grilla — resultado cacheado (NO getter) para que el grid
  // no se reconstruya en cada ciclo de detección de cambios.
  filasFiltradas: FilaProducto[] = [];
  totalCantidad = 0;
  totalMonto = 0;

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    this.form = this.fb.group({ anio: [hoy.getFullYear()], mes: [hoy.getMonth() + 1] });
  }

  ngOnInit(): void { this.cargar(); }

  async cargar(): Promise<void> {
    this.isLoading = true;
    this.error = '';
    try {
      const { anio, mes } = this.form.value;
      const rows = await lastValueFrom(this.ventasSrv.obtenerMargenProducto(anio, mes));
      this.filas = (rows || []).map(r => ({
        tipoProducto: r.tipo_producto, marca: r.marca, sede: r.sede, vendedor: r.vendedor,
        cantidad: Number(r.cantidad) || 0, monto: Number(r.monto) || 0,
        margenTotal: Number(r.margen_total) || 0, ops: Number(r.ops) || 0,
      }));
      this.tiposProductoDisponibles = [...new Set(this.filas.map(f => f.tipoProducto))].sort();
      this.sedesDisponibles = [...new Set(this.filas.map(f => f.sede))].sort();
      // Si el tipo/sede elegido ya no existe en el mes nuevo, se limpia el filtro.
      if (this.tipoProductoSel && !this.tiposProductoDisponibles.includes(this.tipoProductoSel)) this.tipoProductoSel = null;
      if (this.sedeSel && !this.sedesDisponibles.includes(this.sedeSel)) this.sedeSel = null;
      this.actualizarMarcasDisponibles();
      this.aplicarFiltros();
    } catch (e) {
      console.error('Error al cargar Ventas × Tipo de Producto:', e);
      this.error = 'No se pudo cargar la información (revisa la conexión al servidor).';
      this.filas = []; this.tiposProductoDisponibles = []; this.sedesDisponibles = [];
      this.actualizarMarcasDisponibles();
      this.aplicarFiltros();
    } finally {
      this.isLoading = false;
    }
  }

  /** Marca depende del Tipo de Producto elegido: solo muestra las marcas que existen en él. */
  actualizarMarcasDisponibles(): void {
    const base = this.tipoProductoSel
      ? this.filas.filter(f => f.tipoProducto === this.tipoProductoSel)
      : this.filas;
    this.marcasDisponibles = [...new Set(base.map(f => f.marca))].sort();
    if (this.marcaSel && !this.marcasDisponibles.includes(this.marcaSel)) this.marcaSel = null;
  }

  /** Se llama al cambiar el combo de Tipo de Producto (además refiltra las marcas disponibles). */
  onTipoProductoChanged(): void {
    this.actualizarMarcasDisponibles();
    this.aplicarFiltros();
  }

  /** Se llama al cambiar el combo de Marca o de Sede (no recarga del servidor). */
  aplicarFiltros(): void {
    this.filasFiltradas = this.filas.filter(f =>
      (!this.tipoProductoSel || f.tipoProducto === this.tipoProductoSel) &&
      (!this.marcaSel || f.marca === this.marcaSel) &&
      (!this.sedeSel || f.sede === this.sedeSel));
    this.totalCantidad = this.filasFiltradas.reduce((s, f) => s + f.cantidad, 0);
    this.totalMonto = this.filasFiltradas.reduce((s, f) => s + f.monto, 0);
  }

  limpiarFiltros(): void {
    this.tipoProductoSel = null; this.marcaSel = null; this.sedeSel = null;
    this.actualizarMarcasDisponibles();
    this.aplicarFiltros();
  }

  onCellPrepared(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
    }
  }

  soles(n: number): string { return 'S/ ' + Math.round(n || 0).toLocaleString('es-PE'); }
}
