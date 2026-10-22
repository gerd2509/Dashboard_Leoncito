import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { DxDataGridComponent } from 'devextreme-angular';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
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

interface ResumenEmbudo {
  embudo: string; total: number; respondidos: number; noRespondidos: number; pctRespondidos: number;
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

  /** Nombre base del archivo: tienda + (mes/año o "Todo"). */
  private nombreBase(prefijo: string): string {
    const { anio, mes } = this.form.value;
    const tiendaTxt = this.tienda === 'REALZZA PIURA' ? 'Piura' : this.tienda === 'REALZZA LIMA' ? 'Lima' : 'Chiclayo';
    const periodo = this.verTodo ? 'Todo' : `${this.meses.find(m => m.v === mes)?.t || mes} ${anio}`;
    return `${prefijo} ${tiendaTxt} - ${periodo}`.replace(/[\\/:*?"<>|]/g, '');
  }

  /** Exporta a Excel lo que se ve AHORA en la grilla — respeta la tienda (Chiclayo/
   *  Piura/Lima), el mes/año y cualquier filtro/búsqueda que tenga escrito en la grilla. */
  async exportar(): Promise<void> {
    if (!this.grid || !this.filas.length) return;
    await this.excelSrv.exportarDesdeGrid(this.nombreBase('Listado Kommo Realzza'), this.grid);
  }

  /** Exporta a Excel SEPARADO POR EMBUDO (asesor): un archivo .xlsx distinto por cada
   *  embudo, nombrado con el embudo, así se puede mandar el detalle de cada uno por
   *  separado. Respeta el mismo filtro/búsqueda activo en la grilla que el export general. */
  async exportarPorEmbudo(): Promise<void> {
    if (!this.grid || !this.filas.length) return;
    const store = this.grid.instance.getDataSource().store();
    const resultado: any = await store.load({ filter: this.grid.instance.getCombinedFilter() });
    const datos: FilaLead[] = Array.isArray(resultado) ? resultado : (resultado?.data || []);
    if (!datos.length) return;

    const porEmbudo = new Map<string, FilaLead[]>();
    for (const f of datos) {
      const clave = f.embudo || 'SIN EMBUDO';
      let lista = porEmbudo.get(clave);
      if (!lista) { lista = []; porEmbudo.set(clave, lista); }
      lista.push(f);
    }

    const columnas: { header: string; key: keyof FilaLead }[] = [
      { header: 'ID', key: 'id' },
      { header: 'Nombre del Cliente', key: 'nombre_cliente' },
      { header: 'Estado del Lead', key: 'estado' },
      { header: 'Etiquetas', key: 'etiquetas' },
      { header: 'Fecha Creación', key: 'fecha_creacion' },
      { header: 'Fecha Modificación', key: 'ultima_modificacion' },
      { header: 'Usuario que Modificó', key: 'modificado_por' },
      { header: 'Respondido', key: 'respondido' },
    ];

    const nombresUsados = new Set<string>();
    for (const [embudo, lista] of [...porEmbudo.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const wb = new Workbook();
      const ws = wb.addWorksheet('Leads');
      const hr = ws.addRow(columnas.map(c => c.header));
      hr.font = { bold: true };
      for (const f of lista) {
        ws.addRow(columnas.map(c => (c.key === 'respondido' ? (f.respondido ? 'Sí' : 'No') : (f as any)[c.key])));
      }
      ws.columns.forEach(col => { col.width = 20; });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      FileSaver.saveAs(blob, `${this.nombreArchivoValido(embudo, nombresUsados)}.xlsx`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  /** Nombre de archivo válido para un embudo: sin caracteres inválidos, sin repetir
   *  uno ya usado en la misma exportación. */
  private nombreArchivoValido(embudo: string, usados: Set<string>): string {
    const base = `${this.nombreBase('Leads')} - ${embudo || 'SIN EMBUDO'}`.replace(/[\\/:*?"<>|]/g, '').trim();
    let final = base, i = 2;
    while (usados.has(final)) final = `${base} (${i++})`;
    usados.add(final);
    return final;
  }

  get totalLeads(): number { return this.filas.length; }
  get totalSinResponder(): number { return this.filas.filter(f => !f.respondido).length; }
  get pctSinResponder(): number { return this.totalLeads ? (this.totalSinResponder / this.totalLeads) * 100 : 0; }

  resumenEmbudo: ResumenEmbudo[] = [];

  /** Recalcula el detalle por asesor/embudo a partir de TODO lo que cumple el
   *  filtro/búsqueda activo en la grilla (no solo la página visible) — se dispara
   *  cada vez que la grilla re-renderiza por un filtro, búsqueda o carga nueva.
   *  Usa el mismo truco que los exports: lee del store con el filtro combinado,
   *  sin paginar, para no quedarse solo con las 10 filas de la página actual. */
  async recomputarResumen(): Promise<void> {
    let datos: FilaLead[] = this.filas;
    if (this.grid) {
      const store = this.grid.instance.getDataSource().store();
      const resultado: any = await store.load({ filter: this.grid.instance.getCombinedFilter() });
      datos = Array.isArray(resultado) ? resultado : (resultado?.data || []);
    }

    const porEmbudo = new Map<string, { total: number; respondidos: number }>();
    for (const f of datos) {
      const clave = f.embudo || 'SIN EMBUDO';
      const acc = porEmbudo.get(clave) || { total: 0, respondidos: 0 };
      acc.total++;
      if (f.respondido) acc.respondidos++;
      porEmbudo.set(clave, acc);
    }
    this.resumenEmbudo = [...porEmbudo.entries()]
      .map(([embudo, { total, respondidos }]) => ({
        embudo, total, respondidos, noRespondidos: total - respondidos,
        pctRespondidos: total ? (respondidos / total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }

  get resumenTotal(): { total: number; respondidos: number; noRespondidos: number } {
    return this.resumenEmbudo.reduce(
      (acc, r) => ({ total: acc.total + r.total, respondidos: acc.respondidos + r.respondidos, noRespondidos: acc.noRespondidos + r.noRespondidos }),
      { total: 0, respondidos: 0, noRespondidos: 0 },
    );
  }

  onCellPrepared(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
    }
  }
}
