import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';

@Component({
  selector: 'app-cierre-gestion',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './cierre-gestion.component.html',
  styleUrl: './cierre-gestion.component.css'
})
export class CierreGestionComponent implements OnInit {
  protected service = inject(SheetsService);

  formCierreGestion: UntypedFormGroup;

  dataOriginal: any[] = [];
  dataContactabilidad: any[] = [];
  dataAgendamientos: any[] = [];
  dataDerivaciones: any[] = [];

  agendamientoIndividual = 15;
  derivacionesIndividual = 2;
  metaDerivacionEquipo = 12;
  metaAgendamientoEquipo = 90;

  porcentajeMetaAgendamiento = 0;
  porcentajeMetaDerivacion = 0;
  porcentajeTotalContactabilidad = 0;

  dataGrafico: any[] = [];
  totalContactados = 0;
  totalInteresados = 0;
  totalDerivaciones = 0;

  asesores = [
    'MORETO DELGADO PATRICIA ESTEFANY',
    'UCHOFEN VIGO FELICITA',
    'QUISPE FONSECA KAREN AIMEE',
    'MORALES ÑIQUE MARIA CANDELARIA',
    'ACOSTA JIMENEZ MARIELA NATALY',
    'CHANTA CAMPOS KELLY KARINTIA',
    'PÉREZ TINEO MARICIELO TATIANA'
  ];

  isLoading = false;

  constructor(private fb: UntypedFormBuilder) {
    const currentDate = new Date();
    this.formCierreGestion = this.fb.group({
      fechaGestion: [currentDate]
    });
  }

  async ngOnInit() {
    this.dataOriginal = await lastValueFrom(this.service.getSheetData());
  }

  // 🔹 Método para obtener fecha seleccionada en formato numérico
  private obtenerFechaSeleccionada(): { dia: number; mes: number; anio: number } | null {
    const fecha: Date = this.formCierreGestion.value.fechaGestion;
    if (!fecha) return null;

    return {
      dia: fecha.getDate(),
      mes: fecha.getMonth() + 1,
      anio: fecha.getFullYear()
    };
  }

  // 🔹 Método reutilizable para comparar fechas
  private esMismaFecha(marcaTemporal: string, dia: number, mes: number, anio: number): boolean {
    if (!marcaTemporal || !marcaTemporal.includes('/')) return false;

    const [diaStr, mesStr, anioStr] = marcaTemporal.split(' ')[0].split('/');
    const diaExcel = parseInt(diaStr, 10);
    const mesExcel = parseInt(mesStr, 10);
    const anioExcel = parseInt(anioStr, 10);

    return (
      diaExcel === dia &&
      mesExcel === mes &&
      anioExcel === anio
    );
  }

  totalContactabilidadContact() {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();

    if (!fechaSeleccionada) {
      this.dataContactabilidad = [];
      return;
    }

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    this.asesores.forEach(asesor => {
      const registrosAsesor = this.dataOriginal.filter(item => {
        return (
          item['ASESOR CONTACT']?.toUpperCase().trim() === asesor &&
          this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
        );
      });

      const contacto = registrosAsesor.filter(r => r['ESTADO DE GESTIÓN'] === 'CONTACTO').length;
      const noContacto = registrosAsesor.filter(r => r['ESTADO DE GESTIÓN'] === 'NO CONTACTO').length;
      const total = contacto + noContacto;
      // const porcentaje = total > 0 ? Math.round((contacto / total) * 100) : 0;
      const porcentaje = total > 0 ? (contacto / total) : 0;

      resultado.push({
        'ASESOR CONTACT': asesor,
        'CONTACTO': contacto,
        'NO CONTACTO': noContacto,
        'TOTAL': total,
        'PORCENTAJE': porcentaje
      });
    });

    this.dataContactabilidad = resultado;

    const sumaTotalContactos = resultado.reduce((acc, curr) => acc + (curr['CONTACTO'] || 0), 0);
    const sumaTotalGestion = resultado.reduce((acc, curr) => acc + (curr['TOTAL'] || 0), 0);

    this.porcentajeTotalContactabilidad = Math.round((sumaTotalContactos / sumaTotalGestion) * 100);
  }

  totalAgendamientosContact() {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();

    if (!fechaSeleccionada) {
      this.dataAgendamientos = [];
      return;
    }

    const { dia, mes, anio } = fechaSeleccionada;

    const resultado: any[] = [];

    this.asesores.forEach(asesor => {
      const registrosAsesor = this.dataOriginal.filter(item => {
        return (
          item['ASESOR CONTACT']?.toUpperCase().trim() === asesor &&
          this.esMismaFecha(item['Marca temporal'], dia, mes, anio) &&
          item['MOTIVO INTERÉS'] === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)'
        );
      });

      const totalAgendamientos = registrosAsesor.length;
      const porcentajeMeta = this.agendamientoIndividual > 0
        ? Math.min((totalAgendamientos / this.agendamientoIndividual), 1)
        : 0;

      resultado.push({
        'ASESOR CONTACT': asesor,
        'AGENDAMIENTO': totalAgendamientos,
        'META': porcentajeMeta
      });
    });

