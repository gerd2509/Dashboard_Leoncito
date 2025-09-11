import { Component, inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { SheetsService } from '../../services/service-google.service';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-gestion-cobranzas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-cobranzas.component.html',
  styleUrl: './gestion-cobranzas.component.css'
})
export class GestionCobranzasComponent implements OnInit {
  protected service = inject(SheetsService);

  formCobranzas: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  dataOriginal: any[] = [];
  dataContactabilidad: any[] = [];

  porcentajeTotalContactabilidad = 0;

  isLoading = false;

  constructor(private fb: UntypedFormBuilder) {
    const currentDate = new Date();
    this.formCobranzas = this.fb.group({
      fechaGestion: [currentDate]
    });
  }

  async ngOnInit() {
    this.dataOriginal = await lastValueFrom(this.service.getSheetData());
    console.log('Datos originales cargados:', this.dataOriginal);
  }

  async actualizar() { }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.whiteSpace = 'normal';
      e.cellElement.style.height = 'auto';
      e.cellElement.style.border = '1.5px solid black';
    }

    if (e.rowType === 'data') {
      e.cellElement.style.border = '1px solid #ccc';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';

      if (e.column?.dataField === 'PORCENTAJE') {
        const valor = e.value * 100
        if (valor > 85) {
          e.cellElement.style.backgroundColor = '#4CAF50'; // verde
          e.cellElement.style.color = 'black';
        } else if (valor >= 50 && valor <= 85) {
          e.cellElement.style.backgroundColor = '#FFEB3B'; // amarillo
          e.cellElement.style.color = 'black';
        } else if (valor < 50) {
          e.cellElement.style.backgroundColor = '#d68e3bff'; // marrón
          e.cellElement.style.color = 'black';
        }
      }
    }

    if (e.column?.dataField === 'META') {
      const valor = e.value * 100;
      if (valor > 85) {
        e.cellElement.style.backgroundColor = '#4CAF50';
        e.cellElement.style.color = 'black';
      } else if (valor >= 50 && valor <= 85) {
        e.cellElement.style.backgroundColor = '#FFEB3B';
        e.cellElement.style.color = 'black';
      } else if (valor < 50) {
        e.cellElement.style.backgroundColor = '#d68e3bff';
        e.cellElement.style.color = 'black';
      }
    }
  }
}
