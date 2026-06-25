import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import * as XLSX from 'xlsx';
import { DxDataGridComponent } from 'devextreme-angular';
import { ExcelExportService } from '../../services/excel/excel.service';

@Component({
  selector: 'app-ventas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.css'
})
export class VentasComponent implements OnInit {
  protected excelService = inject(ExcelExportService);

  formVentas: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  protected showFilterRow = true;
  protected currentFilter = 'auto';
  showDetailGrid = false;

  // Popups
  popupVisibleAsesor = false;
  popupVisibleDia = false;
  popupVisibleNroVentas = false;
  popupVisibleVentasSemanal = false;
  popupVisibleVentasPorMes = false;
  popupVisibleEvolutivo = false;
  popupVisibleEvolutivoTabla = false;

  // KPIs
  totalMontoVentas = 0;
  totalVentas = 0;
  ticket = 0;
  proyeccion = 0;

  // Gráficos
  chartData: { AsesorVenta: string; MontoTotal: number }[] = [];
  chartPorDia: { Dia: string; [key: string]: any }[] = [];
  chartNumeroVentasPorDia: any[] = [];
  chartMontoSemanal: any[] = [];
  chartMontoMensual: { Mes: string; MontoTotal: number }[] = [];
  semanas: string[] = [];
  semanaMap = new Map<string, string>();
  seriesMeses: string[] = [];

  // Evolutivo
  dataEvolutivo: any[] = [];
  seriesEvolutivoMain: string[] = [];
  seriesEvolutivoTrend: string[] = [];

  // Evolutivo por Tipo de Cliente (matriz: TipoCliente x Periodo)
  evolutivoPeriodos: string[] = [];
  evolutivoPorTipoCliente: any[] = [];
  evolutivoTotalesPorPeriodo: any = {};

  // Tabla bonos por asesor
  tablaBonosAsesor: any[] = [];

  readonly tablaBonos = [
    { monto: 115000, bono: 1800 }, { monto: 110000, bono: 1700 }, { monto: 105000, bono: 1600 },
    { monto: 100000, bono: 1500 }, { monto:  95000, bono: 1400 }, { monto:  90000, bono: 1300 },
    { monto:  85000, bono: 1200 }, { monto:  80000, bono: 1100 }, { monto:  75000, bono: 1000 },
    { monto:  70000, bono:  900 }, { monto:  65000, bono:  800 }, { monto:  60000, bono:  700 },
    { monto:  55000, bono:  600 }, { monto:  50000, bono:  500 }, { monto:  45000, bono:  400 },
    { monto:  40000, bono:  300 }, { monto:  35000, bono:  200 }, { monto:  30000, bono:  150 },
    { monto:  25000, bono:  100 }, { monto:  20000, bono:   75 }, { monto:  15000, bono:   50 }
  ];

  // Tablas analíticas
  ventasPorContacto: any[] = [];
  ventasPorSemana: any[] = [];
  ventasPorTipoCliente: any[] = [];
  ventasPorSede: any[] = [];
  ventasPorAsesorTipoBase: any[] = [];
  tiposBaseUnicos: string[] = [];

  maxMontoContacto = 1;
  maxMontoSede = 1;
  maxMontoTipoCliente = 1;
  maxMontoAsesorChart = 1;

  // Color distinto por barra (asesor)
  customizeAsesorPoint = (pointInfo: any) => {
    const colors = ['#1565C0', '#2E7D32', '#b71c1c', '#E65100', '#6A1B9A',
                    '#00695C', '#4E342E', '#37474F', '#AD1457', '#558B2F', '#0277BD'];
    return { color: colors[pointInfo.index % colors.length] };
  };

  customizeMontoTooltip = (arg: any) => ({
    text: `${arg.seriesName ? arg.seriesName + '\n' : ''}S/ ${Math.round(arg.value).toLocaleString('es-PE')}`
  });

  customizeMontoTexto = (arg: any) => {
    if (!arg.value) return '';
    return `S/ ${Math.round(arg.value).toLocaleString('es-PE')}`;
  };

  customizeTooltip = (info: any): any => {
    if (info.points?.length) {
      let html = `<b>${info.argumentText}</b><br/>`;
      info.points.forEach((p: any) => {
        html += `<span style="color:${p.color}">■</span> ${p.seriesName}: <b>${Math.round(p.originalValue).toLocaleString('es-PE')}</b><br/>`;
      });
      return { html };
    }
    return { text: `${info.seriesName}: ${info.valueText}` };
  };

