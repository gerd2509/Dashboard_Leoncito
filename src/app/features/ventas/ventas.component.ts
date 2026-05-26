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
    { value: 'CC19', viewValue: 'SANDOVAL OTINIANO JUANA DEL PILAR' }
  ];

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
    'CC19': 'JUANA'
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

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

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
      const evoSheet = workbook.SheetNames.find(n => n.trim().toUpperCase() === 'EVOLUTIVO');
      if (evoSheet) {
        const evoRows = XLSX.utils.sheet_to_json(workbook.Sheets[evoSheet], { raw: true }) as any[];
        const mapEvo = new Map<string, number>();
        evoRows.forEach((r: any) => {
          const keys = Object.keys(r);
          const fk = keys.find(k => k.trim().toUpperCase().replace(/\s+/g, '') === 'FECHAVENTA') || 'FECHAVENTA';
          const mk = keys.find(k => k.trim().toUpperCase().replace(/\s+/g, '') === 'MONTOCONSOLIDADO') || 'MontoConsolidado';
          const fecha = this.getFechaJS(r[fk] ?? '');
          const monto = this.parseNumber(r[mk] ?? 0);
          if (!fecha || isNaN(fecha.getTime()) || monto <= 0) return;
          const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
          mapEvo.set(key, (mapEvo.get(key) || 0) + monto);
        });
        this.dataEvolutivo = Array.from(mapEvo.keys()).sort().map(k => {
          const [anio, mes] = k.split('-');
          return { Periodo: `${this.getNombreMes(+mes).substring(0, 3).toUpperCase()} ${anio}`, Ventas: Math.round(mapEvo.get(k) || 0) };
        });
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
      const c = (v.CONTACTO || 'SIN CONTACTO').toString().trim().toUpperCase();
      if (c) tiposSet.add(c);
    });
    this.tiposBaseUnicos = Array.from(tiposSet).sort();

    // Mapa: nombre asesor → { tipoBase → monto }
    const map = new Map<string, Map<string, number>>();
    this.filtroVentas.forEach(v => {
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

  formatMontoPivot(value: number): string {
    if (!value || value <= 0) return '-';
    return `S/ ${Math.round(value).toLocaleString('es-PE')}`;
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
}
