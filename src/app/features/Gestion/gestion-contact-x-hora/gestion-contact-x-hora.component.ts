import { Component, inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../../services/service-google.service';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';

@Component({
  selector: 'app-gestion-contact-x-hora',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-contact-x-hora.component.html',
  styleUrl: './gestion-contact-x-hora.component.css'
})
export class GestionContactXHoraComponent implements OnInit {
  protected service = inject(SheetsService);

  formGestion: UntypedFormGroup;
  dataOriginal: any[] = [];
  listData: any[] = [];

  asesorCodigoMap: Record<string, string> = {
    'MORETO DELGADO PATRICIA ESTEFANY': 'CC1',
    'UCHOFEN VIGO FELICITA': 'CC3',
    'QUISPE FONSECA KAREN AIMEE': 'CC5',
    'MORALES ÑIQUE MARIA CANDELARIA': 'CC6',
    'ACOSTA JIMENEZ MARIELA NATALY': 'CC7',
    'CHANTA CAMPOS KELLY KARINTIA': 'CC8',
    'PÉREZ TINEO MARICIELO TATIANA': 'CC9'
  };

  rangosHora = [
    { label: '14:00 - 15:00', inicio: '14:00', fin: '15:00' },
    { label: '15:00 - 16:00', inicio: '15:00', fin: '16:00' },
    { label: '16:00 - 17:00', inicio: '16:00', fin: '17:00' },
    { label: '17:00 - 18:00', inicio: '17:00', fin: '18:00' },
    { label: '18:00 - 19:00', inicio: '18:00', fin: '19:00' },
    { label: '19:00 - 20:00', inicio: '19:00', fin: '20:00' },
    { label: '20:00 - 21:00', inicio: '20:00', fin: '21:00' }
  ];

  metaCliXHora = 10;

  constructor(private fb: UntypedFormBuilder) {
    const currentDate = new Date();

    this.formGestion = this.fb.group({
      fechaGestion: [currentDate],
      rangoHorario: [this.rangosHora[0]]
    });
  }

  async ngOnInit() {
    this.dataOriginal = await lastValueFrom(this.service.getSheetData());
  }

  async actualizar() {
    this.dataOriginal = await lastValueFrom(this.service.getSheetData());

    const fechaSeleccionada = this.formGestion.value.fechaGestion;
    const rangoSeleccionado = this.formGestion.value.rangoHorario;

    if (!fechaSeleccionada || !rangoSeleccionado) return;

    const fechaIso = new Date(fechaSeleccionada).toISOString().split('T')[0];
    this.procesarData(fechaIso, rangoSeleccionado.inicio, rangoSeleccionado.fin);
  }

  procesarData(fechaFiltro: string, horaInicioStr: string, horaFinStr: string) {
    const [hInicio, mInicio] = horaInicioStr.split(':').map(Number);
    const [hFin, mFin] = horaFinStr.split(':').map(Number);
    const inicioSegundos = hInicio * 3600 + mInicio * 60;
    const finSegundos = hFin * 3600 + mFin * 60;

    const dataFiltrada = this.dataOriginal.filter(item => {
      const fecha = this.parsearFechaLatina(item['Marca temporal']);
      const estado = item['ESTADO DE GESTIÓN']?.toUpperCase().trim();
      return (
        fecha &&
        fecha.toISOString().split('T')[0] === fechaFiltro &&
        (estado === 'CONTACTO' || estado === 'NO CONTACTO')
      );
    });

    const asesoresUnicos = Array.from(
      new Set(dataFiltrada.map(item => item['ASESOR CONTACT']).filter(Boolean))
    );

    this.listData = asesoresUnicos.map(nombre => {
      const idAsesor = this.asesorCodigoMap[nombre] || 'SIN_CODIGO';

      const llamadasPorHora = dataFiltrada.filter(item => {
        const fecha = this.parsearFechaLatina(item['Marca temporal']);
        const asesor = item['ASESOR CONTACT'];
        const estado = item['ESTADO DE GESTIÓN']?.toUpperCase().trim();
        if (!fecha || asesor !== nombre || (estado !== 'CONTACTO' && estado !== 'NO CONTACTO')) return false;

        const segundos = fecha.getHours() * 3600 + fecha.getMinutes() * 60 + fecha.getSeconds();
        return segundos >= inicioSegundos && segundos < finSegundos;
      });

      const contactos = llamadasPorHora.filter(item => item['ESTADO DE GESTIÓN']?.toUpperCase().trim() === 'CONTACTO');
      const noContactos = llamadasPorHora.filter(item => item['ESTADO DE GESTIÓN']?.toUpperCase().trim() === 'NO CONTACTO');

      const totalLlamadas = llamadasPorHora.length;

      return {
        ID: idAsesor,
        Asesor: nombre,
        Contactos: contactos.length,
        NoContactos: noContactos.length,
        TotalLlamadas: totalLlamadas,
        Meta: Math.min((totalLlamadas / this.metaCliXHora) * 100, 100)
      };
    });

    console.log('Resultado corregido:', this.listData);
  }


  parsearFechaLatina(fechaHoraStr: string): Date | null {
    if (!fechaHoraStr) return null;

    const partes = fechaHoraStr.trim().split(' ');
    if (partes.length !== 2) return null;

    const [fechaStr, horaStr] = partes;
    const [dia, mes, anio] = fechaStr.split('/').map(Number);
    const [hora, minuto, segundo = 0] = horaStr.split(':').map(Number);

    const fecha = new Date(anio, mes - 1, dia, hora, minuto, segundo);

    return isNaN(fecha.getTime()) ? null : fecha;
  }

  formatCumplimientoMeta = (rowData: any): string => {
    return rowData.Meta != null ? `${rowData.Meta.toFixed(0)} %` : '';
  };

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

    if (e.rowType === 'data') {
      e.cellElement.style.border = '1px solid #ccc';
      e.cellElement.style.textAlign = 'center';

      if (e.column.dataField === 'Meta') {
        const valor = e.data.Meta;
        if (valor >= 85) e.cellElement.style.backgroundColor = '#A5D6A7';
        else if (valor >= 50) e.cellElement.style.backgroundColor = '#FFF59D';
        else e.cellElement.style.backgroundColor = '#EF9A9A';

        e.cellElement.style.fontWeight = 'bold';
        e.cellElement.style.border = '1.5px solid black';
      }
    }
  }
}
