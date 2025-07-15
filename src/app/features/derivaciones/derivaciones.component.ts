import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SheetsService } from '../../services/service-google.service';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-derivaciones',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './derivaciones.component.html',
  styleUrl: './derivaciones.component.css'
})
export class DerivacionesComponent implements OnInit {
  protected service = inject(SheetsService);

  formDerivaciones: UntypedFormGroup;
  datosFiltrados: any[] = [];
  datosOriginales: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  isLoading = false;

  constructor(private fb: UntypedFormBuilder) {
    const currentDate = new Date();
    this.formDerivaciones = this.fb.group({
      fechaGestion: [currentDate]
    });
  }

  async ngOnInit() {
    this.cargasIniciales();
  }

  async cargasIniciales() {
    this.datosOriginales = await lastValueFrom(this.service.getSheetData());
    console.log('Encabezados:', Object.keys(this.datosOriginales[0]));
  }

  private parseFecha(fechaStr: string): Date | null {
    if (!fechaStr || typeof fechaStr !== 'string') return null;

    const partes = fechaStr.split('/');
    if (partes.length !== 3) return null;

    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const anio = parseInt(partes[2].slice(0, 4), 10); // por si trae hora

    const fecha = new Date(anio, mes, dia);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  async actualizar() {
    this.isLoading = true;

    try {
      this.datosOriginales = await lastValueFrom(this.service.getSheetData());

      const fechaSeleccionada: Date = new Date(this.formDerivaciones.value.fechaGestion);
      fechaSeleccionada.setHours(0, 0, 0, 0);

      const motivosPermitidos = [
        'SE ENVIÓ A ASESOR VISITA A DOMICILIO',
        'VENTA DERIVADA PARA CIERRE A SEDE',
        'VISITARÁ TIENDA'
      ];

      this.datosFiltrados = this.datosOriginales.filter((d: any) => {
        const fechaInteresStr = d['FECHA DE INTERÉS'];
        const motivo = d['MOTIVO INTERÉS']?.toString().trim();

        const fechaInteres = this.parseFecha(fechaInteresStr);
        if (!fechaInteres || !motivo) return false;

        fechaInteres.setHours(0, 0, 0, 0);

        const mismaFecha = fechaInteres.getTime() === fechaSeleccionada.getTime();
        const motivoValido = motivosPermitidos.includes(motivo.toUpperCase());

        return mismaFecha && motivoValido;
      });

      console.log('Fecha seleccionada:', fechaSeleccionada.toLocaleDateString('es-PE'));
      console.log('Filtrados:', this.datosFiltrados);
    } catch (error) {
      console.error('Error al actualizar datos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  soloFecha = (d: any) => {
    return d['Marca temporal']?.split(' ')[0] ?? '';
  };

  getComentarioAdicionalUnido = (d: any): string => {
    return Object.keys(d)
      .filter(key => key.toUpperCase().startsWith('COMENTARIO ADICIONAL'))
      .map(key => d[key])
      .filter(valor => valor && valor.trim() !== '')
      .join(' | ');
  };

  onCellPrepared(e: any) {
    if (e.rowType !== 'header' || e.cellElement.classList.contains('dx-editor-cell')) return;

    e.cellElement.style.padding = "8px";
    e.cellElement.style.backgroundColor = "#293964";
    e.cellElement.style.color = "white";
    e.cellElement.style.textAlign = "center";
    e.cellElement.style.fontWeight = "bold";
    e.cellElement.style.textWrap = "wrap";
    e.cellElement.style.height = "auto";
    e.cellElement.style.borderWidth = "1.5px";
    e.cellElement.style.borderColor = "black";
  }
}
