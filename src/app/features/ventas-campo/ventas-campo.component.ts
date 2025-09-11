import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { ExcelExportService } from '../../services/excel/excel.service';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-ventas-campo',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './ventas-campo.component.html',
  styleUrl: './ventas-campo.component.css'
})
export class VentasCampoComponent implements OnInit {
  protected excelService = inject(ExcelExportService);

  formVentas: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  popupVisibleAsesor: boolean = false;
  popupVisibleDia: boolean = false;
  popupVisibleNroVentas: boolean = false;
  popupVisibleVentasSemanal: boolean = false;
  popupVisibleVentasPorMes: boolean = false;

  totalMontoVentas = 0;
  totalVentas = 0;
  ticket = 0;
  proyeccion = 0;

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

  ventasPorDiaMesActual: any[] = [];
  columnasDiasMes: string[] = [];

  operacionesPorDiaMesActual: any[] = [];

  asesores = [
    { value: '', viewValue: 'SELECCIONE ASESOR' },
    { value: 'AV1', viewValue: 'MONTALVO LUYO ERNESTO ADOLFO' },
    { value: 'AV2', viewValue: 'NAVARRO CASTAÑEDA MARISA GLADYS' },
    { value: 'AV3', viewValue: 'PEREZ VILCHEZ YESI JAQUELINE' },
    { value: 'AV4', viewValue: 'MURIEL CAHUAZA GREDIEL MERY' }, // quitar
    { value: 'AV5', viewValue: 'ORDINOLA LEON SILVANA MARTINA' },
    { value: 'AV6', viewValue: 'VALERA GAMARRA HERBERT ARMANDO' },
    { value: 'AV7', viewValue: 'CORDOVA GRANADOS YOHANA' },
    { value: 'CC7', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'CC9', viewValue: 'PÉREZ TINEO MARICIELO TATIANA' },
    { value: 'CC10', viewValue: 'RIVAS PURISACA KAREN YUDITH' }
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formVentas = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: [''],
      NAS: [{ value: false, disabled: true }]
    });
  }

  async ngOnInit() { }

  async importar(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

      // 👉 asesores válidos (solo los viewValue)
      const asesoresValidos = this.asesores
        .map(a => (a.viewValue || '').trim().toUpperCase())
        .filter(x => x !== 'SELECCIONE ASESOR');

      this.dataVentas = jsonData
        .map((row: any) => ({
          IDVENTA: row['IDVENTA'],
          FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
          Sede: row['Sede'],
          MontoConsolidado: this.parseNumber(row['MontoConsolidado']),
          CuotaInicial: this.parseNumber(row['CuotaInicial']),
          Productos: row['Productos'],
          Cuotas: row['Cuotas'],
          DocIdentidad: row['DocIdentidad'],
          Vendedor: (row['Vendedor'] || '').toString().trim(),
          EstadoVenta: row['EstadoVenta'],
          EstadoTipoProducto: row['EstadoTipoProducto'],
          AsesorVenta: (row['AsesorVenta'] || '').toString().trim()
        }))
        // 👉 solo quedarnos con vendedores válidos
        .filter(venta =>
          asesoresValidos.includes((venta.Vendedor || '').trim().toUpperCase())
        );

      console.log("✅ Importados totales:", this.dataVentas.length);

      this.aplicarFiltros();
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

  actualizarFiltros(): void {
    if (this.formVentas.valid) {
      this.aplicarFiltros();
    }
  }

  aplicarFiltros(): void {
    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const selectedCode = (this.formVentas.value.Asesores || '').toString().trim().toUpperCase();
    const selectedNombre = (this.asesores.find(a => a.value === selectedCode)?.viewValue || '').toUpperCase();

    const isSeleccionado = !!selectedCode;
    const isMontalvo = selectedNombre === 'MONTALVO LUYO ERNESTO ADOLFO';
    const isCC = selectedCode === 'CC7' || selectedCode === 'CC9';

    this.filtroVentas = this.dataVentas.filter(venta => {
      // ---- filtro por fecha ----
      const fechaVenta = new Date(venta.FECHAVENTA);
      const cumpleFecha = fechaVenta >= fechaInicio && fechaVenta <= fechaFin;
      if (!cumpleFecha) return false;

      const sedeUpper = (venta.Sede || '').toUpperCase();
      const vendedorUpper = (venta.Vendedor || '').toUpperCase();
      const asesorUpper = (venta.AsesorVenta || '').toUpperCase();

      // 🔴 condición global: solo sede REALZZA
      if (sedeUpper !== 'SEDE REALZZA STORE') return false;

      // ---- caso especial: MONTALVO seleccionado en el combo ----
      if (isMontalvo) {
        return (
          vendedorUpper === 'MONTALVO LUYO ERNESTO ADOLFO' &&
          asesorUpper !== 'CC7' &&
          asesorUpper !== 'CC9'
        );
      }

      // ---- caso especial: CC7 o CC9 seleccionados en el combo ----
      if (isCC) {
        return asesorUpper === selectedCode;
      }

      // ---- caso general: otros asesores seleccionados ----
      if (isSeleccionado && selectedNombre && selectedNombre !== 'SELECCIONE ASESOR') {
        return vendedorUpper === selectedNombre;
      }

      // ---- sin asesor seleccionado: mostrar todos los válidos en rango de fecha ----
      return true;
    });

    this.generarChartData();
    this.generarChartMontoPorDia();
    this.generarChartNroVentasPorDia();
    this.generarChartMontoSemanal();
    this.calcularTotales();
    this.generarChartMontoMensual();
    this.generarTablaVentasPorDiaMesActual();
    this.generarTablaOperacionesPorDiaMesActual();
  }

  generarChartData(): void {
    const agrupado = new Map<string, number>();

    for (const venta of this.filtroVentas) {
      let clave = (venta.Vendedor || '').trim(); // por defecto nombre del vendedor

      // Si es CC7 o CC9 → usar código del asesor
      if (venta.AsesorVenta?.toUpperCase() === 'CC7' || venta.AsesorVenta?.toUpperCase() === 'CC9') {
        clave = venta.AsesorVenta.trim();
      }

      const monto = venta.MontoConsolidado || 0;
      agrupado.set(clave, (agrupado.get(clave) || 0) + monto);
    }

    this.chartData = Array.from(agrupado, ([id, MontoTotal]) => {
      // Si es un código (CC7/CC9), obtener el nombre desde this.asesores
      const asesor = this.asesores.find(a => a.value === id || a.viewValue.toUpperCase() === id.toUpperCase());
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
      // 👇 Filtrar SOLO las ventas de la sede REALZZA STORE
      if (!venta.Sede || venta.Sede.trim().toUpperCase() !== 'SEDE REALZZA STORE') continue;

      // Validar que exista monto válido
      if (!venta.MontoConsolidado || venta.MontoConsolidado <= 0) continue;

      const fecha = new Date(venta.FECHAVENTA);
      const claveMes = `${fecha.getFullYear()}-${(fecha.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`; // Ej: "2025-07"
      mesesSet.add(claveMes);

      agrupado.set(
        claveMes,
        (agrupado.get(claveMes) || 0) + venta.MontoConsolidado
      );
    }

    // Ordenar meses de forma cronológica
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

  // generarTablaVentasPorDiaMesActual(): void {
  //   const hoy = new Date();
  //   const mesActual = hoy.getMonth(); // 0 = enero
  //   const anioActual = hoy.getFullYear();

  //   // 👉 Días del mes actual
  //   const diasMes = new Date(anioActual, mesActual + 1, 0).getDate();
  //   this.columnasDiasMes = Array.from({ length: diasMes }, (_, i) => (i + 1).toString());

  //   // 👉 Agrupamos las ventas por asesor y día
  //   const agrupado = new Map<string, Map<number, number>>();

  //   for (const venta of this.filtroVentas) {
  //     const fecha = new Date(venta.FECHAVENTA);
  //     if (fecha.getMonth() !== mesActual || fecha.getFullYear() !== anioActual) continue;

  //     const dia = fecha.getDate();
  //     const asesor = (venta.Vendedor || '').trim().toUpperCase();
  //     const monto = venta.MontoConsolidado || 0;

  //     if (!agrupado.has(asesor)) {
  //       agrupado.set(asesor, new Map());
  //     }
  //     const mapDias = agrupado.get(asesor)!;
  //     mapDias.set(dia, (mapDias.get(dia) || 0) + monto);
  //   }

  //   // 👉 Construimos estructura final (una fila por asesor)
  //   this.ventasPorDiaMesActual = [];
  //   for (const asesor of agrupado.keys()) {
  //     const fila: any = { Asesor: asesor };

  //     this.columnasDiasMes.forEach(diaStr => {
  //       const dia = +diaStr;
  //       fila[diaStr] = agrupado.get(asesor)?.get(dia) || '';
  //     });

  //     this.ventasPorDiaMesActual.push(fila);
  //   }
  // }

  generarTablaVentasPorDiaMesActual(): void {
    if (!this.formVentas?.value?.fechaInicio || !this.formVentas?.value?.fechaFin) {
      return; // no hay rango seleccionado
    }

    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin = new Date(this.formVentas.value.fechaFin);

    // normalizamos horas
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    // 👉 Generamos los días del rango
    const dias: string[] = [];
    let cursor = new Date(fechaInicio);
    while (cursor <= fechaFin) {
      dias.push(cursor.getDate().toString()); // solo número del día
      cursor.setDate(cursor.getDate() + 1);
    }
    this.columnasDiasMes = dias;

    // 👉 Agrupamos ventas por asesor y día dentro del rango
    const agrupado = new Map<string, Map<number, number>>();

    for (const venta of this.filtroVentas) {
      const fecha = new Date(venta.FECHAVENTA);
      if (fecha < fechaInicio || fecha > fechaFin) continue; // fuera de rango

      const dia = fecha.getDate();
      const asesor = (venta.Vendedor || '').trim().toUpperCase();
      const monto = venta.MontoConsolidado || 0;

      if (!agrupado.has(asesor)) {
        agrupado.set(asesor, new Map());
      }
      const mapDias = agrupado.get(asesor)!;
      mapDias.set(dia, (mapDias.get(dia) || 0) + monto);
    }

    // 👉 Construimos estructura final (una fila por asesor)
    this.ventasPorDiaMesActual = [];
    for (const asesor of agrupado.keys()) {
      const fila: any = { Asesor: asesor };

      this.columnasDiasMes.forEach(diaStr => {
        const dia = +diaStr;
        fila[diaStr] = agrupado.get(asesor)?.get(dia) || '';
      });

      this.ventasPorDiaMesActual.push(fila);
    }
  }

  generarTablaOperacionesPorDiaMesActual(): void {
  if (!this.formVentas?.value?.fechaInicio || !this.formVentas?.value?.fechaFin) {
    return; // no hay rango seleccionado
  }

  const fechaInicio = new Date(this.formVentas.value.fechaInicio);
  const fechaFin = new Date(this.formVentas.value.fechaFin);

  // normalizamos horas
  fechaInicio.setHours(0, 0, 0, 0);
  fechaFin.setHours(23, 59, 59, 999);

  // 👉 Generamos los días del rango
  const dias: string[] = [];
  let cursor = new Date(fechaInicio);
  while (cursor <= fechaFin) {
    dias.push(cursor.getDate().toString());
    cursor.setDate(cursor.getDate() + 1);
  }
  this.columnasDiasMes = dias;

  // 👉 Agrupamos operaciones por asesor y día
  const agrupado = new Map<string, Map<number, number>>();

  for (const venta of this.filtroVentas) {
    const fecha = new Date(venta.FECHAVENTA);
    if (fecha < fechaInicio || fecha > fechaFin) continue;

    const dia = fecha.getDate();
    const asesor = (venta.Vendedor || '').trim().toUpperCase();

    if (!agrupado.has(asesor)) {
      agrupado.set(asesor, new Map());
    }
    const mapDias = agrupado.get(asesor)!;
    mapDias.set(dia, (mapDias.get(dia) || 0) + 1); // 👉 aquí contamos operaciones
  }

  // 👉 Construimos estructura final (una fila por asesor)
  this.operacionesPorDiaMesActual = [];
  for (const asesor of agrupado.keys()) {
    const fila: any = { Asesor: asesor };

    this.columnasDiasMes.forEach(diaStr => {
      const dia = +diaStr;
      fila[diaStr] = agrupado.get(asesor)?.get(dia) || 0;
    });

    this.operacionesPorDiaMesActual.push(fila);
  }
}

  onAsesorChanged(event: any) {
    if (this.formVentas.valid) {
      this.aplicarFiltros();
    }
  }

  calcularTotales(): void {
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

  customizeCurrencyText = function (cell: any): string {
    if (typeof cell.value === 'number') {
      return `S/. ${cell.value.toLocaleString('es-PE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}`;
    }
    return '';
  };

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataAgendamientos", this.dataGrid);
    }
  }

  abrirPopup(tipo: 'asesor' | 'dia' | 'nroVentas' | 'ventasSemanal' | 'ventasPorMes') {
    if (tipo === 'asesor') {
      this.popupVisibleAsesor = true;
    } else if (tipo === 'dia') {
      this.popupVisibleDia = true;
    } else if (tipo === 'nroVentas') {
      this.popupVisibleNroVentas = true;
    } else if (tipo === 'ventasSemanal') {
      this.popupVisibleVentasSemanal = true;
    } else if (tipo === 'ventasPorMes') {
      this.popupVisibleVentasPorMes = true;
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
  }

  customizeMontoTexto = (pointInfo: any): string => {
    if (pointInfo.value === 0) return ''; // Oculta ceros
    return `S/ ${Math.round(pointInfo.value).toLocaleString('es-PE')}`;
  };

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

  onCellPreparedVA(e: any) {
    // Encabezados
    if (e.rowType === 'header') {
      e.cellElement.style.padding = "8px";
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.textAlign = "center";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.height = "auto";
      e.cellElement.style.borderWidth = "1.5px";
      e.cellElement.style.borderColor = "black";
    }

    // Filas de datos
    if (e.rowType === 'data') {
      e.cellElement.style.border = '1px solid #ccc';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';

      // Validación de columna por día
      if (e.column?.dataField !== 'Asesor') {
        const valor = e.value;

        if (valor && valor > 0) {
          e.cellElement.style.backgroundColor = '#7dd17fff'; // verde
          e.cellElement.style.color = 'black';
        } else {
          e.cellElement.style.backgroundColor = '#e66a6aff'; // rojo
          e.cellElement.style.color = 'black';
        }
      }
    }
  }

}

interface VentasPorDia {
  Dia: string;
  [semana: string]: number | string;
}