import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { SheetsService } from '../../../services/service-google.service';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular/ui/data-grid';
import { lastValueFrom } from 'rxjs/internal/lastValueFrom';

@Component({
  selector: 'app-gestion-post-venta',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-post-venta.component.html',
  styleUrl: './gestion-post-venta.component.css'
})
export class GestionPostVentaComponent implements OnInit {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  formGestion: UntypedFormGroup;

  // listData: Contiene TODOS los datos originales (sin filtrar)
  listData: any[] = [];
  // dataFiltrada: Contiene los datos que se muestran en la tabla
  dataFiltrada: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  isLoading = false;

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: [''],
    });
  }

  async ngOnInit() {
    this.isLoading = true;
    try {
      // 1. Carga inicial única
      this.listData = await lastValueFrom(this.service.getSheetDataPostVenta());
      this.dataFiltrada = [...this.listData];

      // Log para verificar formato en consola
      if (this.listData.length > 0) {
        console.log('Muestra de fecha recibida:', this.listData[0]["Timestamp"]);
      }
    } catch (error) {
      console.error('Error al cargar los datos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  aplicarFiltros(): void {
    // Nota: Ya no es async porque filtramos en memoria
    this.isLoading = true;
    try {
      const fechaInicio = this.formGestion.value.fechaInicio;
      const fechaFin = this.formGestion.value.fechaFin;

      // Si no hay fechas, mostramos todo
      if (!fechaInicio || !fechaFin) {
        this.dataFiltrada = [...this.listData];
        this.isLoading = false;
        return;
      }

      // Configurar fechas de filtro (inicio del día y fin del día)
      const desde = new Date(fechaInicio);
      desde.setHours(0, 0, 0, 0);

      const hasta = new Date(fechaFin);
      hasta.setHours(23, 59, 59, 999);

      // Filtramos la lista maestra
      const datosFiltrados = this.listData.filter(item => {
        const texto = item["Timestamp"];
        if (!texto) return false;

        const fecha = this.parseMarcaTemporal(texto);
        if (!fecha) return false;

        return fecha.getTime() >= desde.getTime() && fecha.getTime() <= hasta.getTime();
      });

      this.dataFiltrada = datosFiltrados;
      console.log(`Filtrado: ${this.dataFiltrada.length} registros encontrados.`);

    } catch (error) {
      console.error('Error al aplicar filtros:', error);
      this.dataFiltrada = [];
    } finally {
      this.isLoading = false;
    }
  }

  filtrarPorFecha() {
    this.aplicarFiltros();
  }

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataPostVenta", this.dataGrid);
    }
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding = "8px";
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.textAlign = "center";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.whiteSpace = "normal";
      e.cellElement.style.height = "auto";
      e.cellElement.style.border = "1.5px solid black";
    }
  }

  // ---------------------------------------------------------------------------
  // PARSEO CORREGIDO: Soporta formato americano (MM/dd/yyyy) de Google Sheets
  // ---------------------------------------------------------------------------
  private parseMarcaTemporal(texto: any): Date | null {
    if (!texto) return null;

    // Si ya es objeto Date
    if (texto instanceof Date) return texto;

    if (typeof texto === 'string') {
      // Regex ajustado para: Mes/Día/Año (MM/dd/yyyy)
      // Grupo 1: Mes, Grupo 2: Día, Grupo 3: Año
      const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
      const m = texto.match(regex);

      if (m) {
        // OJO: En formato americano, el primer número es el Mes
        const month = parseInt(m[1], 10) - 1; // Meses en JS son 0-11
        const day = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);

        let hour = m[4] ? parseInt(m[4], 10) : 0;
        const minute = m[5] ? parseInt(m[5], 10) : 0;
        const second = m[6] ? parseInt(m[6], 10) : 0;

        // Detección de AM/PM si viniera en el string (opcional según tu data real)
        if (texto.toLowerCase().includes('pm') && hour < 12) hour += 12;
        if (texto.toLowerCase().includes('am') && hour === 12) hour = 0;

        const d = new Date(year, month, day, hour, minute, second);
        return isNaN(d.getTime()) ? null : d;
      }

      // Intento secundario: ISO o nativo
      const d = new Date(texto);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }
}