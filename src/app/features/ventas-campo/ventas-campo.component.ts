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

  // Popups
  popupVisibleAsesor: boolean = false;
  popupVisibleDia: boolean = false;
  popupVisibleNroVentas: boolean = false;
  popupVisibleVentasSemanal: boolean = false;
  popupVisibleVentasPorMes: boolean = false;
  popupVisibleEvolutivo: boolean = false;

  // KPIs
  totalMontoVentas = 0;
  totalVentas = 0;
  ticket = 0;
  proyeccion = 0;
  totalNotasCredito = 0;
  totalMontoRefacturacion = 0;
  montoRealVentas = 0;

  // Notas de Crédito
  dataNotasCredito: any[] = [];
  filtroNotasCredito: any[] = [];

  // Global GO
  dataGlobalGo: any[] = [];
  filtroGlobalGo: any[] = [];
  mesesGlobalGo: { label: string; value: string }[] = [];
  mesSeleccionadoGlobalGo = '';

  // Data Gráficos
  chartData: ChartData[] = [];
  chartPorDia: { Dia: string, [key: string]: any }[] = [];
  chartNumeroVentasPorDia: any[] = [];
  chartMontoSemanal: any[] = [];
  chartMontoMensual: { Mes: string; MontoTotal: number }[] = [];

  // Global GO motos detalle
  detalleMotosGlobalGo: any[] = [];
  tiposProductoGlobalGo: string[] = [];

  // Data Tablas
  ventasPorDiaMesActual: any[] = [];
  operacionesPorDiaMesActual: any[] = [];

  semanas: string[] = [];
  seriesMeses: string[] = [];
  columnasDiasMes: string[] = [];

  resumenPorVendedor: any[] = [];
  ventasPorSemana: any[] = [];
  ventasPorEntidad: any[] = [];
  motosPorEntidad: any[] = [];
  motosPorTipoProducto: any[] = [];
  ventasPorTipoCredito: any[] = [];
  maxMontoTipoCredito = 1;
  maxMontoVendedor = 1;
  maxMontoEntidad = 1;
  maxMontoMotoEntidad = 1;
  maxMontoMotoTipo = 1;
  ventasPorTipoBase: any[] = [];
  maxMontoTipoBase = 1;
  metasPorTipoBase: Record<string, number> = {};
  // Metas de la hoja METAS por mes (mesKey 'yyyy-mm' → { tipoBase → meta }).
  metasPorMes: Record<string, Record<string, number>> = {};
  // Fila "TOTAL" de la hoja METAS = cuota del mes GENERAL (no es un tipo de base).
  metasTotalPorMes: Record<string, number> = {};
  totalCuotaMes = 0;          // cuota del mes total = suma de metas de los tipos
  totalAvanceTipoBase = 0;    // % avance total (ventas / cuota del mes)
  totalPartTipoBase = 0;      // % participación total (100% si hay ventas)
  customizeAvanceTipoBaseTotal = (_: any) => `${this.totalAvanceTipoBase.toFixed(1)}%`;
  customizeCuotaTipoBaseTotal = (_: any) => `S/ ${this.totalCuotaMes.toLocaleString('es-PE')}`;
  customizePartTipoBaseTotal = (_: any) => `${this.totalPartTipoBase.toFixed(1)}%`;
  showDetailGrid = false;
  showNCGrid = false;
  totalPctMargenCredito = 0;
  customizePctMargenTotal = (_: any) => `${this.totalPctMargenCredito.toFixed(1)}%`;
  dataMargen: any[] = [];
  dataEvolutivo: any[] = [];
  seriesEvolutivo: string[] = [];
  seriesEvolutivoMain: string[] = [];
  seriesEvolutivoTrend: string[] = [];

  // Bonos por vendedor
  tablaBonosAsesor: any[] = [];

  readonly tablaBonos = [
    { monto: 150000, bono: 2500 }, { monto: 145000, bono: 2400 }, { monto: 140000, bono: 2300 },
    { monto: 135000, bono: 2200 }, { monto: 130000, bono: 2100 }, { monto: 125000, bono: 2000 },
    { monto: 120000, bono: 1900 }, { monto: 115000, bono: 1800 }, { monto: 110000, bono: 1700 },
    { monto: 105000, bono: 1600 }, { monto: 100000, bono: 1500 }, { monto:  95000, bono: 1400 },
    { monto:  90000, bono: 1300 }, { monto:  85000, bono: 1200 }, { monto:  80000, bono: 1000 },
    { monto:  75000, bono:  800 }, { monto:  70000, bono:  650 }, { monto:  65000, bono:  600 },
    { monto:  60000, bono:  550 }, { monto:  55000, bono:  500 }, { monto:  50000, bono:  450 },
    { monto:  45000, bono:  400 }, { monto:  40000, bono:  350 }, { monto:  35000, bono:  300 },
    { monto:  30000, bono:  250 }, { monto:  25000, bono:  200 }, { monto:  20000, bono:  150 },
    { monto:  15000, bono:  100 }, { monto:  10000, bono:   50 }
  ];

  // Evolutivo raw + ajustes históricos
  private rawEvolutivoMap = new Map<string, number>();
  private ajustesPorMes = new Map<string, number>(); // "YYYY-MM" → monto neto a restar
  ventasPorLineaReal: any[] = [];
  maxValorVentaLineaReal = 1;
  totalPctMargenLineaReal = 0;
  customizePctMargenLineaTotal = (_: any) => `${this.totalPctMargenLineaReal.toFixed(1)}%`;

  // Color distinto por barra (gráfico vendedor)
  customizeVendedorPoint = (pointInfo: any) => {
    const colors = ['#1565C0', '#2E7D32', '#b71c1c', '#E65100', '#6A1B9A',
                    '#00695C', '#4E342E', '#37474F', '#AD1457', '#558B2F', '#0277BD'];
    return { color: colors[pointInfo.index % colors.length] };
  };

  // Tooltip con formato S/ sin decimales
  customizeMontoTooltip = (arg: any) => ({
    text: `${arg.seriesName ? arg.seriesName + '\n' : ''}S/ ${Math.round(arg.value).toLocaleString('es-PE')}`
  });


  private readonly grupoBrilla = new Set([
    'PAIVA ROJAS ANTHONNY RAY AMERICO',
    'SANDOVAL CHAFLOQUE BRISA ALEXANDRA',
    'CASTILLO AGUILAR ANYELA VANESSA'
  ]);

  // Vendedores que pertenecen al cap RealZZA aunque traigan un código de asesor
  // CALL en AsesorVenta (ej. CC12). Deben contarse como vendedor independiente
  // (su propio nombre), NO como "CALL", en todas las tablas y gráficos.
  private readonly vendedoresExcepcionCall = new Set([
    'BERNAL BAZAN BRENDA NICOLL'
  ]);



  // Lista para el filtro manual (Dropdown)
  asesores = [
    { value: '', viewValue: 'SELECCIONE ASESOR' },
    { value: 'AV1', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'AV2', viewValue: 'PEREZ TINEO MARICIELO TATIANA' },
    { value: 'AV3', viewValue: 'RIVAS PURISACA KAREN YUDITH' },
    { value: 'AV4', viewValue: 'BERNAL BAZAN BRENDA NICOLL' },
    { value: 'AV5', viewValue: 'MIÑOPE GONZALES ANYELA ESTHEFANY' },
    { value: 'AV6', viewValue: 'MONTALVO LUYO ERNESTO ADOLFO' },
    { value: 'AV7', viewValue: 'SANTAMARIA GUZMAN MERLY BRIGHITE' },
    { value: 'AV8', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'AV9', viewValue: 'BUSTAMANTE CHALAN ANA RUT' },
    { value: 'AV10', viewValue: 'LLONTOP DAVILA DENNIS CHRISTIAN' }
  ];

  nombresCortos: Record<string, string> = {
    'MONTALVO LUYO ERNESTO ADOLFO': 'ERNESTO',
    'PEREZ TINEO MARICIELO TATIANA': 'TATIANA',
    'RIVAS PURISACA KAREN YUDITH': 'YUDITH',
    'ACOSTA JIMENEZ MARIELA NATALY': 'NATALY',
    'BERNAL BAZAN BRENDA NICOLL': 'BRENDA',
    'SERNAQUE DAVILA JUAN ALBERTO': 'JUAN',
    'CARRANZA ALARCON TREYCI JOHANA': 'TREYCI',
    'SANDOVAL OTINIANO JUANA DEL PILAR': 'JUANA',
    'SANTAMARIA GUZMAN MERLY BRIGHITE': 'MERLY',
    'MIÑOPE GONZALES ANYELA ESTHEFANY': 'ANYELA',
    'SAMAME HUAMAN ARIADNE': 'ARIADNE',
    'UCHOFEN VIGO FELICITA': 'FELICITA',
    'BUSTAMANTE CHALAN ANA RUT': 'ANA RUT',
    'LLONTOP DAVILA DENNIS CHRISTIAN': 'DENNIS'
  };

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;
  @ViewChild('gridGlobalGo', { static: false }) gridGlobalGo!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    this.formVentas = this.fb.group({
      fechaInicio: [firstDay, Validators.required],
      fechaFin: [today, Validators.required],
      Asesores: ['']
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

      // Leer hoja MARGEN: mapa Codigo→[{linea,valorVenta}] (puede haber varios productos por venta)
      const margenMap = new Map<string, { linea: string; valorVenta: number }[]>();
      this.dataMargen = [];
      const mSheetName = workbook.SheetNames.find(n => n.trim().toUpperCase() === 'MARGEN');
      if (mSheetName) {
        (XLSX.utils.sheet_to_json(workbook.Sheets[mSheetName], { raw: true }) as any[])
          .forEach((mr: any) => {
            const codigo = (mr['Codigo'] || '').toString().trim();
            const sede = (mr['SEDE'] || '').toString().trim().toUpperCase();
            const linea = (mr['LINEA REAL'] || 'SIN LÍNEA').toString().trim().toUpperCase();
            const valorVenta = this.parseNumber(mr['VALOR VENTA']);
            const margenTotal = this.parseNumber(mr['MARGEN TOTAL']);
            if (codigo) {
              const existing = margenMap.get(codigo) || [];
              existing.push({ linea, valorVenta });
              margenMap.set(codigo, existing);
            }
            if (sede === 'REALZZA') {
              this.dataMargen.push({
                Codigo: codigo,
                LineaReal: linea,
                ValorVenta: valorVenta,
                MargenTotal: margenTotal,
                FECHAVENTA: this.getFechaJS(mr['Fecha'])
              });
            }
          });
      }

      this.dataVentas = [];
      this.dataNotasCredito = [];
      this.dataGlobalGo = [];

      jsonData.forEach((row: any) => {
        const sede = (row['Sede'] || '').toString().trim().toUpperCase();
        const estadoVenta = (row['EstadoVenta'] || '').toString().trim().toUpperCase();
        const entidad = (row['Entidad'] || '').toString().trim().toUpperCase();
        const monto = this.parseNumber(row['MontoConsolidado']);
        const esNC = estadoVenta === 'NOTA DE CRÉDITO' || estadoVenta === 'NOTA DE CREDITO';
        const idventa = (row['IDVENTA'] || '').toString().trim();

        if (sede === 'SEDE REALZZA STORE' && !esNC && monto > 0) {
          // Línea principal: la de mayor ValorVenta en MARGEN para este IDVENTA
          const margenItems = margenMap.get(idventa) || [];
          const primaryLinea = margenItems.length > 0
            ? margenItems.reduce((max, i) => i.valorVenta > max.valorVenta ? i : max, margenItems[0]).linea
            : 'SIN LÍNEA';
          this.dataVentas.push({
            IDVENTA: row['IDVENTA'],
            FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
            Sede: row['Sede'],
            MontoConsolidado: monto,
            CuotaInicial: this.parseNumber(row['CuotaInicial']),
            Productos: row['Productos'],
            Cuotas: row['Cuotas'],
            DocIdentidad: (row['DocIdentidad'] || '').toString().trim(),
            ClienteVenta: row['ClienteVenta'],
            Vendedor: (row['Vendedor'] || 'SIN VENDEDOR').toString().trim().toUpperCase(),
            EstadoVenta: row['EstadoVenta'],
            Entidad: row['Entidad'],
            AsesorVenta: row['AsesorVenta'],
            TipoCredito: row['TipoCredito'],
            TipoProducto: row['TipoProducto'],
            TipoBase: (row['TipoBase'] || '').toString().trim().toUpperCase(),
            Margen: this.parseNumber(row['MargenTotal']),
            ValorVenta: this.parseNumber(row['ValorVenta']),
            LineaReal: primaryLinea
          });
        }

        // Capturar Notas de Crédito con las 3 columnas AF
        if (sede === 'SEDE REALZZA STORE' && esNC) {
          // Distribución proporcional del NC entre las líneas reales del IDVENTA
          const ncItems = margenMap.get(idventa) || [];
          const ncTotalVV = ncItems.reduce((s, i) => s + i.valorVenta, 0);
          const lineaRealItems = ncItems.length > 0
            ? ncItems.map(i => ({
                linea: i.linea,
                proporcion: ncTotalVV > 0 ? i.valorVenta / ncTotalVV : 1 / ncItems.length
              }))
            : [{ linea: 'SIN LÍNEA', proporcion: 1 }];
          this.dataNotasCredito.push({
            IDVENTA: row['IDVENTA'],
            FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
            MontoConsolidado: Math.abs(monto),
            Productos: row['Productos'],
            ClienteVenta: row['ClienteVenta'],
            DocIdentidad: (row['DocIdentidad'] || '').toString().trim(),
            Vendedor: (row['Vendedor'] || 'SIN VENDEDOR').toString().trim().toUpperCase(),
            EstadoVenta: row['EstadoVenta'],
            AsesorVenta: row['AsesorVenta'],
            Entidad: row['Entidad'],
            TipoCredito: row['TipoCredito'],
            TipoBase: (row['TipoBase'] || '').toString().trim().toUpperCase(),
            LineaRealItems: lineaRealItems,
            DiaAF: this.parseNumber(row['DiaAF']),
            MesAF: this.parseNumber(row['MesAF']),
            AñoAF: this.parseNumber(row['AñoAF'])
          });
        }

        // Capturar ventas Global GO solo de SEDE REALZZA STORE
        if (sede === 'SEDE REALZZA STORE' && entidad === 'GLOBAL GO' && !esNC && monto > 0) {
          this.dataGlobalGo.push({
            ClienteVenta: row['ClienteVenta'],
            DocIdentidad: row['DocIdentidad'],
            FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
            MontoConsolidado: monto,
            Productos: row['Productos'],
            TipoProducto: (row['TipoProducto'] || 'SIN TIPO').toString().trim().toUpperCase(),
            Vendedor: (row['Vendedor'] || 'SIN VENDEDOR').toString().trim().toUpperCase(),
            AsesorVenta: (row['AsesorVenta'] || '').toString().trim()
          });
        }
      });
      // Leer hoja METAS por TipoBase, guardando TODOS los meses (columnas 'yyyy-mm').
      // Así la tabla puede mostrar la meta/cuota del mes que se esté filtrando.
      this.metasPorMes = {};
      this.metasTotalPorMes = {};
      const metasSheetName = workbook.SheetNames.find(n => n.trim().toUpperCase() === 'METAS');
      if (metasSheetName) {
        const metasSheet = workbook.Sheets[metasSheetName];
        const metasData = XLSX.utils.sheet_to_json(metasSheet, { raw: false }) as any[];
        metasData.forEach((metaRow: any) => {
          const keys = Object.keys(metaRow);
          if (keys.length === 0) return;
          const tipoBase = (metaRow[keys[0]] || '').toString().trim().toUpperCase();
          if (!tipoBase) return;
          // La fila TOTAL no es un tipo de base: es la cuota del mes general.
          const esTotal = tipoBase === 'TOTAL' || tipoBase === 'TOTAL GENERAL' || tipoBase.startsWith('CUOTA');
          keys.forEach(k => {
            const mesKey = k.trim();
            if (!/^\d{4}-\d{2}$/.test(mesKey)) return; // solo columnas de mes
            const meta = this.parseNumber(metaRow[k] || '0');
            if (esTotal) this.metasTotalPorMes[mesKey] = meta;
            else (this.metasPorMes[mesKey] ??= {})[tipoBase] = meta;
          });
        });
      }
      // Leer hoja EVOLUTIVO: FECHAVENTA + MontoConsolidado → guardar mapa crudo por mes
      this.rawEvolutivoMap.clear();
      this.dataEvolutivo = [];
      this.seriesEvolutivoMain = ['Ventas'];
      this.seriesEvolutivoTrend = [];
      const evoSheetName = workbook.SheetNames.find(n => n.trim().toUpperCase() === 'EVOLUTIVO');
      if (evoSheetName) {
        const evoRows = XLSX.utils.sheet_to_json(workbook.Sheets[evoSheetName], { raw: true }) as any[];
        evoRows.forEach((r: any) => {
          const keys = Object.keys(r);
          const fechaKey = keys.find(k => k.trim().toUpperCase().replace(/\s+/g, '') === 'FECHAVENTA') || 'FECHAVENTA';
          const montoKey = keys.find(k => k.trim().toUpperCase().replace(/\s+/g, '') === 'MONTOCONSOLIDADO') || 'MontoConsolidado';
          const fecha = this.getFechaJS(r[fechaKey] ?? '');
          const monto = this.parseNumber(r[montoKey] ?? 0);
          if (!fecha || isNaN(fecha.getTime()) || monto <= 0) return;
          const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
          this.rawEvolutivoMap.set(key, (this.rawEvolutivoMap.get(key) || 0) + monto);
        });
      }

      // Leer hoja AJUSTES: ajustes históricos de NCs por mes (Año | Mes | NotasCredito | Refacturacion)
      this.ajustesPorMes.clear();
      const ajustesSheetName = workbook.SheetNames.find(n => n.trim().toUpperCase() === 'AJUSTES');
      if (ajustesSheetName) {
        const ajustesRows = XLSX.utils.sheet_to_json(workbook.Sheets[ajustesSheetName], { raw: true }) as any[];
        ajustesRows.forEach((r: any) => {
          const anio = this.parseNumber(r['Año'] || r['AÑO'] || r['ANO'] || r['año'] || 0);
          const mes  = this.parseNumber(r['Mes'] || r['MES'] || r['mes'] || 0);
          const nc   = this.parseNumber(r['NotasCredito'] || r['NC'] || r['NOTASCREDITO'] || 0);
          const ref  = this.parseNumber(r['Refacturacion'] || r['REFACT'] || r['REFACTURACION'] || 0);
          if (anio > 0 && mes > 0) {
            const key = `${anio}-${String(mes).padStart(2, '0')}`;
            this.ajustesPorMes.set(key, Math.max(0, nc - ref));
          }
        });
      }

      console.log(`✅ Ventas: ${this.dataVentas.length} | GO: ${this.dataGlobalGo.length} | Margen: ${this.dataMargen.length} | Evolutivo: ${this.dataEvolutivo.length}`);
      this.generarMesesGlobalGo();
      this.actualizarFiltros();
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
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

    const asesorSeleccionadoCode = this.formVentas.value.Asesores;
    const asesorObj = this.asesores.find(a => a.value === asesorSeleccionadoCode);
    const nombreFiltro = asesorObj && asesorObj.viewValue !== 'SELECCIONE ASESOR' ? asesorObj.viewValue.toUpperCase() : '';

    this.filtroVentas = this.dataVentas.filter(venta => {
      const fechaVenta = new Date(venta.FECHAVENTA);
      if (fechaVenta < fechaInicio || fechaVenta > fechaFin) return false;
      if (nombreFiltro) {
        return venta.Vendedor.includes(nombreFiltro);
      }
      return true;
    });

    this.filtrarNotasCredito();

    this.calcularKPIs();
    this.aplicarAjustesEvolutivo();
    this.generarChartData();
    this.generarResumenPorVendedor();
    this.generarVentasPorSemana();
    this.generarVentasPorEntidad();
    this.generarMotosPorEntidad();
    this.generarMotosPorTipoProducto();
    this.generarDetalleMotosGlobalGo();
    this.generarVentasPorTipoCredito();
    this.generarVentasPorTipoBase();
    this.generarVentasPorLineaReal();
    this.generarChartMontoPorDia();
    this.generarChartNroVentasPorDia();
    this.generarChartMontoSemanal();
    this.generarChartMontoMensual();
    this.generarTablaVentasPorDiaMesActual();
    this.generarTablaOperacionesPorDiaMesActual();
    this.generarResumenBonosAsesor();
  }

  filtrarNotasCredito(): void {
    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin    = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    // Mes/año del rango seleccionado (no el mes actual del sistema)
    const anioSeleccionado = fechaFin.getFullYear();
    const mesSeleccionado  = fechaFin.getMonth() + 1;

    const asesorSeleccionadoCode = this.formVentas.value.Asesores;
    const asesorObj = this.asesores.find(a => a.value === asesorSeleccionadoCode);
    const nombreFiltro = asesorObj && asesorObj.viewValue !== 'SELECCIONE ASESOR'
      ? asesorObj.viewValue.toUpperCase() : '';

    this.filtroNotasCredito = this.dataNotasCredito
      .filter(nc => {
        const cumpleAsesor = !nombreFiltro || nc.Vendedor.includes(nombreFiltro);
        if (!cumpleAsesor) return false;

        const tieneAF = nc.AñoAF > 0 && nc.MesAF > 0;
        if (tieneAF) {
          // Ruta principal: AF indica a qué mes pertenece la NC → comparar vs mes seleccionado
          return nc.AñoAF === anioSeleccionado && nc.MesAF === mesSeleccionado;
        }
        // Fallback: sin AF → usar FECHAVENTA contra el rango seleccionado
        const fechaNC = nc.FECHAVENTA as Date;
        return fechaNC >= fechaInicio && fechaNC <= fechaFin;
      })
      .map(nc => {
        // Refacturación: SOLO cuenta cuando la NC y su venta nueva ocurren en el
        // MISMO MES (el seleccionado). Una NC de un mes anterior (arrastrada por
        // AF al mes en curso) y refacturada ahora NO es refacturación → se resta.
        // La venta nueva: mismo DocIdentidad, IDVENTA distinto, misma fecha o
        // posterior (>=), y dentro del mes seleccionado.
        const fNC = nc.FECHAVENTA as Date;
        const ncDelMes = fNC.getFullYear() === anioSeleccionado && (fNC.getMonth() + 1) === mesSeleccionado;
        const esRefacturacion = ncDelMes && !!nc.DocIdentidad && this.dataVentas.some(v => {
          if (v.DocIdentidad !== nc.DocIdentidad) return false;
          if (v.IDVENTA === nc.IDVENTA) return false;
          if (v.FECHAVENTA < nc.FECHAVENTA) return false;
          const f = v.FECHAVENTA as Date;
          return f.getFullYear() === anioSeleccionado && (f.getMonth() + 1) === mesSeleccionado;
        });
        return {
          ...nc,
          esRefacturacion,
          MontoRefacturacion: esRefacturacion ? nc.MontoConsolidado : 0
        };
      });
  }

  /**
   * Agrupa el monto de las notas de crédito por la clave devuelta por keyFn,
   * EXCLUYENDO siempre las que tienen refacturación. Si una NC fue refacturada,
   * la venta nueva ya está sumada en filtroVentas, por lo que descontar la NC
   * sería un doble descuento. Centralizar este criterio evita que una tabla
   * nueva olvide aplicar el filtro de refacturación.
   */
  private agruparNCSinRefacturacion(keyFn: (nc: any) => string): Map<string, number> {
    const map = new Map<string, number>();
    this.filtroNotasCredito.forEach(nc => {
      if (nc.esRefacturacion) return;
      const key = keyFn(nc);
      map.set(key, (map.get(key) || 0) + (nc.MontoConsolidado || 0));
    });
    return map;
  }

  calcularKPIs(): void {
    this.totalVentas = this.filtroVentas.length;
    this.totalMontoVentas = Math.round(this.filtroVentas.reduce((sum, v) => sum + v.MontoConsolidado, 0));
    this.totalNotasCredito = Math.round(this.filtroNotasCredito.reduce((sum, nc) => sum + nc.MontoConsolidado, 0));
    this.totalMontoRefacturacion = Math.round(this.filtroNotasCredito.reduce((sum, nc) => sum + (nc.MontoRefacturacion || 0), 0));
    this.montoRealVentas = this.totalMontoVentas - this.totalNotasCredito + this.totalMontoRefacturacion;
    this.ticket = this.totalVentas > 0 ? Math.round(this.totalMontoVentas / this.totalVentas) : 0;

    // 2. Lógica de Proyección
    const hoy = new Date();
    const fechaFinFiltro = new Date(this.formVentas.value.fechaFin);

    // Extraemos año y mes para comparar periodos, no milisegundos
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();
    const anioFiltro = fechaFinFiltro.getFullYear();
    const mesFiltro = fechaFinFiltro.getMonth();

    // Verificamos si el mes seleccionado ya terminó
    const esMesPasado = anioFiltro < anioActual || (anioFiltro === anioActual && mesFiltro < mesActual);

    if (esMesPasado) {
      this.proyeccion = this.montoRealVentas;
    } else {
      const ultimoDiaMes = new Date(anioActual, mesActual + 1, 0).getDate();
      const diasTranscurridos = Math.max(1, hoy.getDate());
      const promedioDiario = this.montoRealVentas / diasTranscurridos;
      this.proyeccion = Math.round(promedioDiario * ultimoDiaMes);
    }
  }

  aplicarAjustesEvolutivo(): void {
    if (this.rawEvolutivoMap.size === 0) return;
    const hoy = new Date();
    const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const ncNetaActual = Math.max(0, this.totalNotasCredito - this.totalMontoRefacturacion);

    this.dataEvolutivo = Array.from(this.rawEvolutivoMap.keys()).sort().map(k => {
      let monto = this.rawEvolutivoMap.get(k) || 0;
      // Mes actual: ajuste calculado automáticamente desde las NCs del Excel
      if (k === mesActualKey && ncNetaActual > 0) {
        monto = Math.max(0, monto - ncNetaActual);
      }
      // Meses pasados: ajuste histórico desde la hoja AJUSTES
      const ajusteHistorico = this.ajustesPorMes.get(k) || 0;
      if (k !== mesActualKey && ajusteHistorico > 0) {
        monto = Math.max(0, monto - ajusteHistorico);
      }
      const [anio, mes] = k.split('-');
      return {
        Periodo: `${this.getNombreMes(+mes).substring(0, 3).toUpperCase()} ${anio}`,
        Ventas: Math.round(monto)
      };
    });
  }

  private resolverNombreVendedor(vendedorOriginal: string, asesorVenta: string = ''): string {
    const av = (asesorVenta || '').toString().trim().toUpperCase();
    if (av && av !== 'NAS' && !this.vendedoresExcepcionCall.has(vendedorOriginal)) return 'CALL';
    if (this.grupoBrilla.has(vendedorOriginal)) return 'BRILLA';
    return this.nombresCortos[vendedorOriginal] || vendedorOriginal;
  }

  generarChartData(): void {
    const map = new Map<string, number>();

    this.filtroVentas.forEach(v => {
      const nombre = this.resolverNombreVendedor(v.Vendedor, v.AsesorVenta);
      map.set(nombre, (map.get(nombre) || 0) + (v.MontoConsolidado || 0));
    });

    // Restar solo las NCs puras (sin refacturación) por vendedor.
    // Las refacturadas no restan porque la nueva venta ya está sumada en filtroVentas.
    this.agruparNCSinRefacturacion(nc => this.resolverNombreVendedor(nc.Vendedor, nc.AsesorVenta))
      .forEach((monto, nombre) => map.set(nombre, (map.get(nombre) || 0) - monto));

    this.chartData = Array.from(map, ([name, total]) => ({
      Vendedor: name,
      MontoTotal: Math.max(0, Math.round(total))
    })).sort((a, b) => b.MontoTotal - a.MontoTotal);
  }

  // 5. Formateador para las etiquetas del gráfico
  customizeMontoTexto = (arg: any) => {
    return `S/ ${arg.valueText}`;
  }

  generarChartMontoPorDia(): void {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const mapSemana = new Map<string, Map<string, number>>();
    const allSemanas = new Set<string>();

    this.filtroVentas.forEach(v => {
      const f = v.FECHAVENTA;
      const diaNom = dias[f.getDay()];
      const semana = this.getSemanaISO(f);
      allSemanas.add(semana);
      if (!mapSemana.has(diaNom)) mapSemana.set(diaNom, new Map());
      const inner = mapSemana.get(diaNom)!;
      inner.set(semana, (inner.get(semana) || 0) + v.MontoConsolidado);
    });

    const semanasOrdenadas = Array.from(allSemanas).sort();
    this.semanas = semanasOrdenadas.map((s, i) => `Semana ${i + 1}`);
    const mapAlias = new Map<string, string>();
    semanasOrdenadas.forEach((s, i) => mapAlias.set(s, `Semana ${i + 1}`));

    this.chartPorDia = dias.map(dia => {
      const item: any = { Dia: dia };
      const inner = mapSemana.get(dia);
      if (inner) {
        inner.forEach((val, keySemana) => {
          item[mapAlias.get(keySemana)!] = Math.round(val);
        });
      }
      return item;
    });
  }

  generarChartNroVentasPorDia(): void {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sabado'];
    const mapSemana = new Map<string, Map<string, number>>();
    const allSemanas = new Set<string>();

    this.filtroVentas.forEach(v => {
      const f = v.FECHAVENTA;
      const diaNom = dias[f.getDay()];
      const semana = this.getSemanaISO(f);
      allSemanas.add(semana);
      if (!mapSemana.has(diaNom)) mapSemana.set(diaNom, new Map());
      const inner = mapSemana.get(diaNom)!;
      inner.set(semana, (inner.get(semana) || 0) + 1);
    });

    const semanasOrdenadas = Array.from(allSemanas).sort();
    this.semanas = semanasOrdenadas.map((s, i) => `Semana ${i + 1}`);
    const mapAlias = new Map<string, string>();
    semanasOrdenadas.forEach((s, i) => mapAlias.set(s, `Semana ${i + 1}`));

    this.chartNumeroVentasPorDia = dias.map(dia => {
      const item: any = { Dia: dia };
      const inner = mapSemana.get(dia);
      if (inner) {
        inner.forEach((val, keySemana) => {
          item[mapAlias.get(keySemana)!] = val;
        });
      }
      return item;
    });
  }

  generarChartMontoSemanal(): void {
    const map = new Map<string, Map<string, number>>();
    const allMeses = new Set<string>();
    const allSemanas = new Set<string>();

    this.filtroVentas.forEach(v => {
      const f = v.FECHAVENTA;
      const mes = this.getNombreMes(f.getMonth() + 1) + ' ' + f.getFullYear();
      const semana = `Semana ${this.getSemanaDelMes(f)}`;
      allMeses.add(mes);
      allSemanas.add(semana);
      if (!map.has(semana)) map.set(semana, new Map());
      const inner = map.get(semana)!;
      inner.set(mes, (inner.get(mes) || 0) + v.MontoConsolidado);
    });

    this.seriesMeses = Array.from(allMeses);
    const semanasOrd = Array.from(allSemanas).sort((a, b) => +a.split(' ')[1] - +b.split(' ')[1]);

    this.chartMontoSemanal = semanasOrd.map(sem => {
      const item: any = { Semana: sem };
      this.seriesMeses.forEach(m => {
        item[m] = Math.round(map.get(sem)?.get(m) || 0);
      });
      return item;
    });
  }

  generarChartMontoMensual(): void {
    const map = new Map<string, number>();
    this.filtroVentas.forEach(v => {
      const f = v.FECHAVENTA;
      const key = `${f.getFullYear()}-${(f.getMonth() + 1).toString().padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + v.MontoConsolidado);
    });

    // Ajuste neto del mes en curso: restar solo las NCs puras (sin refacturación).
    const ncNeta = this.totalNotasCredito - this.totalMontoRefacturacion;
    if (ncNeta > 0) {
      const hoy = new Date();
      const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
      if (map.has(mesActualKey)) {
        map.set(mesActualKey, Math.max(0, (map.get(mesActualKey) || 0) - ncNeta));
      }
    }

    const keysOrd = Array.from(map.keys()).sort();
    this.chartMontoMensual = keysOrd.map(k => {
      const [anio, mes] = k.split('-');
      return { Mes: `${this.getNombreMes(+mes)} ${anio}`, MontoTotal: Math.round(map.get(k) || 0) };
    });
  }

  generarTablaVentasPorDiaMesActual(): void {
    const inicio = new Date(this.formVentas.value.fechaInicio);
    const fin = new Date(this.formVentas.value.fechaFin);
    this.columnasDiasMes = [];
    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      this.columnasDiasMes.push(d.getDate().toString());
    }
    const map = new Map<string, Map<string, number>>();
    this.filtroVentas.forEach(v => {
      const dStr = v.FECHAVENTA.getDate().toString();
      const vendedor = v.Vendedor;
      if (!map.has(vendedor)) map.set(vendedor, new Map());
      const inner = map.get(vendedor)!;
      inner.set(dStr, (inner.get(dStr) || 0) + v.MontoConsolidado);
    });
    this.ventasPorDiaMesActual = Array.from(map.keys()).map(vend => {
      const row: any = { Asesor: vend };
      this.columnasDiasMes.forEach(dia => { row[dia] = map.get(vend)?.get(dia) || 0; });
      return row;
    });
  }

  generarTablaOperacionesPorDiaMesActual(): void {
    const map = new Map<string, Map<string, number>>();
    this.filtroVentas.forEach(v => {
      const dStr = v.FECHAVENTA.getDate().toString();
      const vendedor = v.Vendedor;
      if (!map.has(vendedor)) map.set(vendedor, new Map());
      const inner = map.get(vendedor)!;
      inner.set(dStr, (inner.get(dStr) || 0) + 1);
    });
    this.operacionesPorDiaMesActual = Array.from(map.keys()).map(vend => {
      const row: any = { Asesor: vend };
      this.columnasDiasMes.forEach(dia => { row[dia] = map.get(vend)?.get(dia) || 0; });
      return row;
    });
  }

  generarResumenPorVendedor(): void {
    const mapVentas = new Map<string, { monto: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const nombre = this.resolverNombreVendedor(v.Vendedor, v.AsesorVenta);
      const cur = mapVentas.get(nombre) || { monto: 0, ops: 0 };
      mapVentas.set(nombre, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });

    const mapNC = this.agruparNCSinRefacturacion(nc => this.resolverNombreVendedor(nc.Vendedor, nc.AsesorVenta));

    const rows: any[] = [];
    mapVentas.forEach((data, nombre) => {
      const montoNC = mapNC.get(nombre) || 0;
      const montoNeto = Math.max(0, data.monto - montoNC);
      rows.push({
        Vendedor: nombre,
        MontoVentas: Math.round(data.monto),
        MontoNC: Math.round(montoNC),
        MontoNeto: Math.round(montoNeto),
        NroOps: data.ops,
        TicketPromedio: data.ops > 0 ? Math.round(data.monto / data.ops) : 0,
        Participacion: 0
      });
    });

    const totalNeto = rows.reduce((sum, r) => sum + r.MontoNeto, 0);
    rows.forEach(r => {
      r.Participacion = totalNeto > 0 ? Math.round((r.MontoNeto / totalNeto) * 1000) / 10 : 0;
    });

    this.resumenPorVendedor = rows.sort((a, b) => b.MontoNeto - a.MontoNeto);
    this.maxMontoVendedor = this.resumenPorVendedor.length > 0 ? this.resumenPorVendedor[0].MontoVentas : 1;
  }

  private entidadDisplay(e: string): string {
    const u = (e || '').toString().trim().toUpperCase();
    if (u === 'LEONCITO') return 'REALZZA';
    return e || 'SIN ENTIDAD';
  }

  generarVentasPorSemana(): void {
    const config = [
      { label: 'Semana 1 (1-7)',   min: 1,  max: 7  },
      { label: 'Semana 2 (8-14)',  min: 8,  max: 14 },
      { label: 'Semana 3 (15-21)', min: 15, max: 21 },
      { label: 'Semana 4 (22-28)', min: 22, max: 28 },
      { label: 'Semana 5 (29-31)', min: 29, max: 31 },
    ];
    // Usar DiaAF (día del mes en curso en que se aplica la NC) para asignar semana.
    // Así evitamos que NCs de ventas antiguas caigan en semanas futuras.
    const semanaDeNCAF = (diaAF: number): string => {
      if (diaAF <= 7)  return 'Semana 1 (1-7)';
      if (diaAF <= 14) return 'Semana 2 (8-14)';
      if (diaAF <= 21) return 'Semana 3 (15-21)';
      if (diaAF <= 28) return 'Semana 4 (22-28)';
      return 'Semana 5 (29-31)';
    };
    const ncPorSemana = this.agruparNCSinRefacturacion(nc => semanaDeNCAF(nc.DiaAF || 0));
    this.ventasPorSemana = config.map(s => {
      const ventas = this.filtroVentas.filter(v => {
        const dia = (v.FECHAVENTA as Date).getDate();
        return dia >= s.min && dia <= s.max;
      });
      const montoVentas = Math.round(ventas.reduce((sum, v) => sum + (v.MontoConsolidado || 0), 0));
      const montoNC = Math.round(ncPorSemana.get(s.label) || 0);
      const ops = ventas.length;
      return {
        Semana: s.label,
        MontoVentas: montoVentas,
        MontoNC: montoNC,
        MontoNeto: Math.max(0, montoVentas - montoNC),
        NroOps: ops,
        TicketPromedio: ops > 0 ? Math.round(montoVentas / ops) : 0
      };
    });
  }

  generarVentasPorEntidad(): void {
    const mapVentas = new Map<string, { monto: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const ent = this.entidadDisplay(v.Entidad);
      const cur = mapVentas.get(ent) || { monto: 0, ops: 0 };
      mapVentas.set(ent, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });
    const mapNC = this.agruparNCSinRefacturacion(nc => this.entidadDisplay(nc.Entidad));
    const rows: any[] = [];
    mapVentas.forEach((data, ent) => {
      const montoNC = Math.round(mapNC.get(ent) || 0);
      const montoNeto = Math.max(0, Math.round(data.monto) - montoNC);
      rows.push({ Entidad: ent, MontoVentas: Math.round(data.monto), MontoNC: montoNC,
        MontoNeto: montoNeto, NroOps: data.ops,
        TicketPromedio: data.ops > 0 ? Math.round(data.monto / data.ops) : 0, Participacion: 0 });
    });
    const totalNeto = rows.reduce((sum, r) => sum + r.MontoNeto, 0);
    rows.forEach(r => { r.Participacion = totalNeto > 0 ? Math.round((r.MontoNeto / totalNeto) * 1000) / 10 : 0; });
    this.ventasPorEntidad = rows.sort((a, b) => b.MontoNeto - a.MontoNeto);
    this.maxMontoEntidad = this.ventasPorEntidad.length > 0 ? this.ventasPorEntidad[0].MontoVentas : 1;
  }

  generarMotosPorEntidad(): void {
    const motos = this.filtroVentas.filter(v =>
      (v.TipoProducto || '').toString().toUpperCase().includes('MOTO'));
    const allEnts = new Set(this.filtroVentas.map(v => this.entidadDisplay(v.Entidad)));
    const map = new Map<string, { monto: number; ops: number }>();
    allEnts.forEach(e => map.set(e, { monto: 0, ops: 0 }));
    motos.forEach(v => {
      const ent = this.entidadDisplay(v.Entidad);
      const cur = map.get(ent) || { monto: 0, ops: 0 };
      map.set(ent, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });
    this.motosPorEntidad = Array.from(map, ([Entidad, d]) => ({
      Entidad, Monto: Math.round(d.monto), NroOps: d.ops
    })).sort((a, b) => b.Monto - a.Monto);
    this.maxMontoMotoEntidad = this.motosPorEntidad.length > 0 ? this.motosPorEntidad[0].Monto : 1;
  }

  generarMotosPorTipoProducto(): void {
    const motos = this.filtroVentas.filter(v =>
      (v.TipoProducto || '').toString().toUpperCase().includes('MOTO'));
    const map = new Map<string, { monto: number; ops: number }>();
    motos.forEach(v => {
      const tipo = v.TipoProducto || 'SIN TIPO';
      const cur = map.get(tipo) || { monto: 0, ops: 0 };
      map.set(tipo, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });
    this.motosPorTipoProducto = Array.from(map, ([TipoProducto, d]) => ({
      TipoProducto, Monto: Math.round(d.monto), NroOps: d.ops
    })).sort((a, b) => b.Monto - a.Monto);
    this.maxMontoMotoTipo = this.motosPorTipoProducto.length > 0 ? this.motosPorTipoProducto[0].Monto : 1;
  }

  generarVentasPorTipoCredito(): void {
    const tipoKey = (v: any): string => {
      const entidad = (v.Entidad || '').toString().trim().toUpperCase();
      return entidad === 'GLOBAL GO'
        ? 'CONTADO'
        : (v.TipoCredito || 'SIN TIPO').toString().trim().toUpperCase();
    };

    const mapVentas = new Map<string, { monto: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const tipo = tipoKey(v);
      const cur = mapVentas.get(tipo) || { monto: 0, ops: 0 };
      mapVentas.set(tipo, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });

    const mapNC = this.agruparNCSinRefacturacion(tipoKey);

    const rows: any[] = [];
    mapVentas.forEach((data, tipo) => {
      const montoNC = Math.round(mapNC.get(tipo) || 0);
      rows.push({
        TipoCredito: tipo,
        MontoVentas: Math.round(data.monto),
        MontoNC: montoNC,
        MontoNeto: Math.max(0, Math.round(data.monto) - montoNC),
        NroOps: data.ops,
        TicketPromedio: data.ops > 0 ? Math.round(data.monto / data.ops) : 0,
        Participacion: 0
      });
    });

    const totalMonto = rows.reduce((sum, r) => sum + r.MontoVentas, 0);
    rows.forEach(r => {
      r.Participacion = totalMonto > 0 ? Math.round((r.MontoVentas / totalMonto) * 1000) / 10 : 0;
    });
    rows.sort((a, b) => b.MontoVentas - a.MontoVentas);
    this.maxMontoTipoCredito = rows.length > 0 ? rows[0].MontoVentas : 1;
    this.ventasPorTipoCredito = rows;
  }

  generarVentasPorTipoBase(): void {
    const mapVentas = new Map<string, { monto: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const tipo = (v.TipoBase || 'SIN TIPO').toString().trim().toUpperCase();
      const cur = mapVentas.get(tipo) || { monto: 0, ops: 0 };
      mapVentas.set(tipo, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });

    const mapNC = this.agruparNCSinRefacturacion(nc => (nc.TipoBase || 'SIN TIPO').toString().trim().toUpperCase());

    // Metas del MES filtrado (según fechaFin del filtro).
    const fechaFin = new Date(this.formVentas.value.fechaFin);
    const mesKey = `${fechaFin.getFullYear()}-${String(fechaFin.getMonth() + 1).padStart(2, '0')}`;
    const metasMes = this.metasPorMes[mesKey] || {};

    // Se muestran todos los tipos de base que tengan ventas O meta (aunque no tengan ventas aún).
    const tipos = new Set<string>([...mapVentas.keys(), ...Object.keys(metasMes)]);

    const rows: any[] = [];
    tipos.forEach(tipo => {
      const data = mapVentas.get(tipo) || { monto: 0, ops: 0 };
      const montoNC = Math.round(mapNC.get(tipo) || 0);
      const montoNeto = Math.max(0, Math.round(data.monto) - montoNC);
      const meta = metasMes[tipo] || 0;
      rows.push({
        TipoBase: tipo,
        MontoVentas: Math.round(data.monto),
        MontoNeto: montoNeto,
        NroOps: data.ops,
        TicketPromedio: data.ops > 0 ? Math.round(data.monto / data.ops) : 0,
        Participacion: 0,
        Meta: meta,
        PorcentajeAvance: meta > 0 ? Math.round((Math.round(data.monto) / meta) * 1000) / 10 : 0
      });
    });

    const totalMonto = rows.reduce((sum, r) => sum + r.MontoVentas, 0);
    rows.forEach(r => {
      r.Participacion = totalMonto > 0 ? Math.round((r.MontoVentas / totalMonto) * 1000) / 10 : 0;
    });

    rows.sort((a, b) => b.MontoVentas - a.MontoVentas);
    this.maxMontoTipoBase = Math.max(rows[0]?.MontoVentas || 0, 1);
    this.ventasPorTipoBase = rows;

    // Cuota del mes general = suma de las metas de todos los tipos de base.
    this.totalCuotaMes = rows.reduce((s, r) => s + (r.Meta || 0), 0);
    this.totalAvanceTipoBase = this.totalCuotaMes > 0
      ? Math.round((totalMonto / this.totalCuotaMes) * 1000) / 10 : 0;
    // Participación total = 100% por definición cuando hay ventas.
    this.totalPartTipoBase = totalMonto > 0 ? 100 : 0;
  }

  generarChartEvolutivo(): void {
    const map = new Map<string, number>();
    this.dataVentas.forEach(v => {
      const f = v.FECHAVENTA as Date;
      const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + (v.MontoConsolidado || 0));
    });
    const keysOrd = Array.from(map.keys()).sort();
    this.dataEvolutivo = keysOrd.map(k => {
      const [anio, mes] = k.split('-');
      return {
        Periodo: `${this.getNombreMes(+mes).substring(0, 3).toUpperCase()} ${anio}`,
        Ventas: Math.round(map.get(k) || 0)
      };
    });
    this.seriesEvolutivoMain = ['Ventas'];
    this.seriesEvolutivoTrend = [];
  }

  generarVentasPorLineaReal(): void {
    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const map = new Map<string, { valorVenta: number; margen: number; ops: number }>();

    this.dataMargen.forEach(mr => {
      const fecha = mr.FECHAVENTA as Date;
      if (fecha < fechaInicio || fecha > fechaFin) return;
      const linea = mr.LineaReal;
      const cur = map.get(linea) || { valorVenta: 0, margen: 0, ops: 0 };
      map.set(linea, {
        valorVenta: cur.valorVenta + (mr.ValorVenta || 0),
        margen: cur.margen + (mr.MargenTotal || 0),
        ops: cur.ops + 1
      });
    });

    const rows: any[] = [];
    map.forEach((data, linea) => {
      rows.push({
        LineaReal: linea,
        ValorVenta: Math.round(data.valorVenta),
        NroOps: data.ops,
        MargenTotal: Math.round(data.margen),
        PorcentajeMargen: data.valorVenta > 0
          ? Math.round((data.margen / data.valorVenta) * 1000) / 10 : 0,
        TicketPromedio: data.ops > 0 ? Math.round(data.valorVenta / data.ops) : 0,
        Participacion: 0
      });
    });

    const totalVV = rows.reduce((s, r) => s + r.ValorVenta, 0);
    const totalMg = rows.reduce((s, r) => s + r.MargenTotal, 0);
    rows.forEach(r => {
      r.Participacion = totalVV > 0 ? Math.round((r.ValorVenta / totalVV) * 1000) / 10 : 0;
    });

    rows.sort((a, b) => b.ValorVenta - a.ValorVenta);
    this.maxValorVentaLineaReal = rows.length > 0 ? rows[0].ValorVenta : 1;
    this.ventasPorLineaReal = rows;
    this.totalPctMargenLineaReal = totalVV > 0
      ? Math.round((totalMg / totalVV) * 1000) / 10 : 0;
  }

  onCellPreparedTipoBase(e: any): void {
    if (e.rowType === 'header') {
      const esMetaCol = e.column.dataField === 'Meta' || e.column.dataField === 'PorcentajeAvance';
      e.cellElement.style.backgroundColor = esMetaCol ? '#1565C0' : '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'data') {
      if (e.column.dataField === 'Meta' || e.column.dataField === 'PorcentajeAvance') {
        e.cellElement.style.backgroundColor = '#e3f2fd';
      }
      if (e.column.dataField === 'PorcentajeAvance') {
        const pct = e.data.PorcentajeAvance || 0;
        if (pct >= 80) e.cellElement.style.color = '#2E7D32';
        else if (pct >= 50) e.cellElement.style.color = '#E65100';
        else e.cellElement.style.color = '#b71c1c';
        e.cellElement.style.fontWeight = '700';
      }
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.backgroundColor = '#f0f3fa';
    }
  }

  generarDetalleMotosGlobalGo(): void {
    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin    = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const tiposSet = new Set<string>();
    const mapVendedor = new Map<string, Map<string, { monto: number; ops: number }>>();

    this.dataGlobalGo
      .filter(v => { const f = v.FECHAVENTA as Date; return f >= fechaInicio && f <= fechaFin; })
      .forEach(v => {
        const nombre = this.resolverNombreVendedor(v.Vendedor, v.AsesorVenta);
        const tipo   = (v.TipoProducto || 'SIN TIPO').toString().trim().toUpperCase();
        tiposSet.add(tipo);
        if (!mapVendedor.has(nombre)) mapVendedor.set(nombre, new Map());
        const inner = mapVendedor.get(nombre)!;
        const cur   = inner.get(tipo) || { monto: 0, ops: 0 };
        inner.set(tipo, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
      });

    this.tiposProductoGlobalGo = Array.from(tiposSet).sort();

    this.detalleMotosGlobalGo = Array.from(mapVendedor.entries()).map(([nombre, tiposMap]) => {
      const row: any = { Vendedor: nombre, Total: 0, TotalOps: 0 };
      this.tiposProductoGlobalGo.forEach(tipo => {
        const data = tiposMap.get(tipo) || { monto: 0, ops: 0 };
        row[tipo]    = Math.round(data.monto);
        row.Total   += data.monto;
        row.TotalOps += data.ops;
      });
      row.Total = Math.round(row.Total);
      return row;
    }).sort((a, b) => b.Total - a.Total);
  }

  generarMesesGlobalGo(): void {
    const mesesSet = new Set<string>();
    this.dataGlobalGo.forEach(v => {
      const f: Date = v.FECHAVENTA;
      const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      mesesSet.add(key);
    });
    const mesesOrdenados = Array.from(mesesSet).sort().map(k => {
      const [y, m] = k.split('-');
      return { value: k, label: `${this.getNombreMes(+m)} ${y}` };
    });
    // Opción inicial "Seleccionar" (value vacío) → muestra la data general de todos los meses.
    this.mesesGlobalGo = [{ value: '', label: 'Seleccionar (Todos)' }, ...mesesOrdenados];
    // Por defecto arranca en "Seleccionar" para listar toda la data al cargar.
    this.mesSeleccionadoGlobalGo = '';
    this.filtrarGlobalGo();
  }

  filtrarGlobalGo(): void {
    if (!this.mesSeleccionadoGlobalGo) {
      this.filtroGlobalGo = [...this.dataGlobalGo];
      return;
    }
    this.filtroGlobalGo = this.dataGlobalGo.filter(v => {
      const f: Date = v.FECHAVENTA;
      const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      return key === this.mesSeleccionadoGlobalGo;
    });
  }

  onAsesorChanged(e: any) { this.actualizarFiltros(); }

  getFechaJS(excelDate: any): Date {
    if (typeof excelDate === 'number' && excelDate > 0) {
      const utc_days = Math.floor(excelDate - 25569);
      const utc_value = utc_days * 86400 * 1000;
      const date_info = new Date(utc_value);
      return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate());
    }
    const str = (excelDate || '').toString().trim();
    // Handle Peruvian DD/MM/YYYY format (not parseable by native Date constructor)
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    const parsed = new Date(str);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      return Number(value.replace(/,/g, '').replace(/[^0-9.-]+/g, '')) || 0;
    }
    return 0;
  }

  getNombreMes(mes: number): string {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[mes - 1] || '';
  }

  getSemanaDelMes(date: Date): number {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    return Math.ceil((dayOfMonth + firstDay.getDay()) / 7);
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

  exportar(): void {
    if (this.dataGrid) this.excelService.exportarDesdeGrid("ReporteVentasRealzza", this.dataGrid);
  }

  exportarGlobalGo(): void {
    if (this.gridGlobalGo) this.excelService.exportarDesdeGrid("DetalleGlobalGO", this.gridGlobalGo);
  }

  abrirPopup(tipo: string) {
    if (tipo === 'asesor') this.popupVisibleAsesor = true;
    if (tipo === 'dia') this.popupVisibleDia = true;
    if (tipo === 'nroVentas') this.popupVisibleNroVentas = true;
    if (tipo === 'ventasSemanal') this.popupVisibleVentasSemanal = true;
    if (tipo === 'ventasPorMes') this.popupVisibleVentasPorMes = true;
  }

  customizeCurrencyText(cellInfo: any) {
    return `S/. ${(cellInfo.value || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  // customizeMontoTexto = (pointInfo: any): string => {
  //   if (!pointInfo.value) return '';
  //   return Math.round(pointInfo.value).toLocaleString('en-US');
  // };

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.fontWeight = "bold";
    }
  }

  onCellPreparedResumen(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'data') {
      if (e.column.dataField === 'MontoNC' && e.data.MontoNC > 0) {
        e.cellElement.style.color = '#b71c1c';
        e.cellElement.style.fontWeight = '600';
      }
      if (e.column.dataField === 'MontoNeto') {
        e.cellElement.style.color = '#2E7D32';
        e.cellElement.style.fontWeight = '700';
      }
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.backgroundColor = '#f0f3fa';
    }
  }

  onCellPreparedMoto(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#E65100';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.backgroundColor = '#fff3e0';
    }
  }

  onCellPreparedNC(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = "#b71c1c";
      e.cellElement.style.color = "white";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.textAlign = "center";
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.backgroundColor = "#ffebee";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.color = "#b71c1c";
    }
  }



  // ─── BONOS ───────────────────────────────────────────────────────────────────

  calcularBonoVentasCampo(proyeccion: number): number {
    if (!proyeccion || proyeccion < 10000) return 0;
    for (const item of this.tablaBonos) {
      if (proyeccion >= item.monto) return item.bono;
    }
    return 0;
  }

  generarResumenBonosAsesor(): void {
    const hoy = new Date();
    const diaHoy = hoy.getDate();
    const diasMesActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const diasTranscurridos = Math.max(1, diaHoy - 1);

    const fechaFin = new Date(this.formVentas.value.fechaFin);
    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const esPasado = fechaFin.getFullYear() < hoy.getFullYear() ||
                     (fechaFin.getFullYear() === hoy.getFullYear() && fechaFin.getMonth() < hoy.getMonth());
    const diasMesSeleccionado = new Date(fechaFin.getFullYear(), fechaFin.getMonth() + 1, 0).getDate();
    const seleccionaMesCompleto =
      fechaInicio.getDate() === 1 &&
      fechaFin.getDate() === diasMesSeleccionado &&
      fechaInicio.getMonth() === fechaFin.getMonth() &&
      fechaInicio.getFullYear() === fechaFin.getFullYear();

    const mapVentas = new Map<string, { ventas: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const nombre = this.resolverNombreVendedor(v.Vendedor, v.AsesorVenta);
      const cur = mapVentas.get(nombre) || { ventas: 0, ops: 0 };
      mapVentas.set(nombre, { ventas: cur.ventas + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });

    const mapNC = this.agruparNCSinRefacturacion(nc => this.resolverNombreVendedor(nc.Vendedor, nc.AsesorVenta));

    this.tablaBonosAsesor = Array.from(mapVentas.entries()).map(([nombre, data]) => {
      const ventas = Math.round(data.ventas);
      const montoNC = Math.round(mapNC.get(nombre) || 0);
      const montoNeto = Math.max(0, ventas - montoNC);
      const ticket = data.ops > 0 ? Math.round(data.ventas / data.ops) : 0;
      let ticketDiario = 0;
      let proyeccion = 0;

      if (esPasado || seleccionaMesCompleto) {
        ticketDiario = diasMesSeleccionado > 0 ? montoNeto / diasMesSeleccionado : 0;
        proyeccion = montoNeto;
      } else {
        ticketDiario = diasTranscurridos > 0 ? montoNeto / diasTranscurridos : 0;
        proyeccion = Math.round(ticketDiario * diasMesActual);
      }

      return {
        ASESOR: nombre,
        VENTAS: ventas,
        NC: montoNC,
        NETO: montoNeto,
        TICKET: ticket,
        TICKETDIARIO: ticketDiario,
        PROYECCION: proyeccion,
        BONO: this.calcularBonoVentasCampo(proyeccion)
      };
    }).sort((a, b) => b.NETO - a.NETO);
  }

  onCellPreparedBonos(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';
    }
    if (e.rowType === 'data') {
      e.cellElement.style.border = '1px solid #ccc';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';
      if (e.column?.dataField === 'NC' && e.value > 0) {
        e.cellElement.style.setProperty('color', '#b71c1c', 'important');
      }
      if (e.column?.dataField === 'NETO') {
        e.cellElement.style.setProperty('color', '#2E7D32', 'important');
      }
      if (e.column?.dataField === 'BONO') {
        const valor = e.value;
        if (valor >= 700) {
          e.cellElement.style.setProperty('background-color', '#4CAF50', 'important');
          e.cellElement.style.color = 'black';
        } else if (valor >= 300) {
          e.cellElement.style.setProperty('background-color', '#63C967', 'important');
          e.cellElement.style.color = 'black';
        } else if (valor > 0) {
          e.cellElement.style.setProperty('background-color', '#7BD17F', 'important');
          e.cellElement.style.color = 'black';
        }
      }
    }
  }
}

interface ChartData {
  Vendedor: string;
  MontoTotal: number;
}