    this.dataAgendamientos = resultado;

    const totalAgendamientos = this.dataAgendamientos.reduce((acc, item) => acc + (item.AGENDAMIENTO || 0), 0);
    this.porcentajeMetaAgendamiento = Math.min(Math.round((totalAgendamientos / this.metaAgendamientoEquipo) * 100), 100);
  }

  totalDerivacionesContact() {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();

    if (!fechaSeleccionada) {
      this.dataDerivaciones = [];
      return;
    }

    const { dia, mes, anio } = fechaSeleccionada;

    const motivosValidos = [
      'VENTA DERIVADA PARA CIERRE A SEDE',
      'VISITARÁ TIENDA',
      'SE ENVIÓ A ASESOR VISITA A DOMICILIO'
    ];

    const resultado: any[] = [];

    this.asesores.forEach(asesor => {
      const registrosAsesor = this.dataOriginal.filter(item => {
        const esAsesor = item['ASESOR CONTACT']?.toUpperCase().trim() === asesor;
        const esFecha = this.esMismaFecha(item['Marca temporal'], dia, mes, anio);
        const esMotivoValido = motivosValidos.includes(item['MOTIVO INTERÉS']);

        return esAsesor && esFecha && esMotivoValido;
      });

      const totalDerivaciones = registrosAsesor.length;
      let porcentajeMeta = this.derivacionesIndividual > 0
        ? Math.min((totalDerivaciones / this.derivacionesIndividual), 1)
        : 0;

      resultado.push({
        'ASESOR CONTACT': asesor,
        'DERIVACION': totalDerivaciones,
        'META': porcentajeMeta
      });
    });

    this.dataDerivaciones = resultado;

    const totalDerivaciones = this.dataDerivaciones.reduce((acc, item) => acc + (item.DERIVACION || 0), 0);
    this.porcentajeMetaDerivacion = this.metaDerivacionEquipo > 0
      ? Math.min(Math.round((totalDerivaciones / this.metaDerivacionEquipo) * 100), 100)
      : 0;
  }

  graficoData() {
    this.totalContactados = this.dataContactabilidad.reduce((acc, val) => acc + (val.CONTACTO || 0), 0);
    const totalAgendamientos = this.dataAgendamientos.reduce((acc, val) => acc + (val.AGENDAMIENTO || 0), 0);
    const totalDerivaciones = this.dataDerivaciones.reduce((acc, val) => acc + (val.DERIVACION || 0), 0);

    this.totalInteresados = totalAgendamientos + totalDerivaciones;
    this.totalDerivaciones = totalDerivaciones;

    this.dataGrafico = [
      { categoria: 'CONTACTADOS', valor: this.totalContactados, color: '#76d945' },
      { categoria: 'INTERESADOS', valor: this.totalInteresados, color: '#c6ce00' },
      { categoria: 'DERIVADOS', valor: this.totalDerivaciones, color: '#734222' }
    ];
  }

  onChartInit(e: any) {
    const chartInstance = e.component;

    chartInstance.option('customizePoint', function (pointInfo: any) {
      return {
        color: pointInfo.data.color
      };
    });

    chartInstance.refresh(); // aplicar los cambios
  }

  get tituloGrafico(): string {
    const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const fechaSelecionada = this.formCierreGestion.controls['fechaGestion'].value;
    const fechaFormateada = fechaSelecionada.toLocaleDateString('es-ES', opciones);
    return `GESTIÓN DIARIA CONTACT CENTER LEONCITO - ${fechaFormateada}`;
  }

  async actualizar() {
    this.isLoading = true;

    try {
      // 🔄 Volver a obtener los datos desde Google Sheets
      this.dataOriginal = await lastValueFrom(this.service.getSheetData());

      // Luego procesar los nuevos datos
      this.totalContactabilidadContact();
      this.totalAgendamientosContact();
      this.totalDerivacionesContact();
      this.graficoData();
    } catch (error) {
      console.error('Error al actualizar datos:', error);
    } finally {
      this.isLoading = false;
    }
  }

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
          e.cellElement.style.backgroundColor = '#A0522D'; // marrón
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
        e.cellElement.style.backgroundColor = '#A0522D';
        e.cellElement.style.color = 'black';
      }
    }
  }

}
