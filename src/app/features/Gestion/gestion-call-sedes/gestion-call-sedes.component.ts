import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../../services/service-google.service';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DxDataGridComponent } from 'devextreme-angular';
import { ExcelExportService } from '../../../services/excel/excel.service';

@Component({
  selector: 'app-gestion-call-sedes',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-call-sedes.component.html',
  styleUrl: './gestion-call-sedes.component.css'
})
export class GestionCallSedesComponent implements OnInit {
  protected service      = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  formGestion: UntypedFormGroup;
  dataFiltrada: any[] = [];
  listData:     any[] = [];

  protected showFilterRow = true;
  protected currentFilter = 'auto';

  isLoading = false;

  // Por ahora solo Ferreñafe (data del endpoint /ferre)
  sedeNombre = 'Ferreñafe';

  // Asesores del formulario de Ferreñafe (columna 'ASESOR CONTACT')
  asesores: string[] = [
    'ESMERALDA CHICOMA',
    'LUCIA RUIZ',
    'IRENE CARRASCO',
    'LISET NUÑEZ',
    'PAOLA QUEZADA',
    'NATALI MORANTE',
    'DANITZA CESPEDES',
    'ADRIANA GINES',
    'JULISSA VILCHEZ',
    'DAYANA CIEZA',
    'ERICK CAJO',
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      asesor:      [''],
      fechaInicio: [null],
      fechaFin:    [null],
    });
  }

  async ngOnInit() {
    await this.cargarData();
  }

  private async cargarData(): Promise<void> {
    this.isLoading = true;
    try {
      // Formulario de gestión de Ferreñafe (/ferre)
      this.listData = await lastValueFrom(this.service.getSheetDataFerre());
      this.aplicarFiltros();
    } catch (e) {
      console.error('Error al cargar datos de Ferreñafe:', e);
      this.listData = [];
      this.dataFiltrada = [];
    } finally {
      this.isLoading = false;
    }
  }

  aplicarFiltros(): void {
    const { asesor, fechaInicio, fechaFin } = this.formGestion.value;
    let filtrados = [...this.listData];

    // 1) Por rango de fechas (opcional)
    if (fechaInicio && fechaFin) {
      const desde = new Date(fechaInicio); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(fechaFin);    hasta.setHours(23, 59, 59, 999);
      filtrados = filtrados.filter(r => {
        const f = this.parseMarcaTemporal(r['Marca temporal']);
        return f ? f >= desde && f <= hasta : false;
      });
    }

    // 2) Por asesor (opcional)
    if (asesor) {
      filtrados = filtrados.filter(r =>
        (r['ASESOR CONTACT'] || '').toString().trim().toUpperCase() === asesor.trim().toUpperCase()
      );
    }

    this.dataFiltrada = filtrados;
  }

  onAsesorChanged(event: any): void {
    this.formGestion.patchValue({ asesor: event.value });
    this.aplicarFiltros();
  }

  filtrarPorFecha(): void {
    this.aplicarFiltros();
  }

  exportar(): void {
    if (this.dataGrid) this.excelService.exportarDesdeGrid('gestion-call-ferrenafe', this.dataGrid);
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding         = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color           = 'white';
      e.cellElement.style.textAlign       = 'center';
      e.cellElement.style.fontWeight      = 'bold';
      e.cellElement.style.whiteSpace      = 'normal';
      e.cellElement.style.height          = 'auto';
      e.cellElement.style.border          = '1.5px solid black';
    }
  }

  private parseMarcaTemporal(texto: string): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
    const match = texto.match(regex);
    if (!match) return null;

    let day    = parseInt(match[1], 10);
    let month  = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    let hour   = match[4] ? parseInt(match[4], 10) : 0;
    const min  = match[5] ? parseInt(match[5], 10) : 0;
    const sec  = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7]?.toUpperCase() ?? null;

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const d = new Date(year, month, day, hour, min, sec, 0);
    return isNaN(d.getTime()) ? null : d;
  }
}
