import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { SheetsService } from '../../services/service-google.service';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { lastValueFrom } from 'rxjs';
import { ExcelExportService } from '../../services/excel/excel.service';
import { DxDataGridComponent } from 'devextreme-angular';

@Component({
  selector: 'app-gestion-cobranzas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-cobranzas.component.html',
  styleUrl: './gestion-cobranzas.component.css'
})
export class GestionCobranzasComponent implements OnInit {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  formCobranzas: UntypedFormGroup;

  dataOriginal: any[] = [];        // 🔹 Data base (solo COBRANZAS)
  // dataContactabilidad: any[] = []; // 🔹 Grilla 1
  dataFiltrada: any[] = [];        // 🔹 Grilla 2 (se alimenta de dataOriginal)

  porcentajeTotalContactabilidad = 0;
  isLoading = false;

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  asesores1 = [
    { value: '', viewValue: 'Seleccione Asesor' },
    { value: 'AC10', viewValue: 'RIVAS PURISACA KAREN YUDITH' }
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    const currentDate = new Date();
    this.formCobranzas = this.fb.group({
      fechaGestion: [currentDate],
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
    });
  }

  async ngOnInit() {
    this.isLoading = true;
    try {
      await this.cargarData();
      this.dataFiltrada = [...this.dataOriginal];
    } catch (error) {
      console.error('Error en actualizar:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async actualizar() {
    this.isLoading = true;
    try {
      this.aplicarFiltros();              // 🔹 Aplica filtro por fechas sobre dataOriginal
      // this.totalContactabilidadContact(); // 🔹 Recalcula contactabilidad
    } catch (error) {
      console.error('Error en actualizar:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async cargarData() {
    try {
      const data = await lastValueFrom(this.service.getSheetData());

      // 🔹 Filtrar solo área COBRANZAS
      this.dataOriginal = (data || []).filter(
        item => item['AREA DE GESTIÓN']?.toUpperCase().trim() === 'COBRANZAS'
      );

      console.log('Datos filtrados (solo COBRANZAS):', this.dataOriginal);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      this.dataOriginal = [];
    }
  }

  /** 🔹 Aplica filtros de fecha sobre dataOriginal y llena dataFiltrada */
  private aplicarFiltros() {
    const fechaInicio = this.formCobranzas.value.fechaInicio;
    const fechaFin = this.formCobranzas.value.fechaFin;

    if (!fechaInicio || !fechaFin) {
      // Si no hay rango de fechas, mostrar todo
      this.dataFiltrada = [...this.dataOriginal];
      return;
    }

    const desde = new Date(fechaInicio);
    desde.setHours(0, 0, 0, 0);

    const hasta = new Date(fechaFin);
    hasta.setHours(23, 59, 59, 999);

    this.dataFiltrada = this.dataOriginal.filter(item => {
      const texto = item["Marca temporal"];
      if (!texto) return false;
      const fecha = this.parseMarcaTemporal(texto);
      if (!fecha) return false;
      return fecha >= desde && fecha <= hasta;
    });
  }

  /** 🔹 Convierte la fecha del Google Sheet a Date */
  // private parseFecha(fechaStr: string): Date | null {
  //   if (!fechaStr) return null;
  //   const [dia, mes, anio] = fechaStr.split(' ')[0].split('/');
  //   if (!dia || !mes || !anio) return null;
  //   return new Date(+anio, +mes - 1, +dia);
  // }

  private parseMarcaTemporal(texto: string): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
    const m = texto.match(regex);
    if (!m) return null;

    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);

    let hour = m[4] ? parseInt(m[4], 10) : 0;
    const minute = m[5] ? parseInt(m[5], 10) : 0;
    const second = m[6] ? parseInt(m[6], 10) : 0;
    const ampm = m[7]?.toUpperCase() ?? null;

    if (ampm) {
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const d = new Date(year, month, day, hour, minute, second, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // totalContactabilidadContact() {
  //   const fechaSeleccionada = this.obtenerFechaSeleccionada();

  //   if (!fechaSeleccionada) {
  //     this.dataContactabilidad = [];
  //     return;
  //   }

  //   const { dia, mes, anio } = fechaSeleccionada;
  //   const resultado: any[] = [];

  //   this.asesores1.filter(a => a.value !== '').forEach(asesor => {
  //     const registrosAsesor = this.dataOriginal.filter(item => {
  //       return (
  //         item['ASESOR COBRANZA']?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim() &&
  //         this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
  //       );
  //     });

  //     const registrosContacto = registrosAsesor.filter(r => r['STATUS DE  GESTIÓN'] === 'CONTACTO');
  //     const contacto = registrosContacto.length;
  //     const noContacto = registrosAsesor.filter(r => r['STATUS DE  GESTIÓN'] === 'NO CONTACTO').length;
  //     const total = contacto + noContacto;
  //     const porcentaje = total > 0 ? (contacto / total) : 0;

  //     resultado.push({
  //       'ASESOR ID': asesor.value,
  //       'ASESOR CONTACT': asesor.viewValue,
  //       'CONTACTO': contacto,
  //       'NO CONTACTO': noContacto,
  //       'TOTAL': total,
  //       'PORCENTAJE': porcentaje
  //     });
  //   });

  //   this.dataContactabilidad = resultado;

  //   const sumaTotalContactos = resultado.reduce((acc, curr) => acc + (curr['CONTACTO'] || 0), 0);
  //   const sumaTotalGestion = resultado.reduce((acc, curr) => acc + (curr['TOTAL'] || 0), 0);

  //   this.porcentajeTotalContactabilidad = sumaTotalGestion > 0
  //     ? Math.round((sumaTotalContactos / sumaTotalGestion) * 100)
  //     : 0;
  // }

  // private obtenerFechaSeleccionada(): { dia: number; mes: number; anio: number } | null {
  //   const fecha: Date = this.formCobranzas.value.fechaGestion;
  //   if (!fecha) return null;

  //   return {
  //     dia: fecha.getDate(),
  //     mes: fecha.getMonth() + 1,
  //     anio: fecha.getFullYear()
  //   };
  // }

  // private esMismaFecha(marcaTemporal: string, dia: number, mes: number, anio: number): boolean {
  //   if (!marcaTemporal || !marcaTemporal.includes('/')) return false;

  //   const [diaStr, mesStr, anioStr] = marcaTemporal.split(' ')[0].split('/');
  //   const diaExcel = parseInt(diaStr, 10);
  //   const mesExcel = parseInt(mesStr, 10);
  //   const anioExcel = parseInt(anioStr, 10);

  //   return diaExcel === dia && mesExcel === mes && anioExcel === anio;
  // }

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataCobranzas", this.dataGrid);
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

  // onCellPrepared(e: any) {
  //   if (e.rowType === 'header') {
  //     e.cellElement.style.padding = '8px';
  //     e.cellElement.style.backgroundColor = '#293964';
  //     e.cellElement.style.color = 'white';
  //     e.cellElement.style.textAlign = 'center';
  //     e.cellElement.style.fontWeight = 'bold';
  //     e.cellElement.style.whiteSpace = 'normal';
  //     e.cellElement.style.height = 'auto';
  //     e.cellElement.style.border = '1.5px solid black';
  //   }

  //   if (e.rowType === 'data') {
  //     e.cellElement.style.border = '1px solid #ccc';
  //     e.cellElement.style.textAlign = 'center';
  //     e.cellElement.style.fontWeight = 'bold';

  //     if (e.column?.dataField === 'PORCENTAJE') {
  //       const valor = e.value * 100;
  //       if (valor > 85) {
  //         e.cellElement.style.backgroundColor = '#4CAF50';
  //         e.cellElement.style.color = 'black';
  //       } else if (valor >= 50 && valor <= 85) {
  //         e.cellElement.style.backgroundColor = '#FFEB3B';
  //         e.cellElement.style.color = 'black';
  //       } else if (valor < 50) {
  //         e.cellElement.style.backgroundColor = '#d68e3bff';
  //         e.cellElement.style.color = 'black';
  //       }
  //     }
  //   }
  // }
}
