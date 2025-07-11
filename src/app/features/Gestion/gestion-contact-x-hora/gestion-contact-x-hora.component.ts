import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../../services/service-google.service';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { DxDataGridComponent } from 'devextreme-angular';

@Component({
  selector: 'app-gestion-contact-x-hora',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-contact-x-hora.component.html',
  styleUrl: './gestion-contact-x-hora.component.css'
})
export class GestionContactXHoraComponent implements OnInit {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  formGestion: UntypedFormGroup;
  dataFiltrada: any[] = [];
  listData: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  asesores = [
    { value: '', viewValue: 'Seleccione Asesor' },
    { value: 'CC1', viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    { value: 'CC3', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'CC5', viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6', viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC7', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'CC8', viewValue: 'CHANTA CAMPOS KELLY KARINTIA' },
    { value: 'CC9', viewValue: 'PÉREZ TINEO MARICIELO TATIANA' }
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    // const currentDate = new Date();

    this.formGestion = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: ['']
    });
  }

  async ngOnInit() {
    this.listData = await lastValueFrom(this.service.getSheetData());
    this.dataFiltrada = [...this.listData];
  }

  filtrarPorFecha() {
    const fechaInicio = this.formGestion.value.fechaInicio;
    const fechaFin = this.formGestion.value.fechaFin;

    if (!fechaInicio || !fechaFin) {
      this.dataFiltrada = [...this.listData];
      return;
    }

    const desde = new Date(fechaInicio);
    desde.setHours(0, 0, 0, 0);

    const hasta = new Date(fechaFin);
    hasta.setHours(23, 59, 59, 999);

    this.dataFiltrada = this.listData.filter(item => {
      const texto = item["Marca temporal"]; // ejemplo: "3/02/2025 16:51:28"
      if (!texto) return false;

      // convertir correctamente la fecha
      const partes = texto.split(/[/\s:]/); // [3, 02, 2025, 16, 51, 28]
      const fecha = new Date(+partes[2], +partes[1] - 1, +partes[0]); // solo fecha

      return fecha >= desde && fecha <= hasta;
    });
  }

  onAsesorChanged(event: any): void {
    const selectedValue = event.value;

    if (!selectedValue) {
      // Si no hay asesor seleccionado, mostrar los datos ya filtrados por fecha
      this.filtrarPorFecha();
      return;
    }

    // Buscar el nombre completo del asesor
    const asesorSeleccionado = this.asesores.find(a => a.value === selectedValue)?.viewValue?.toString().trim().toUpperCase();

    // Aplicar filtro por asesor sobre los datos ya filtrados por fecha
    this.dataFiltrada = this.dataFiltrada.filter(item => {
      const asesorEnDato = (item['ASESOR CONTACT'] || '').toString().trim().toUpperCase();
      return asesorEnDato === asesorSeleccionado;
    });
  }


  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataTipoReportes", this.dataGrid);
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
}
