import { Component, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-ventas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.css'
})
export class VentasComponent implements OnInit {
  formVentas: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  popupVisibleAsesor: boolean = false;
  popupVisibleDia: boolean = false;
  popupVisibleNroVentas: boolean = false;
  popupVisibleVentasSemanal: boolean = false;

  semanas: string[] = [];
  semanaMap = new Map<string, string>();

  chartData: { AsesorVenta: string, MontoTotal: number }[] = [];
  chartPorDia: { Dia: string, MontoTotal: number }[] = [];

  chartNumeroVentasPorDia: VentasPorDia[] = [];
  semanasCantidad: string[] = [];

  chartMontoSemanal: any[] = [];
  seriesMeses: string[] = [];
  semanasMontoTotal: string[] = [];

  chartMontoMensual: { Mes: string; MontoTotal: number }[] = [];

  totalMontoVentas = 0;
  totalVentas = 0;
  ticket = 0;
  proyeccion = 0;

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

  constructor(private fb: UntypedFormBuilder) {
    this.formVentas = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: [''],
      NAS: [{ value: false, disabled: true }]
    });
  }

  async ngOnInit() { }

  importar(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook: XLSX.WorkBook = XLSX.read(data, { type: 'array' });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      this.dataVentas = jsonData.map((row: any) => ({
        IDVENTA: row['IDVENTA'],
        FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
        Sede: row['Sede'],
        MontoConsolidado: this.parseNumber(row['MontoConsolidado']),
        CuotaInicial: this.parseNumber(row['CuotaInicial']),
        Productos: row['Productos'],
        Cuotas: row['Cuotas'],
        DocIdentidad: row['DocIdentidad'],
        TipoVenta: row['TipoVenta'],
        TipoBase: row['TipoBase'],
        AsesorVenta: row['AsesorVenta'],
        EstadoVenta: row['EstadoVenta']
      }));

      this.filtroVentas = [...this.dataVentas];
      this.generarChartData();
    };

    reader.readAsArrayBuffer(file);
  }

  getFechaJS(excelDate: any): Date {
    if (typeof excelDate === 'number') {
      const utc_days = Math.floor(excelDate - 25569);
      const utc_value = utc_days * 86400 * 1000;
      const date_info = new Date(utc_value);
      return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate());
    }

    const parsed = new Date(excelDate);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  parseNumber(value: any): number {
    return typeof value === 'string'
      ? Number(value.replace(',', '').replace(/[^0-9.]/g, '')) || 0
      : value || 0;
  }

  onAsesorChanged(event: any) {
    // Solo actualiza la lógica si hay fechas válidas
    if (this.formVentas.valid) {
      this.aplicarFiltros();
    }
  }

  actualizarFiltros(): void {
    if (this.formVentas.valid) {
      // Activar checkbox NAS al hacer clic
      const nasControl = this.formVentas.get('NAS');
      if (nasControl?.disabled) {
        nasControl.enable();
      }
      this.aplicarFiltros();
    }
  }

  aplicarFiltros(): void {
    const selectedAsesor = (this.formVentas.value.Asesores || '').toString().trim().toUpperCase();
    const excluirNAS = this.formVentas.value.NAS === true;

    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    this.filtroVentas = this.dataVentas.filter(venta => {
      const fechaVenta = new Date(venta.FECHAVENTA);
      const cumpleFecha = fechaVenta >= fechaInicio && fechaVenta <= fechaFin;

      const asesor = (venta.AsesorVenta || '').toString().trim().toUpperCase();
      const cumpleAsesor = !selectedAsesor || asesor === selectedAsesor;
      const noEsNAS = !excluirNAS || asesor !== 'NAS';

      return cumpleFecha && cumpleAsesor && noEsNAS;
    });

    this.generarChartData();
    this.generarChartMontoPorDia();
    this.generarChartNroVentasPorDia();
    this.generarChartMontoSemanal();
    this.generarChartMontoMensual();

    const hoy = new Date();
    const diaHoy = hoy.getDate();
    const mesHoy = hoy.getMonth();
    const anioHoy = hoy.getFullYear();
    const diasMesActual = new Date(anioHoy, mesHoy + 1, 0).getDate();
    const diasTranscurridos = diaHoy - 1;

    this.totalVentas = this.filtroVentas.length;
    this.totalMontoVentas = Math.round(this.filtroVentas.reduce((sum, v) => sum + v.MontoConsolidado, 0));
    this.ticket = this.totalVentas ? Math.round(this.totalMontoVentas / this.totalVentas) : 0;
    const ticketDiario = diasTranscurridos > 0 ? this.totalMontoVentas / diasTranscurridos : 0;
    this.proyeccion = Math.round(ticketDiario * diasMesActual);
  }

  generarChartData(): void {
    const excluirNAS = this.formVentas.value.NAS === true;
    const agrupado = new Map<string, number>();

    for (const venta of this.filtroVentas) {
      const asesor = (venta.AsesorVenta || '').toString().trim();
      const asesorUpper = asesor.toUpperCase();

      if (excluirNAS && asesorUpper === 'NAS') continue;

      const monto = Math.round(venta.MontoConsolidado || 0);

      if (agrupado.has(asesor)) {
        agrupado.set(asesor, agrupado.get(asesor)! + monto);
      } else {
        agrupado.set(asesor, monto);
      }
    }

    this.chartData = Array.from(agrupado, ([id, MontoTotal]) => {
      const asesor = this.asesores.find(a => a.value === id);
      const AsesorVenta = asesor ? asesor.viewValue : id;
      return { AsesorVenta, MontoTotal: Math.round(MontoTotal) };
    }).sort((a, b) => b.MontoTotal - a.MontoTotal);
  }

  generarChartMontoPorDia(): void {
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const agrupado = new Map<string, Map<string, number>>();
    const semanasSet = new Set<string>();

    for (const venta of this.filtroVentas) {
      const fecha = new Date(venta.FECHAVENTA);
      const diaTexto = diasSemana[fecha.getDay()];
      const semanaIso = this.getSemanaISO(fecha);
      const monto = venta.MontoConsolidado || 0;

      semanasSet.add(semanaIso);

      if (!agrupado.has(diaTexto)) {
        agrupado.set(diaTexto, new Map());
      }

      const semanaMap = agrupado.get(diaTexto)!;
      semanaMap.set(semanaIso, Math.round((semanaMap.get(semanaIso) || 0) + monto));
    }

    // Ordenar semanas y generar alias: Semana 1, Semana 2, ...
    const semanasOrdenadas = Array.from(semanasSet).sort();
    this.semanas = semanasOrdenadas.map((semanaIso, index) => {
      const nombre = `Semana ${index + 1}`;
      this.semanaMap.set(semanaIso, nombre);
      return nombre;
    });

    // Construir chartPorDia con nombres amigables
    this.chartPorDia = diasSemana.map(dia => {
      const semanaMap = agrupado.get(dia) || new Map();
      const result: any = { Dia: dia };

      for (const [semanaIso, monto] of semanaMap.entries()) {
        const semanaNombre = this.semanaMap.get(semanaIso);
        if (monto !== undefined && monto !== 0 && semanaNombre) {
          result[semanaNombre] = monto;
        }
      }

      return result;
    });
  }

  // generarChartNroVentasPorDia(): void {
  //   const diasSemanaBase = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  //   const fechaInicio = new Date(this.formVentas.value.fechaInicio);
  //   const primerDiaMes = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
  //   const diaInicial = primerDiaMes.getDay(); // 0 (Domingo) a 6 (Sábado)

  //   // Reordenar días para empezar desde el primer día del mes
  //   const diasSemana = [...diasSemanaBase.slice(diaInicial), ...diasSemanaBase.slice(0, diaInicial)];

  //   const agrupado = new Map<string, Map<string, number>>();
  //   const semanasSet = new Set<string>();

  //   for (const venta of this.filtroVentas) {
  //     if (!venta.MontoConsolidado || venta.MontoConsolidado <= 0) continue;

  //     const fecha = new Date(venta.FECHAVENTA);
  //     const diaTexto = diasSemanaBase[fecha.getDay()]; // Usamos el base para agrupar
  //     const semanaIso = this.getSemanaISO(fecha);

  //     semanasSet.add(semanaIso);

  //     if (!agrupado.has(diaTexto)) {
  //       agrupado.set(diaTexto, new Map());
  //     }

  //     const semanaMap = agrupado.get(diaTexto)!;
  //     semanaMap.set(semanaIso, (semanaMap.get(semanaIso) || 0) + 1);
  //   }

  //   const semanasOrdenadas = Array.from(semanasSet).sort();

  //   this.semanasCantidad = semanasOrdenadas.map((semanaIso, index) => {
  //     const nombre = `Semana ${index + 1}`;
  //     this.semanaMap.set(semanaIso, nombre);
  //     return nombre;
  //   });

  //   this.chartNumeroVentasPorDia = diasSemana.map(dia => {
  //     const semanaMap = agrupado.get(dia) || new Map();
  //     const result: any = { Dia: dia };

  //     for (const [semanaIso, cantidad] of semanaMap.entries()) {
  //       const semanaNombre = this.semanaMap.get(semanaIso);
  //       if (semanaNombre) {
  //         result[semanaNombre] = cantidad;
  //       }
  //     }

  //     return result;
  //   });
  // }

  generarChartNroVentasPorDia(): void {
    const diasSemanaBase = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sabado'];
    const semanasMap = new Map<number, Map<string, number>>();
    const semanasSet = new Set<number>();

    for (const venta of this.filtroVentas) {
      if (!venta.MontoConsolidado || venta.MontoConsolidado <= 0) continue;

      const fecha = new Date(venta.FECHAVENTA);
      const semana = this.getSemanaDelMes(fecha); // Semana 1, 2, etc.
      const diaTexto = diasSemanaBase[fecha.getDay()];

      semanasSet.add(semana);

      if (!semanasMap.has(semana)) {
        semanasMap.set(semana, new Map<string, number>());
      }

      const conteoSemana = semanasMap.get(semana)!;
      conteoSemana.set(diaTexto, (conteoSemana.get(diaTexto) || 0) + 1);
    }

    // Mapear: Semana 1 -> "Semana 1", etc.
    const semanasOrdenadas = Array.from(semanasSet).sort((a, b) => a - b);
    this.semanas = semanasOrdenadas.map(n => `Semana ${n}`);

    // Estructura final para dx-chart
    this.chartNumeroVentasPorDia = diasSemanaBase.map(dia => {
      const fila: any = { Dia: dia };
      for (const semana of semanasOrdenadas) {
        const nombre = `Semana ${semana}`;
        const valor = semanasMap.get(semana)?.get(dia) || 0;
        fila[nombre] = valor;
      }
      return fila;
    });
  }

  generarChartMontoSemanal(): void {
    const datosPorMesSemana = new Map<string, Map<string, number>>();
    const semanasSet = new Set<string>();
    const mesesSet = new Set<string>();

    for (const venta of this.filtroVentas) {
      if (!venta.MontoConsolidado || venta.MontoConsolidado <= 0) continue;

      const fecha = new Date(venta.FECHAVENTA);
      const anio = fecha.getFullYear();
      const mes = fecha.getMonth() + 1;
      const nombreMes = `${this.getNombreMes(mes)} ${anio}`;
      const semana = `Semana ${this.getSemanaDelMes(fecha)}`;

      semanasSet.add(semana);
      mesesSet.add(nombreMes);

      if (!datosPorMesSemana.has(semana)) {
        datosPorMesSemana.set(semana, new Map());
      }

      const mapMes = datosPorMesSemana.get(semana)!;
      mapMes.set(nombreMes, Math.round((mapMes.get(nombreMes) || 0) + venta.MontoConsolidado));
    }

    const semanasOrdenadas = Array.from(semanasSet).sort((a, b) => {
      return +a.split(' ')[1] - +b.split(' ')[1];
    });

    const mesesOrdenados = Array.from(mesesSet);

    this.chartMontoSemanal = semanasOrdenadas.map(semana => {
      const fila: any = { Semana: semana };
      const mapMes = datosPorMesSemana.get(semana)!;
      for (const mes of mesesOrdenados) {
        fila[mes] = mapMes.get(mes) || 0;
      }
      return fila;
    });

    this.seriesMeses = mesesOrdenados;
  }

  generarChartMontoMensual(): void {
    const agrupado = new Map<string, number>();
    const mesesSet = new Set<string>();

    for (const venta of this.filtroVentas) {
      if (!venta.MontoConsolidado || venta.MontoConsolidado <= 0) continue;

      const fecha = new Date(venta.FECHAVENTA);
      const claveMes = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`; // Ej: "2025-07"
      mesesSet.add(claveMes);

      agrupado.set(
        claveMes,
        (agrupado.get(claveMes) || 0) + venta.MontoConsolidado
      );
    }

    const mesesOrdenados = Array.from(mesesSet).sort();

    this.chartMontoMensual = mesesOrdenados.map(claveMes => {
      const [anio, mes] = claveMes.split('-');
      const nombreMes = this.getNombreMes(+mes) + ' ' + anio;
      return {
        Mes: nombreMes,
        MontoTotal: agrupado.get(claveMes) || 0
      };
    });
  }

  getNombreMes(mes: number): string {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[mes - 1] || '';
  }

  getSemanaDelMes(date: Date): number {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    const adjustedDay = dayOfMonth + firstDay.getDay(); // para considerar inicio en lunes/domingo
    return Math.ceil(adjustedDay / 7);
  }

  getSemanaISO(date: Date): string {
    const tmp = new Date(date.getTime());
    tmp.setHours(0, 0, 0, 0);

    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));

    const firstThursday = new Date(tmp.getFullYear(), 0, 4);
    firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));

    const weekNumber = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);

    return `${tmp.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  }


  filtrarNAS(): void {
    if (this.formVentas.valid) {
      this.aplicarFiltros();
    }
  }

  abrirPopup(tipo: 'asesor' | 'dia' | 'nroVentas' | 'ventasSemanal') {
    if (tipo === 'asesor') {
      this.popupVisibleAsesor = true;
    } else if (tipo === 'dia') {
      this.popupVisibleDia = true;
    } else if (tipo === 'nroVentas') {
      this.popupVisibleNroVentas = true;
    } else if (tipo === 'ventasSemanal') {
      this.popupVisibleVentasSemanal = true;
    }
  }

  customizeTooltip = (info: any): any => {
    if (info.points?.length) {
      let html = `<b>${info.argumentText}</b><br/>`;

      info.points.forEach((point: any) => {
        html += `
        <span style="color:${point.color}">\u25A0</span>
        ${point.seriesName}: <b>${Math.round(point.originalValue).toLocaleString('es-PE')}</b><br/>
      `;
      });

      return { html };
    }

    return {
      text: `${info.seriesName}: ${info.valueText}`
    };
  };

  customizeMontoTexto = (pointInfo: any): string => {
    if (pointInfo.value === 0) return ''; // Oculta ceros
    return `S/ ${Math.round(pointInfo.value).toLocaleString('es-PE')}`;
  };

  onCellPrepared(e: any) {
    if (e.rowType != 'header' || e.cellElement.classList.contains('dx-editor-cell')) return;
    e.cellElement.style.padding = "8px";
    e.cellElement.style.backgroundColor = "#293964";
    e.cellElement.style.color = "white";
    e.cellElement.style.textAlign = "center";
    e.cellElement.style.fontWeight = "bold !important";
    e.cellElement.style.textWrap = "wrap !important";
    e.cellElement.style.height = "auto !important";
    e.cellElement.style.borderWidth = "1.5px !important";
    e.cellElement.style.borderColor = "black !important";
  }
}

interface VentasPorDia {
  Dia: string;
  [semana: string]: number | string;
}

interface DatoSerie {
  [semana: string]: number;
}

interface SerieMes {
  name: string; // ej: "Febrero"
  series: { Semana: string; MontoTotal: number }[];
}