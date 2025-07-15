import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SheetsService } from '../../services/service-google.service';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-analisis-gestion-mensual',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './analisis-gestion-mensual.component.html',
  styleUrl: './analisis-gestion-mensual.component.css'
})
export class AnalisisGestionMensualComponent implements OnInit {
  protected service = inject(SheetsService);

  formAnalisis: UntypedFormGroup;
  dataOriginal: any[] = [];
  dataGestion: any[] = [];

  asignados: number = 7565;
  gestionados: number = 0;
  contactados: number = 0;
  interesados: number = 0;
  derivados: number = 0;
  ventas: number = 64;

  asesores = [
    { value: 'CC1', viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    { value: 'CC3', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'CC5', viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6', viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC7', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'CC8', viewValue: 'CHANTA CAMPOS KELLY KARINTIA' },
    { value: 'CC9', viewValue: 'PÉREZ TINEO MARICIELO TATIANA' }
  ];

  constructor(private fb: UntypedFormBuilder) {
    const currentDate = new Date();
    const previousMonthDate = new Date();
    previousMonthDate.setMonth(currentDate.getMonth() - 1);
    this.formAnalisis = this.fb.group({
      fechaInicio: [previousMonthDate],
      fechaFin: [currentDate],
      Asesores: ['']
    });
  }

  async ngOnInit() {
    this.dataOriginal = await lastValueFrom(this.service.getSheetData());

    this.formAnalisis.get('Asesores')?.valueChanges.subscribe(() => {
      this.actualizar();
    });
  }

  getNombreAsesorSeleccionado(): string {
    const codigoAsesor = this.formAnalisis.get('Asesores')?.value;
    const asesor = this.asesores.find(a => a.value === codigoAsesor);
    return asesor?.viewValue || '';
  }

  private parseFechaMarcaTemporal(marcaTemporal: any): Date | null {
    if (!marcaTemporal) return null;

    if (typeof marcaTemporal === 'string') {
      const soloFechaStr = marcaTemporal.split(' ')[0];
      const partes = soloFechaStr.split('/');
      if (partes.length !== 3) return null;

      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1;
      const anio = parseInt(partes[2], 10);
      const fecha = new Date(anio, mes, dia);
      return isNaN(fecha.getTime()) ? null : fecha;
    }

    if (marcaTemporal instanceof Date) {
      return new Date(marcaTemporal);
    }

    return null;
  }

  private filtrarPorFechaYRango(
    item: any,
    fechaInicio: Date,
    fechaFin: Date,
    asesorSeleccionado: string
  ): boolean {
    const fechaItem = this.parseFechaMarcaTemporal(item['Marca temporal']);
    const asesor = item['ASESOR CONTACT']?.toString().trim();

    if (!fechaItem) return false;

    fechaItem.setHours(0, 0, 0, 0);
    const dentroDeRango = fechaItem >= fechaInicio && fechaItem <= fechaFin;
    const coincideAsesor = asesorSeleccionado ? asesor === asesorSeleccionado : true;

    return dentroDeRango && coincideAsesor;
  }

  getGestionados() {
    const fechaInicio = new Date(this.formAnalisis.get('fechaInicio')?.value);
    const fechaFin = new Date(this.formAnalisis.get('fechaFin')?.value);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const asesorSeleccionado = this.getNombreAsesorSeleccionado();

    this.gestionados = this.dataOriginal.filter(item =>
      this.filtrarPorFechaYRango(item, fechaInicio, fechaFin, asesorSeleccionado)
    ).length;
  }

  getContactados() {
    const fechaInicio = new Date(this.formAnalisis.get('fechaInicio')?.value);
    const fechaFin = new Date(this.formAnalisis.get('fechaFin')?.value);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const asesorSeleccionado = this.getNombreAsesorSeleccionado();

    this.contactados = this.dataOriginal.filter(item => {
      const estadoGestion = item['ESTADO DE GESTIÓN']?.toString().trim().toUpperCase();
      return this.filtrarPorFechaYRango(item, fechaInicio, fechaFin, asesorSeleccionado)
        && estadoGestion === 'CONTACTO';
    }).length;
  }

  getInteresados() {
    const fechaInicio = new Date(this.formAnalisis.get('fechaInicio')?.value);
    const fechaFin = new Date(this.formAnalisis.get('fechaFin')?.value);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const asesorSeleccionado = this.getNombreAsesorSeleccionado();

    this.interesados = this.dataOriginal.filter(item => {
      const resultadoGestion = item['RESULTADO DE GESTIÓN']?.toString().trim().toUpperCase();
      return this.filtrarPorFechaYRango(item, fechaInicio, fechaFin, asesorSeleccionado)
        && resultadoGestion === 'INTERESADO';
    }).length;
  }

  getDerivados() {
    const fechaInicio = new Date(this.formAnalisis.get('fechaInicio')?.value);
    const fechaFin = new Date(this.formAnalisis.get('fechaFin')?.value);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const asesorSeleccionado = this.getNombreAsesorSeleccionado();

    this.derivados = this.dataOriginal.filter(item => {
      const motivoInteres = item['MOTIVO INTERÉS']?.toString().trim().toUpperCase();
      const esMotivoValido =
        motivoInteres === 'VENTA DERIVADA PARA CIERRE A SEDE' ||
        motivoInteres === 'VISITARÁ TIENDA' ||
        motivoInteres === 'SE ENVIÓ A ASESOR VISITA A DOMICILIO';

      return this.filtrarPorFechaYRango(item, fechaInicio, fechaFin, asesorSeleccionado)
        && esMotivoValido;
    }).length;
  }

  cargarDatos() {
    this.dataGestion = [{
      ASIGNADOS: this.asignados,
      GESTIONADOS: this.gestionados,
      CONTACTADOS: this.contactados,
      INTERESADOS: this.interesados,
      DERIVADOS: this.derivados,
      VENTAS: this.ventas
    }];
  }

  actualizar() {
    this.getGestionados();
    this.getContactados();
    this.getInteresados();
    this.getDerivados();
    this.cargarDatos();
  }

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
