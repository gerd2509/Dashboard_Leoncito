import { Component, inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

/** Una fila ya agregada por (Tipo de Producto, Marca, Sede) del mes elegido. */
interface FilaProducto {
  tipoProducto: string; marca: string; sede: string;
  cantidad: number; monto: number; margenTotal: number; ops: number;
}

/**
 * "Ventas × Tipo de Producto": cantidad y monto vendido del mes, cruzado libremente
 * por Tipo de Producto / Marca / Sede (todas desde margen_ventas, que ya viene
 * desglosada por línea de producto — no hay que partir el monto consolidado a mano).
 * Arrastra las columnas del grid para agrupar por cualquier combinación, ej.
 * "Tipo de Producto" para ver TELEVISORES y expandir por Marca para ver AIWA.
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

  filas: FilaProducto[] = [];
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
        tipoProducto: r.tipo_producto, marca: r.marca, sede: r.sede,
        cantidad: Number(r.cantidad) || 0, monto: Number(r.monto) || 0,
        margenTotal: Number(r.margen_total) || 0, ops: Number(r.ops) || 0,
      }));
      this.totalCantidad = this.filas.reduce((s, f) => s + f.cantidad, 0);
      this.totalMonto = this.filas.reduce((s, f) => s + f.monto, 0);
    } catch (e) {
      console.error('Error al cargar Ventas × Tipo de Producto:', e);
      this.error = 'No se pudo cargar la información (revisa la conexión al servidor).';
      this.filas = []; this.totalCantidad = 0; this.totalMonto = 0;
    } finally {
      this.isLoading = false;
    }
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