  asesores = [
    { value: '', viewValue: 'Seleccione Asesor' },
    { value: 'CC1',  viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    { value: 'CC3',  viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'CC5',  viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6',  viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC8',  viewValue: 'CHANTA CAMPOS KELLY KARINTIA' },
    { value: 'CC12', viewValue: 'BERNAL BAZAN BRENDA NICOL' },
    { value: 'CC13', viewValue: 'CARBONEL GUERRERO FRANCIS JHON' },
    { value: 'CC11', viewValue: 'SAMAME HUAMAN ARIADNE' },
    { value: 'CC15', viewValue: 'TORRES ALVARADO JUDY ESMERALDA' },
    { value: 'CC16', viewValue: 'BONILLA CHUMACERO VILMA ROSSMERY' },
    { value: 'CC19', viewValue: 'SANDOVAL OTINIANO JUANA DEL PILAR' },
    { value: 'CC21', viewValue: 'CHANAME SOTO ANITA NOEMI' },
    { value: 'CC22', viewValue: 'BERNAL BAZAN FABRICIO ROLANDO' }
  ];

  // Asesores cuyo cap pertenece a RealZZA: su monto SÍ suma al total general,
  // pero se muestran aparte (tabla "Cap RealZZA") y se excluyen de la lista de
  // vendedores, bonos/proyección y tablas de contacto, porque su comisión es
  // distinta. Ampliar el set para sumar más asesores cap-realzza.
  private readonly capRealzzaCodes = new Set(['CC12']);

  esCapRealzza(asesorVenta: string): boolean {
    return this.capRealzzaCodes.has((asesorVenta || '').toString().trim().toUpperCase());
  }

  // Tabla separada Cap RealZZA (1 fila por asesor, desglose por sede)
  ventasCapRealzza: any[] = [];

  nombresCortos: Record<string, string> = {
    'CC1':  'PATRICIA',
    'CC3':  'FELICITA',
    'CC5':  'KAREN',
    'CC6':  'MARIA',
    'CC8':  'KELLY',
    'CC12': 'BRENDA',
    'CC13': 'FRANCIS',
    'CC11': 'ARIADNE',
    'CC15': 'ESMERALDA',
    'CC16': 'ROSMERY',
    'CC19': 'JUANA',
    'CC21': 'ANITA',
    'CC22': 'FABRICIO'
  };

  displayedColumnsOriginales = [
    { HeaderField: 'IDVENTA',          HeaderName: 'ID VENTA',           Visible: true },
    { HeaderField: 'FECHAVENTA',       HeaderName: 'FECHA VENTA',        Visible: true },
    { HeaderField: 'Sede',             HeaderName: 'SEDE',               Visible: true },
    { HeaderField: 'MontoConsolidado', HeaderName: 'MONTO CONSOLIDADO',  Visible: true },
    { HeaderField: 'CuotaInicial',     HeaderName: 'CUOTA INICIAL',      Visible: true },
    { HeaderField: 'Productos',        HeaderName: 'PRODUCTOS',          Visible: true },
    { HeaderField: 'Cuotas',           HeaderName: 'Nº CUOTAS',          Visible: true },
    { HeaderField: 'DocIdentidad',     HeaderName: 'DNI CLIENTE',        Visible: true },
    { HeaderField: 'TipoVenta',        HeaderName: 'TIPO VENTA',         Visible: true },
    { HeaderField: 'TipoBase',         HeaderName: 'TIPO BASE',          Visible: true },
    { HeaderField: 'TipoCliente',      HeaderName: 'TIPO CLIENTE',       Visible: true },
    { HeaderField: 'AsesorVenta',      HeaderName: 'ASESOR CONTACT',     Visible: true },
    { HeaderField: 'EstadoVenta',      HeaderName: 'ESTADO VENTA',       Visible: true },
    { HeaderField: 'Entidad',          HeaderName: 'ENTIDAD',            Visible: true },
    { HeaderField: 'CONTACTO',         HeaderName: 'CONTACTO',           Visible: true }
  ];

  columnasVisibles: Record<string, boolean> = {
    'IDVENTA': true, 'FECHAVENTA': true, 'Sede': true, 'MontoConsolidado': true,
    'CuotaInicial': true, 'Productos': true, 'Cuotas': true, 'DocIdentidad': true,
    'TipoVenta': true, 'TipoBase': true, 'TipoCliente': true, 'AsesorVenta': true,
    'EstadoVenta': true, 'Entidad': true, 'CONTACTO': true
  };

  tipoProducto = [
    { value: '', viewValue: 'Seleccione Producto' },
    { value: '1', viewValue: 'ELECTRO' },
    { value: '2', viewValue: 'MELAMINA' }
  ];

  @ViewChild('detailGrid', { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    this.formVentas = this.fb.group({
      fechaInicio: [firstDay, Validators.required],
      fechaFin:    [today,    Validators.required],
      Asesores:    [''],
      TipoProducto: [''],
      columnas:    []
    });
  }

  async ngOnInit() {
    this.configuracionesIniciales();
  }

  configuracionesIniciales(): void {
    this.formVentas.controls['columnas'].setValue(
      this.displayedColumnsOriginales.map(o => o.HeaderField)
    );
  }

  importar(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      const sheetName = workbook.SheetNames[0];
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

      this.dataVentas = (jsonData as any[]).map(row => ({
        IDVENTA:          row['IDVENTA'],
        FECHAVENTA:       this.getFechaJS(row['FECHAVENTA']),
        Sede:             row['Sede'],
        MontoConsolidado: this.parseNumber(row['MontoConsolidado']),
        CuotaInicial:     this.parseNumber(row['CuotaInicial']),
        Productos:        row['Productos'],
        Cuotas:           row['Cuotas'],
        DocIdentidad:     row['DocIdentidad'],
        TipoVenta:        row['TipoVenta'],
        TipoBase:         row['TipoBase'],
        TipoCliente:      row['TipoCliente'],
        AsesorVenta:      row['AsesorVenta'],
        EstadoVenta:      row['EstadoVenta'],
        Entidad:          row['Entidad'],
        CONTACTO:         row['CONTACTO']
      }));

      // Leer hoja EVOLUTIVO
      this.dataEvolutivo = [];
      this.seriesEvolutivoMain = ['Ventas'];
      this.seriesEvolutivoTrend = [];
      this.evolutivoPeriodos = [];
      this.evolutivoPorTipoCliente = [];
      this.evolutivoTotalesPorPeriodo = {};
      const evoSheet = workbook.SheetNames.find(n => n.trim().toUpperCase() === 'EVOLUTIVO');
      if (evoSheet) {
        const evoRows = XLSX.utils.sheet_to_json(workbook.Sheets[evoSheet], { raw: true }) as any[];
        const mapEvo = new Map<string, number>();                  // periodoKey -> total
        const pivot = new Map<string, Map<string, number>>();      // TipoCliente -> (periodoKey -> monto)
        const periodKeys = new Set<string>();
        evoRows.forEach((r: any) => {
          const keys = Object.keys(r);
          const fk = keys.find(k => k.trim().toUpperCase().replace(/\s+/g, '') === 'FECHAVENTA') || 'FECHAVENTA';
          const mk = keys.find(k => k.trim().toUpperCase().replace(/\s+/g, '') === 'MONTOCONSOLIDADO') || 'MontoConsolidado';
          const tk = keys.find(k => k.trim().toUpperCase().replace(/\s+/g, '') === 'TIPOCLIENTE') || 'TipoCliente';
          const fecha = this.getFechaJS(r[fk] ?? '');
          const monto = this.parseNumber(r[mk] ?? 0);
          if (!fecha || isNaN(fecha.getTime()) || monto <= 0) return;
          const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
          mapEvo.set(key, (mapEvo.get(key) || 0) + monto);
          periodKeys.add(key);

          const tipo = (r[tk] ?? '').toString().trim().toUpperCase() || 'SIN TIPO';
          if (!pivot.has(tipo)) pivot.set(tipo, new Map());
          const inner = pivot.get(tipo)!;
          inner.set(key, (inner.get(key) || 0) + monto);
        });

        const sortedKeys = Array.from(periodKeys).sort();
        this.evolutivoPeriodos = sortedKeys.map(k => {
          const [anio, mes] = k.split('-');
          return `${this.getNombreMes(+mes).substring(0, 3).toUpperCase()} ${anio}`;
        });

        // Datos del gráfico (total por periodo)
        this.dataEvolutivo = sortedKeys.map((k, i) => ({
          Periodo: this.evolutivoPeriodos[i],
          Ventas: Math.round(mapEvo.get(k) || 0)
        }));

        // Matriz por Tipo de Cliente
        const lastKey = sortedKeys[sortedKeys.length - 1];
        const rows: any[] = [];
        pivot.forEach((periodMap, tipo) => {
          const row: any = { TipoCliente: tipo };
          sortedKeys.forEach((k, i) => { row[this.evolutivoPeriodos[i]] = Math.round(periodMap.get(k) || 0); });
          row['ProyeccionCierre'] = Math.round(this.getProyeccionEvolutivo(periodMap.get(lastKey) || 0, lastKey));
          rows.push(row);
        });
        rows.sort((a, b) => a.TipoCliente.localeCompare(b.TipoCliente));
        this.evolutivoPorTipoCliente = rows;

        // Fila de totales
        const totals: any = { TipoCliente: 'TOTAL' };
        this.evolutivoPeriodos.forEach(p => { totals[p] = rows.reduce((s, r) => s + (r[p] || 0), 0); });
        totals['ProyeccionCierre'] = rows.reduce((s, r) => s + (r.ProyeccionCierre || 0), 0);
        this.evolutivoTotalesPorPeriodo = totals;
      }

      this.actualizarFiltros();
      event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  onAsesorChanged(_e: any)       { if (this.formVentas.valid) this.aplicarFiltros(); }
  onTipoProductoChanged(_e: any) { if (this.formVentas.valid) this.aplicarFiltros(); }

  actualizarFiltros(): void {
    if (!this.formVentas.valid) return;
    this.aplicarFiltros();
  }

  aplicarFiltros(): void {
    const selectedAsesor   = (this.formVentas.value.Asesores || '').toString().trim().toUpperCase();
    const selectedTipoProd = this.formVentas.value.TipoProducto;

    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin    = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    this.filtroVentas = this.dataVentas.filter(v => {
      const fv = new Date(v.FECHAVENTA);
      if (fv < fechaInicio || fv > fechaFin) return false;
      const asesor = (v.AsesorVenta || '').toString().trim().toUpperCase();
      if (selectedAsesor && asesor !== selectedAsesor) return false;
      if (selectedTipoProd === '1') return v.TipoProducto !== 'LEO' && v.TipoProducto !== 'DSK.';
      if (selectedTipoProd === '2') return v.TipoProducto === 'LEO' || v.TipoProducto === 'DSK.';
      return true;
    });

    this.calcularKPIs();
    this.generarChartData();
    this.generarChartMontoPorDia();
    this.generarChartNroVentasPorDia();
    this.generarChartMontoSemanal();
    this.generarChartMontoMensual();
    this.generarVentasPorContacto();
    this.generarVentasPorSemana();
    this.generarVentasPorTipoCliente();
    this.generarVentasPorSede();
    this.generarVentasPorAsesorTipoBase();
    this.generarResumenBonosAsesor();
    this.generarVentasCapRealzza();
  }

  calcularKPIs(): void {
    this.totalVentas      = this.filtroVentas.length;
    const rawTotal        = this.filtroVentas.reduce((s, v) => s + v.MontoConsolidado, 0);
    this.totalMontoVentas = Math.round(rawTotal);
    this.ticket           = this.totalVentas ? Math.round(this.totalMontoVentas / this.totalVentas) : 0;

    const hoy      = new Date();
    const fechaFin = new Date(this.formVentas.value.fechaFin);
    const esPasado = fechaFin.getFullYear() < hoy.getFullYear() ||
                     (fechaFin.getFullYear() === hoy.getFullYear() && fechaFin.getMonth() < hoy.getMonth());
    if (esPasado) {
      this.proyeccion = this.totalMontoVentas;
    } else {
      const diasMes           = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const diasTranscurridos = Math.max(1, hoy.getDate());
      this.proyeccion         = Math.round((rawTotal / diasTranscurridos) * diasMes);
    }
  }

  getProyeccionCierre(monto: number): number {
    const hoy = new Date();
    const fechaFin = new Date(this.formVentas.value.fechaFin);
    const esPasado = fechaFin.getFullYear() < hoy.getFullYear() ||
                     (fechaFin.getFullYear() === hoy.getFullYear() && fechaFin.getMonth() < hoy.getMonth());
    if (esPasado) return monto;
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const diasTranscurridos = Math.max(1, hoy.getDate());
    return (monto / diasTranscurridos) * diasMes;
  }

  // ─── GRÁFICOS ────────────────────────────────────────────────────────────────

  generarChartData(): void {
    const map = new Map<string, number>();
    for (const v of this.filtroVentas) {
      if (this.esCapRealzza(v.AsesorVenta)) continue;
      const id = (v.AsesorVenta || '').toString().trim();
      map.set(id, (map.get(id) || 0) + (v.MontoConsolidado || 0));
    }
    this.chartData = Array.from(map, ([id, total]) => ({
      AsesorVenta: this.nombresCortos[id] || (this.asesores.find(a => a.value === id)?.viewValue ?? id),
      MontoTotal:  Math.round(total)
    })).sort((a, b) => b.MontoTotal - a.MontoTotal);
    this.maxMontoAsesorChart = this.chartData.length > 0 ? this.chartData[0].MontoTotal : 1;
  }

  generarChartMontoPorDia(): void {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const mapSemana = new Map<string, Map<string, number>>();
    const allSemanas = new Set<string>();
    this.filtroVentas.forEach(v => {
      const f = v.FECHAVENTA as Date;
      const dia = dias[f.getDay()];
      const sem = this.getSemanaISO(f);
      allSemanas.add(sem);
      if (!mapSemana.has(dia)) mapSemana.set(dia, new Map());
      const inner = mapSemana.get(dia)!;
      inner.set(sem, (inner.get(sem) || 0) + v.MontoConsolidado);
    });
    const semsOrd = Array.from(allSemanas).sort();
    this.semanas = semsOrd.map((s, i) => `Semana ${i + 1}`);
    this.semanaMap.clear();
    semsOrd.forEach((s, i) => this.semanaMap.set(s, `Semana ${i + 1}`));
    this.chartPorDia = dias.map(dia => {
      const item: any = { Dia: dia };
      mapSemana.get(dia)?.forEach((val, semIso) => {
        item[this.semanaMap.get(semIso)!] = Math.round(val);
      });
      return item;
    });
  }

  generarChartNroVentasPorDia(): void {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sabado'];
    const mapSemana = new Map<string, Map<string, number>>();
    const allSemanas = new Set<string>();
    this.filtroVentas.forEach(v => {
      if (!v.MontoConsolidado || v.MontoConsolidado <= 0) return;
      const f = v.FECHAVENTA as Date;
      const dia = dias[f.getDay()];
      const sem = this.getSemanaISO(f);
      allSemanas.add(sem);
      if (!mapSemana.has(dia)) mapSemana.set(dia, new Map());
      const inner = mapSemana.get(dia)!;
      inner.set(sem, (inner.get(sem) || 0) + 1);
    });
    const semsOrd = Array.from(allSemanas).sort();
    this.semanas = semsOrd.map((s, i) => `Semana ${i + 1}`);
    this.semanaMap.clear();
    semsOrd.forEach((s, i) => this.semanaMap.set(s, `Semana ${i + 1}`));
    this.chartNumeroVentasPorDia = dias.map(dia => {
      const item: any = { Dia: dia };
      mapSemana.get(dia)?.forEach((val, semIso) => {
        item[this.semanaMap.get(semIso)!] = val;
      });
      return item;
    });
  }

  generarChartMontoSemanal(): void {
    const map = new Map<string, Map<string, number>>();
    const allMeses = new Set<string>();
    const allSemanas = new Set<string>();
    this.filtroVentas.forEach(v => {
      if (!v.MontoConsolidado || v.MontoConsolidado <= 0) return;
      const f = v.FECHAVENTA as Date;
      const mes = `${this.getNombreMes(f.getMonth() + 1)} ${f.getFullYear()}`;
      const sem = `Semana ${this.getSemanaDelMes(f)}`;
      allMeses.add(mes);
      allSemanas.add(sem);
      if (!map.has(sem)) map.set(sem, new Map());
      const inner = map.get(sem)!;
      inner.set(mes, Math.round((inner.get(mes) || 0) + v.MontoConsolidado));
    });
    this.seriesMeses = Array.from(allMeses);
    const semsOrd = Array.from(allSemanas).sort((a, b) => +a.split(' ')[1] - +b.split(' ')[1]);
    this.chartMontoSemanal = semsOrd.map(sem => {
      const item: any = { Semana: sem };
      this.seriesMeses.forEach(m => { item[m] = map.get(sem)?.get(m) || 0; });
      return item;
    });
  }

  generarChartMontoMensual(): void {
    const map = new Map<string, number>();
    this.filtroVentas.forEach(v => {
      if (!v.MontoConsolidado || v.MontoConsolidado <= 0) return;
      const f = v.FECHAVENTA as Date;
      const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + v.MontoConsolidado);
    });
    this.chartMontoMensual = Array.from(map.keys()).sort().map(k => {
      const [anio, mes] = k.split('-');
      return { Mes: `${this.getNombreMes(+mes)} ${anio}`, MontoTotal: Math.round(map.get(k) || 0) };
    });
  }

  // ─── TABLAS ANALÍTICAS ───────────────────────────────────────────────────────

  generarVentasPorContacto(): void {
    const map = new Map<string, { monto: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      if (this.esCapRealzza(v.AsesorVenta)) return;
      const c = (v.CONTACTO || 'SIN CONTACTO').toString().trim().toUpperCase();
      const cur = map.get(c) || { monto: 0, ops: 0 };
      map.set(c, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });
    const rows: any[] = [];
    map.forEach((d, c) => rows.push({
      Contacto: c,
      MontoVentas: Math.round(d.monto),
      NroOps: d.ops,
      TicketPromedio: d.ops > 0 ? Math.round(d.monto / d.ops) : 0,
      Participacion: 0,
      ProyeccionCierre: this.getProyeccionCierre(d.monto)
    }));
    const total = rows.reduce((acc, r) => acc + r.MontoVentas, 0);
    rows.forEach(r => { r.Participacion = total > 0 ? (r.MontoVentas / total) * 100 : 0; });
    rows.sort((a, b) => b.MontoVentas - a.MontoVentas);
    this.maxMontoContacto = rows.length > 0 ? rows[0].MontoVentas : 1;
    this.ventasPorContacto = rows;
  }

  generarVentasPorSemana(): void {
    const config = [
      { label: 'Semana 1 (1-7)',   min: 1,  max: 7  },
      { label: 'Semana 2 (8-14)',  min: 8,  max: 14 },
      { label: 'Semana 3 (15-21)', min: 15, max: 21 },
      { label: 'Semana 4 (22-28)', min: 22, max: 28 },
      { label: 'Semana 5 (29-31)', min: 29, max: 31 }
    ];
    this.ventasPorSemana = config.map(s => {
      const ventas = this.filtroVentas.filter(v => {
        const dia = (v.FECHAVENTA as Date).getDate();
        return dia >= s.min && dia <= s.max;
      });
      const monto = Math.round(ventas.reduce((sum, v) => sum + (v.MontoConsolidado || 0), 0));
      return {
        Semana: s.label,
        MontoVentas: monto,
        NroOps: ventas.length,
        TicketPromedio: ventas.length > 0 ? Math.round(monto / ventas.length) : 0
      };
    });
  }

  generarVentasPorTipoCliente(): void {
    const map = new Map<string, { monto: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const t = (v.TipoCliente || 'SIN TIPO').toString().trim().toUpperCase();
      const cur = map.get(t) || { monto: 0, ops: 0 };
      map.set(t, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });
    const rows: any[] = [];
    map.forEach((d, t) => rows.push({
      TipoCliente: t,
      MontoVentas: Math.round(d.monto),
      NroOps: d.ops,
      TicketPromedio: d.ops > 0 ? Math.round(d.monto / d.ops) : 0,
      Participacion: 0,
      ProyeccionCierre: this.getProyeccionCierre(d.monto)
    }));
    const total = rows.reduce((acc, r) => acc + r.MontoVentas, 0);
    rows.forEach(r => { r.Participacion = total > 0 ? (r.MontoVentas / total) * 100 : 0; });
    rows.sort((a, b) => b.MontoVentas - a.MontoVentas);
    this.maxMontoTipoCliente = rows.length > 0 ? rows[0].MontoVentas : 1;
    this.ventasPorTipoCliente = rows;
  }

  generarVentasPorSede(): void {
    const map = new Map<string, { monto: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const sede = (v.Sede || 'SIN SEDE').toString().trim().toUpperCase();
      const cur = map.get(sede) || { monto: 0, ops: 0 };
      map.set(sede, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });
    const rows: any[] = [];
    map.forEach((d, sede) => rows.push({
      Sede: sede,
      MontoVentas: Math.round(d.monto),
      NroOps: d.ops,
      TicketPromedio: d.ops > 0 ? Math.round(d.monto / d.ops) : 0,
      Participacion: 0,
      ProyeccionCierre: this.getProyeccionCierre(d.monto)
    }));
    const total = rows.reduce((acc, r) => acc + r.MontoVentas, 0);
    rows.forEach(r => { r.Participacion = total > 0 ? (r.MontoVentas / total) * 100 : 0; });
    rows.sort((a, b) => b.MontoVentas - a.MontoVentas);
    this.maxMontoSede = rows.length > 0 ? rows[0].MontoVentas : 1;
    this.ventasPorSede = rows;
  }

  generarVentasPorAsesorTipoBase(): void {
    // Recolectar todos los tipos de base únicos ordenados
    const tiposSet = new Set<string>();
    this.filtroVentas.forEach(v => {
      if (this.esCapRealzza(v.AsesorVenta)) return;
      const c = (v.CONTACTO || 'SIN CONTACTO').toString().trim().toUpperCase();
      if (c) tiposSet.add(c);
    });
    this.tiposBaseUnicos = Array.from(tiposSet).sort();

    // Mapa: nombre asesor → { tipoBase → monto }
    const map = new Map<string, Map<string, number>>();
    this.filtroVentas.forEach(v => {
      if (this.esCapRealzza(v.AsesorVenta)) return;
      const id      = (v.AsesorVenta || '').toString().trim();
      const nombre  = this.nombresCortos[id] || (this.asesores.find(a => a.value === id)?.viewValue ?? id);
      const tipo    = (v.CONTACTO || 'SIN CONTACTO').toString().trim().toUpperCase();
      if (!map.has(nombre)) map.set(nombre, new Map());
      const inner = map.get(nombre)!;
      inner.set(tipo, (inner.get(tipo) || 0) + (v.MontoConsolidado || 0));
    });

    // Construir filas pivote
    const rows: any[] = [];
    map.forEach((tiposMap, nombre) => {
      const row: any = { Asesor: nombre };
      let total = 0;
      let rawTotal = 0;
      this.tiposBaseUnicos.forEach(tipo => {
        const raw = tiposMap.get(tipo) || 0;
        row[tipo] = Math.round(raw);
        total += Math.round(raw);
        rawTotal += raw;
      });
      row['Total'] = total;
      row['ProyeccionCierre'] = this.getProyeccionCierre(rawTotal);
      rows.push(row);
    });

    rows.sort((a, b) => b.Total - a.Total);
    this.ventasPorAsesorTipoBase = rows;
  }

  // Tabla "Cap RealZZA": una fila por asesor cap-realzza, con su monto
  // desglosado entre ventas de la sede RealZZA y ventas de otras sedes.
  generarVentasCapRealzza(): void {
    const map = new Map<string, { realzza: number; otras: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const id = (v.AsesorVenta || '').toString().trim().toUpperCase();
      if (!this.esCapRealzza(id)) return;
      const nombre = this.nombresCortos[id] || (this.asesores.find(a => a.value === id)?.viewValue ?? id);
      const esRealzza = (v.Sede || '').toString().trim().toUpperCase().includes('REALZZA');
      const cur = map.get(nombre) || { realzza: 0, otras: 0, ops: 0 };
      if (esRealzza) cur.realzza += (v.MontoConsolidado || 0);
      else           cur.otras   += (v.MontoConsolidado || 0);
      cur.ops += 1;
      map.set(nombre, cur);
    });
    this.ventasCapRealzza = Array.from(map.entries()).map(([nombre, d]) => ({
      Asesor: nombre,
      VentasRealzza: Math.round(d.realzza),
      VentasOtrasSedes: Math.round(d.otras),
      Total: Math.round(d.realzza + d.otras),
      NroOps: d.ops
    })).sort((a, b) => b.Total - a.Total);
  }

  formatMontoPivot(value: number): string {
    if (!value || value <= 0) return '-';
    return `S/ ${Math.round(value).toLocaleString('es-PE')}`;
  }

  formatEvoMonto(value: number): string {
    if (!value || value <= 0) return 'S/  -';
    return `S/ ${Math.round(value).toLocaleString('es-PE')}`;
  }

  // Proyección de cierre del último mes con data:
  // (monto del último mes / días transcurridos) × días del último mes.
  getProyeccionEvolutivo(monto: number, periodKey: string): number {
    if (!monto || monto <= 0) return 0;
    const [anio, mes] = periodKey.split('-').map(Number);
    const diasMes = new Date(anio, mes, 0).getDate();          // días del último mes con data
    const diasTranscurridos = Math.max(1, new Date().getDate()); // días transcurridos del mes en curso
    return (monto / diasTranscurridos) * diasMes;
  }

  // ─── UTILIDADES ──────────────────────────────────────────────────────────────

  getFechaJS(excelDate: any): Date {
    if (typeof excelDate === 'number' && excelDate > 0) {
      const utc_days  = Math.floor(excelDate - 25569);
      const date_info = new Date(utc_days * 86400 * 1000);
      return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate());
    }
    const str  = (excelDate || '').toString().trim();
    const dmy  = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    const parsed = new Date(str);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value.replace(/,/g, '').replace(/[^0-9.-]+/g, '')) || 0;
    return 0;
  }

  getNombreMes(mes: number): string {
    return ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
            'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes - 1] || '';
  }

  getSemanaDelMes(date: Date): number {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    return Math.ceil((date.getDate() + firstDay.getDay()) / 7);
  }

  getSemanaISO(date: Date): string {
    const tmp = new Date(date.getTime());
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
    const ft = new Date(tmp.getFullYear(), 0, 4);
    ft.setDate(ft.getDate() + 3 - ((ft.getDay() + 6) % 7));
    const week = 1 + Math.round(((tmp.getTime() - ft.getTime()) / 86400000 - 3 + ((ft.getDay() + 6) % 7)) / 7);
    return `${tmp.getFullYear()}-W${week.toString().padStart(2, '0')}`;
  }

  onColumnsChange() {
    const sel = this.formVentas.controls['columnas'].value;
    this.displayedColumnsOriginales.forEach(c => { c.Visible = sel.includes(c.HeaderField); });
    Object.keys(this.columnasVisibles).forEach(k => { this.columnasVisibles[k] = sel.includes(k); });
  }

  abrirPopup(tipo: string) {
    if (tipo === 'asesor')        this.popupVisibleAsesor = true;
    if (tipo === 'dia')           this.popupVisibleDia = true;
    if (tipo === 'nroVentas')     this.popupVisibleNroVentas = true;
    if (tipo === 'ventasSemanal') this.popupVisibleVentasSemanal = true;
    if (tipo === 'ventasPorMes')  this.popupVisibleVentasPorMes = true;
  }

  customizeCurrencyText = (cell: any): string => {
    if (typeof cell.value === 'number') {
      return `S/. ${cell.value.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return '';
  };

  exportar(): void {
    if (this.dataGrid) this.excelService.exportarDesdeGrid('ReporteVentas', this.dataGrid);
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
  }

  onCellPreparedAsesorTipoBase(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#1e2d50';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.padding = '10px 8px';
    }
    if (e.rowType === 'data' && e.column.dataField === 'Total') {
      e.cellElement.style.fontWeight = '800';
      e.cellElement.style.color = '#1a3a6b';
      e.cellElement.style.backgroundColor = '#eef2f9';
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.backgroundColor = '#f0f3fa';
      e.cellElement.style.textAlign = 'center';
    }
  }

  onCellPreparedResumen(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.backgroundColor = '#f0f3fa';
    }
  }

  // ─── BONOS ───────────────────────────────────────────────────────────────────

  calcularBonoVentas(proyeccion: number): number {
    if (!proyeccion || proyeccion < 15000) return 0;
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

    const map = new Map<string, { ventas: number; ops: number }>();
    for (const v of this.filtroVentas) {
      const id = (v.AsesorVenta || '').toString().trim();
      if (!id) continue;
      if (this.esCapRealzza(id)) continue;
      const cur = map.get(id) || { ventas: 0, ops: 0 };
      map.set(id, { ventas: cur.ventas + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    }

    this.tablaBonosAsesor = Array.from(map.entries()).map(([id, data]) => {
      const nombre = this.nombresCortos[id] || (this.asesores.find(a => a.value === id)?.viewValue ?? id);
      const ventas = Math.round(data.ventas);
      const ticket = data.ops > 0 ? Math.round(data.ventas / data.ops) : 0;
      let ticketDiario = 0;
      let proyeccion = 0;

      if (esPasado || seleccionaMesCompleto) {
        ticketDiario = diasMesSeleccionado > 0 ? ventas / diasMesSeleccionado : 0;
        proyeccion = ventas;
      } else {
        ticketDiario = diasTranscurridos > 0 ? ventas / diasTranscurridos : 0;
        proyeccion = Math.round(ticketDiario * diasMesActual);
      }

      return {
        ASESOR: nombre,
        VENTAS: ventas,
        TICKET: ticket,
        TICKETDIARIO: ticketDiario,
        PROYECCION: proyeccion,
        BONO: this.calcularBonoVentas(proyeccion)
      };
    }).sort((a, b) => b.VENTAS - a.VENTAS);
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
