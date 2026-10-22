import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { DxDataGridComponent } from 'devextreme-angular';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ExcelExportService } from '../../services/excel/excel.service';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

type TiendaRealzza = 'REALZZA' | 'REALZZA PIURA' | 'REALZZA LIMA';

interface FilaLead {
  id: number; nombre_cliente: string; embudo: string; estado: string; responsable: string; etiquetas: string;
  fecha_creacion: string; ultima_modificacion: string; modificado_por: string; respondido: boolean;
}

/**
 * "Listado Kommo Realzza": trae los leads del mes directo de la API de Kommo (botón
 * Sincronizar) y los lista con su embudo/estado/fechas/quién los modificó — para ver
 * de un vistazo quién está respondido y quién no. Solo Realzza (Chiclayo/Piura/Lima):
 * la cuenta de Kommo conectada es únicamente de Realzza, Call sigue con su Excel.
 */
@Component({
  selector: 'app-listado-kommo-realzza',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './listado-kommo-realzza.component.html',
  styleUrl: './listado-kommo-realzza.component.css',
})
export class ListadoKommoRealzzaComponent implements OnInit {
  private ventasSrv = inject(CargaVentasService);
  private excelSrv = inject(ExcelExportService);

  @ViewChild('grid', { static: false }) grid!: DxDataGridComponent;

  form: UntypedFormGroup;
  tienda: TiendaRealzza = 'REALZZA';
  verTodo = false;
  isLoading = false;
  sincronizando = false;
  error = '';
  mensajeSync = '';

  filas: FilaLead[] = [];

  readonly anios = [2025, 2026];
  readonly meses = [
    { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' },
    { v: 4, t: 'Abril' }, { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' },
    { v: 8, t: 'Agosto' }, { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' },
    { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    this.form = this.fb.group({ anio: [hoy.getFullYear()], mes: [hoy.getMonth() + 1] });
  }

  ngOnInit(): void { this.cargar(); }

  setTienda(t: TiendaRealzza): void {
    if (this.tienda === t) return;
    this.tienda = t;
    this.cargar();
  }

  setVerTodo(v: boolean): void {
    if (this.verTodo === v) return;
    this.verTodo = v;
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.isLoading = true; this.error = '';
    try {
      const { anio, mes } = this.form.value;
      this.filas = await lastValueFrom(this.verTodo
        ? this.ventasSrv.obtenerListadoLeadsKommo(undefined, undefined, this.tienda)
        : this.ventasSrv.obtenerListadoLeadsKommo(anio, mes, this.tienda));
    } catch (e) {
      console.error('Error al cargar el listado de Kommo:', e);
      this.error = 'No se pudo cargar el listado.';
      this.filas = [];
    } finally {
      this.isLoading = false;
    }
  }

  async sincronizar(): Promise<void> {
    this.sincronizando = true; this.error = ''; this.mensajeSync = '';
    try {
      const { anio, mes } = this.form.value;
      const r = await lastValueFrom(this.ventasSrv.sincronizarLeadsKommo(anio, mes));
      this.mensajeSync = `Listo: ${r.filas} leads de Kommo (${r.insertados} nuevos, ${r.actualizados} actualizados).`;
      await this.cargar();
    } catch (e: any) {
      console.error('Error al sincronizar con Kommo:', e);
      this.error = e?.error?.message || 'No se pudo sincronizar con Kommo.';
    } finally {
      this.sincronizando = false;
    }
  }

  /** Exporta a Excel lo que se ve AHORA en la grilla — respeta la tienda (Chiclayo/
   *  Piura/Lima), el mes/año y cualquier filtro/búsqueda que tenga escrito en la grilla. */
  async exportar(): Promise<void> {
    if (!this.grid || !this.filas.length) return;
    const { anio, mes } = this.form.value;
    const mesTxt = this.meses.find(m => m.v === mes)?.t || mes;
    const tiendaTxt = this.tienda === 'REALZZA PIURA' ? 'Piura' : this.tienda === 'REALZZA LIMA' ? 'Lima' : 'Chiclayo';
    await this.excelSrv.exportarDesdeGrid(`Listado Kommo Realzza ${tiendaTxt} - ${mesTxt} ${anio}`, this.grid);
  }

  get totalLeads(): number { return this.filas.length; }
  get totalSinResponder(): number { return this.filas.filter(f => !f.respondido).length; }
  get pctSinResponder(): number { return this.totalLeads ? (this.totalSinResponder / this.totalLeads) * 100 : 0; }

  onCellPrepared(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
    }
  }
}
