import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { ExcelExportService } from '../../services/excel/excel.service';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular';
import { forkJoin } from 'rxjs';
import * as XLSX from 'xlsx';

interface ResumenSede {
  SedeKey: string;
  Sede: string;
  MontoVentas: number;
  MontoNC: number;
  MontoINC: number;
  MontoNeto: number;
  NroOps: number;
  TicketPromedio: number;
  Participacion: number;
  Color: string;
}

@Component({
  selector: 'app-ventas-sedes',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './ventas-sedes.component.html',
  styleUrl: './ventas-sedes.component.css'
})
export class VentasSedesComponent implements OnInit {
  protected excelService = inject(ExcelExportService);
  private auth = inject(AuthService);
  private sedeConfig = inject(SedeConfigService);
  private ventasSvc = inject(CargaVentasService);

  // Carga de datos desde PostgreSQL (reemplaza la importación de Excel).
  cargando = false;
  errorCarga = '';
  private anioCargado = 0;

  formVentas: UntypedFormGroup;

  // ── Selección de sede ──
  esGlobal = false;                 // admin o sede = 'todas' → puede elegir cualquier sede
  sedeForzada = '';                 // sede del usuario logueado (no admin)
  sedeSeleccionada = '';            // '' = vista principal (resumen por sede)
  sedesDisponibles: { key: string; nombre: string; color: string }[] = [];

  dataVentas: any[] = [];
  dataNotasCredito: any[] = [];
  dataIncautaciones: any[] = [];
  dataGlobalGo: any[] = [];
  dataMargen: any[] = [];   // filas de margen_ventas (una por línea de producto)

  // Ventas por Línea Real (desde margen_ventas)
  ventasPorLineaReal: any[] = [];
  maxValorVentaLineaReal = 1;
  totalPctMargenLineaReal = 0;
  ventasPorLineaRealGlobal: any[] = [];
  maxValorVentaLineaRealGlobal = 1;
  totalPctMargenLineaRealGlobal = 0;
  customizePctMargenLineaTotal = (_: any) => `${this.totalPctMargenLineaReal.toFixed(1)}%`;
  customizePctMargenLineaGlobalTotal = (_: any) => `${this.totalPctMargenLineaRealGlobal.toFixed(1)}%`;

  // Date-filtered (todas las sedes) → base para el resumen general
  private ventasFecha: any[] = [];
  private ncFecha: any[] = [];
  private incFecha: any[] = [];

  // Sede actual (filtrado por sede + fecha)
  filtroVentas: any[] = [];
  filtroNotasCredito: any[] = [];
  filtroNotasCreditoVisible: any[] = [];   // Solo NC con MontoConsolidado > 0 (para el grid)
  filtroIncautaciones: any[] = [];
  filtroGlobalGo: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  // Popups
  popupVisibleAsesor: boolean = false;
  popupVisibleDia: boolean = false;
  popupVisibleNroVentas: boolean = false;
  popupVisibleVentasSemanal: boolean = false;
  popupVisibleVentasPorMes: boolean = false;
  popupVisibleEvolutivo: boolean = false;

  // ── Resumen por sede (vista principal) ──
  resumenPorSede: ResumenSede[] = [];
  maxMontoSede = 1;
  totalGeneral = { monto: 0, nc: 0, inc: 0, neto: 0, ops: 0, ticket: 0, sedes: 0 };
  chartPorSede: { Sede: string; MontoNeto: number }[] = [];
  private colorPorNombre: Record<string, string> = {};

  // KPIs (sede seleccionada)
  totalMontoVentas = 0;
  totalVentas = 0;
  ticket = 0;
  proyeccion = 0;
  totalNotasCredito = 0;
  totalMontoRefacturacion = 0;
  totalIncautaciones = 0;
  montoRealVentas = 0;

  // Data Gráficos
  chartData: ChartData[] = [];
  chartPorDia: { Dia: string, [key: string]: any }[] = [];
  chartNumeroVentasPorDia: any[] = [];
  chartMontoSemanal: any[] = [];
  chartMontoMensual: { Mes: string; MontoTotal: number }[] = [];

  // Global GO motos detalle
  detalleMotosGlobalGo: any[] = [];
  tiposProductoGlobalGo: string[] = [];
  mesesGlobalGo: { label: string; value: string }[] = [];
  mesSeleccionadoGlobalGo = '';

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
  showDetailGrid = false;
  showNCGrid = false;
  showINCGrid = false;

  dataEvolutivo: any[] = [];
  seriesEvolutivoMain: string[] = ['Ventas'];
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

  // Vendedores presentes en la sede seleccionada (filtro dinámico)
  vendedores: string[] = [];

  // ── Colores por sede ──
  private readonly coloresSede: Record<string, string> = {
    motupe:     '#1565C0',
    olmos:      '#00695C',
    ferrenafe:  '#6A1B9A',
    jayanca:    '#E65100',
    mochumi:    '#2E7D32',
    morrope:    '#AD1457',
    lambayeque: '#283593',
    oyotun:     '#558B2F',
    cayalti:    '#00838F',
    chongoyape: '#4E342E',
  };
  private readonly paletaFallback = ['#1565C0', '#2E7D32', '#b71c1c', '#E65100', '#6A1B9A',
                                     '#00695C', '#4E342E', '#37474F', '#AD1457', '#558B2F', '#0277BD'];

  // Color distinto por barra (gráfico vendedor)
  customizeVendedorPoint = (pointInfo: any) => {
    return { color: this.paletaFallback[pointInfo.index % this.paletaFallback.length] };
  };

  // Color por sede en el gráfico de resumen
  customizeSedePoint = (pointInfo: any) => {
    return { color: this.colorPorNombre[pointInfo.argument] || this.colorSedeActual };
  };

  // Tooltip con formato S/ sin decimales
  customizeMontoTooltip = (arg: any) => ({
    text: `${arg.seriesName ? arg.seriesName + '\n' : ''}S/ ${Math.round(arg.value).toLocaleString('es-PE')}`
  });

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;
  @ViewChild('gridGlobalGo', { static: false }) gridGlobalGo!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    this.formVentas = this.fb.group({
      fechaInicio: [firstDay, Validators.required],
      fechaFin: [today, Validators.required],
      Vendedor: ['']
    });
  }

  ngOnInit() {
    const u = this.auth.getUsuario();
    this.esGlobal = !u || u.rol === 'admin' || u.sede.toLowerCase() === 'todas';
    if (!this.esGlobal && u) {
      this.sedeForzada = this.sedeConfig.normalizar(u.sede);
      this.sedeSeleccionada = this.sedeForzada;
    }
    // Carga inicial desde la base (año de la fecha fin seleccionada).
    this.cargarVentas();
  }

  /**
   * Trae las ventas del año seleccionado desde PostgreSQL y las reparte en
   * dataVentas / dataNotasCredito / dataIncautaciones / dataGlobalGo (misma
   * estructura que producía la importación de Excel). Luego aplica los filtros.
   */
  cargarVentas(anio?: number): void {
    const y = anio ?? new Date(this.formVentas.value.fechaFin).getFullYear();
    this.cargando = true;
    this.errorCarga = '';
    forkJoin({
      ventas: this.ventasSvc.obtenerVentas(y),
      margen: this.ventasSvc.obtenerMargen(y),
    }).subscribe({
      next: ({ ventas, margen }) => {
        this.procesarFilasBackend(ventas || []);
        this.procesarMargenBackend(margen || []);
        this.anioCargado = y;
        this.cargando = false;
        this.construirSedesDisponibles();
        this.aplicarFiltros();
      },
      error: (err) => {
        this.cargando = false;
        this.errorCarga = err?.error?.message ?? 'No se pudo cargar la información de ventas desde la base.';
      },
    });
  }

  /** Convierte las filas de margen_ventas a la forma que usa Ventas por Línea Real. */
  private procesarMargenBackend(rows: any[]): void {
    this.dataMargen = [];
    rows.forEach((row: any) => {
      const sedeKey = this.resolverSedeKey((row.sede || '').toString());
      if (!sedeKey) return;
      const fstr = (row.fecha || '').toString().slice(0, 10);     // YYYY-MM-DD (sin desfase de zona)
      const [fy, fm, fd] = fstr.split('-').map((n: string) => Number(n));
      const fecha = fy ? new Date(fy, (fm || 1) - 1, fd || 1) : null;
      this.dataMargen.push({
        FECHAVENTA: fecha,
        SedeKey: sedeKey,
        LineaReal: (row.linea_real || 'SIN LÍNEA').toString().trim().toUpperCase(),
        ValorVenta: this.parseNumber(row.valor_venta),
        MargenTotal: this.parseNumber(row.margen_total),
      });
    });
  }

  /**
   * Agrupa el margen por LÍNEA REAL en el rango de fechas. Si soloSede se indica,
   * limita a esa sede (vista detalle); si es null, toma todas las sedes visibles
   * (vista general/global).
   */
  private calcularLineaReal(soloSede: string | null): { rows: any[]; maxVV: number; totalPct: number } {
    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);
    const visibles = new Set(this.sedesDisponibles.map(s => s.key));

    const map = new Map<string, { valorVenta: number; margen: number; ops: number }>();
    this.dataMargen.forEach(mr => {
      const f = mr.FECHAVENTA as Date;
      if (!f || f < fechaInicio || f > fechaFin) return;
      if (soloSede) { if (mr.SedeKey !== soloSede) return; }
      else if (visibles.size > 0 && !visibles.has(mr.SedeKey)) return;
      const linea = mr.LineaReal;
      const cur = map.get(linea) || { valorVenta: 0, margen: 0, ops: 0 };
      map.set(linea, {
        valorVenta: cur.valorVenta + (mr.ValorVenta || 0),
        margen: cur.margen + (mr.MargenTotal || 0),
        ops: cur.ops + 1,
      });
    });

    const rows: any[] = [];
    map.forEach((data, linea) => {
      rows.push({
        LineaReal: linea,
        ValorVenta: Math.round(data.valorVenta),
        NroOps: data.ops,
        MargenTotal: Math.round(data.margen),
        PorcentajeMargen: data.valorVenta > 0 ? Math.round((data.margen / data.valorVenta) * 1000) / 10 : 0,
        TicketPromedio: data.ops > 0 ? Math.round(data.valorVenta / data.ops) : 0,
        Participacion: 0,
      });
    });
    const totalVV = rows.reduce((s, r) => s + r.ValorVenta, 0);
    const totalMg = rows.reduce((s, r) => s + r.MargenTotal, 0);
    rows.forEach(r => { r.Participacion = totalVV > 0 ? Math.round((r.ValorVenta / totalVV) * 1000) / 10 : 0; });
    rows.sort((a, b) => b.ValorVenta - a.ValorVenta);
    return {
      rows,
      maxVV: rows.length > 0 ? rows[0].ValorVenta : 1,
      totalPct: totalVV > 0 ? Math.round((totalMg / totalVV) * 1000) / 10 : 0,
    };
  }

  generarVentasPorLineaReal(): void {
    const r = this.calcularLineaReal(this.sedeSeleccionada);
    this.ventasPorLineaReal = r.rows;
    this.maxValorVentaLineaReal = r.maxVV;
    this.totalPctMargenLineaReal = r.totalPct;
  }

  generarVentasPorLineaRealGlobal(): void {
    const r = this.calcularLineaReal(null);
    this.ventasPorLineaRealGlobal = r.rows;
    this.maxValorVentaLineaRealGlobal = r.maxVV;
    this.totalPctMargenLineaRealGlobal = r.totalPct;
  }

  /**
   * Convierte las filas de la tabla `ventas` (snake_case) a la misma forma que
   * antes producía importar() desde el Excel, separando por EstadoVenta.
   */
  private procesarFilasBackend(rows: any[]): void {
    this.dataVentas = [];
    this.dataNotasCredito = [];
    this.dataIncautaciones = [];
    this.dataGlobalGo = [];

    rows.forEach((row: any) => {
      const sedeRaw = (row.sede || '').toString().trim();
      const sedeKey = this.resolverSedeKey(sedeRaw);
      if (!sedeKey) return;

      const estadoVenta = (row.estado_venta || '').toString().trim().toUpperCase();
      const entidad = (row.entidad || '').toString().trim().toUpperCase();
      const monto = this.parseNumber(row.monto_consolidado);
      const esNC = estadoVenta === 'NOTA DE CRÉDITO' || estadoVenta === 'NOTA DE CREDITO';
      const esINC = estadoVenta === 'INCAUTACIÓN' || estadoVenta === 'INCAUTACION';

      const fecha = this.fechaDesdePartes(row.anio_cv, row.mes_cv, row.dia_cv);
      const sedeNombre = this.sedeConfig.getConfig(sedeKey)?.nombre ?? sedeRaw;

      if (!esNC && !esINC && monto > 0) {
        this.dataVentas.push({
          IDVENTA: row.codigo_cv,
          FECHAVENTA: fecha,
          SedeKey: sedeKey,
          Sede: sedeNombre,
          MontoConsolidado: monto,
          CuotaInicial: this.parseNumber(row.cuota_inicial),
          Productos: row.productos,
          Cuotas: row.cuotas,
          DocIdentidad: (row.doc_identidad || '').toString().trim(),
          ClienteVenta: row.cliente_venta,
          Vendedor: (row.vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase(),
          EstadoVenta: row.estado_venta,
          Entidad: row.entidad,
          AsesorVenta: '',                       // no existe en la fuente Postgres
          TipoCredito: row.tipo_credito,
          TipoProducto: row.estado_tipo_producto, // aproximación (la fuente no trae TipoProducto)
        });
      }

      if (esNC) {
        this.dataNotasCredito.push({
          IDVENTA: row.codigo_cv,
          FECHAVENTA: fecha,
          SedeKey: sedeKey,
          Sede: sedeNombre,
          MontoConsolidado: Math.abs(monto),
          Productos: row.productos,
          ClienteVenta: row.cliente_venta,
          DocIdentidad: (row.doc_identidad || '').toString().trim(),
          Vendedor: (row.vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase(),
          EstadoVenta: row.estado_venta,
          AsesorVenta: '',
          Entidad: row.entidad,
          TipoCredito: row.tipo_credito,
          DiaAF: this.parseNumber(row.dia_af),
          MesAF: this.parseNumber(row.mes_af),
          AñoAF: this.parseNumber(row.anio_af),
        });
      }

      if (esINC) {
        this.dataIncautaciones.push({
          IDVENTA: row.codigo_cv,
          FECHAVENTA: fecha,
          SedeKey: sedeKey,
          Sede: sedeNombre,
          MontoConsolidado: Math.abs(monto),
          Productos: row.productos,
          ClienteVenta: row.cliente_venta,
          DocIdentidad: (row.doc_identidad || '').toString().trim(),
          Vendedor: (row.vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase(),
          EstadoVenta: row.estado_venta,
          AsesorVenta: '',
          Entidad: row.entidad,
          TipoCredito: row.tipo_credito,
          DiaAF: this.parseNumber(row.dia_af),
          MesAF: this.parseNumber(row.mes_af),
          AñoAF: this.parseNumber(row.anio_af),
        });
      }

      if (entidad === 'GLOBAL GO' && !esNC && !esINC && monto > 0) {
        this.dataGlobalGo.push({
          ClienteVenta: row.cliente_venta,
          DocIdentidad: row.doc_identidad,
          FECHAVENTA: fecha,
          SedeKey: sedeKey,
          Sede: sedeNombre,
          MontoConsolidado: monto,
          Productos: row.productos,
          TipoProducto: (row.estado_tipo_producto || 'SIN TIPO').toString().trim().toUpperCase(),
          Vendedor: (row.vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase(),
          AsesorVenta: '',
        });
      }
    });

    console.log(`✅ [PG] Ventas: ${this.dataVentas.length} | NC: ${this.dataNotasCredito.length} | INC: ${this.dataIncautaciones.length} | GO: ${this.dataGlobalGo.length}`);
  }

  /** Construye una fecha JS a partir de las partes dia/mes/anio de la tabla. */
  private fechaDesdePartes(anio: any, mes: any, dia: any): Date {
    const yy = Number(anio) || 0;
    const mm = Number(mes) || 1;
    const dd = Number(dia) || 1;
    return new Date(yy, mm - 1, dd);
  }

  get colorSedeActual(): string {
    return this.sedeSeleccionada ? this.colorSede(this.sedeSeleccionada) : '#1A5FAD';
  }

  get nombreSedeActual(): string {
    const cfg = this.sedeConfig.getConfig(this.sedeSeleccionada);
    return cfg?.nombre ?? this.sedeSeleccionada;
  }

  colorSede(key: string): string {
    return this.coloresSede[this.sedeConfig.normalizar(key)] ?? '#1A5FAD';
  }

  /**
   * Convierte el valor de la columna Sede ("SEDE RELENOR CAYALTI") a la clave
   * normalizada del registro de sedes ("cayalti"). Devuelve '' si no es una sede
   * conocida, para que esas filas se descarten.
   */
  private resolverSedeKey(sedeRaw: string): string {
    const limpio = (sedeRaw || '').replace(/^\s*SEDE\s+RELENOR\s+/i, '').trim();
    const key = this.sedeConfig.normalizar(limpio);
    return this.sedeConfig.existeSede(key) ? key : '';
  }

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

      this.dataVentas = [];
      this.dataNotasCredito = [];
      this.dataIncautaciones = [];
      this.dataGlobalGo = [];

      jsonData.forEach((row: any) => {
        const sedeRaw = (row['Sede'] || '').toString().trim();
        // La columna Sede llega como "SEDE RELENOR <NOMBRE>". Se extrae el nombre y se
        // valida contra el registro de sedes: solo se toman las sedes conocidas.
        const sedeKey = this.resolverSedeKey(sedeRaw);
        if (!sedeKey) return;

        const estadoVenta = (row['EstadoVenta'] || '').toString().trim().toUpperCase();
        const entidad = (row['Entidad'] || '').toString().trim().toUpperCase();
        const monto = this.parseNumber(row['MontoConsolidado']);
        const esNC = estadoVenta === 'NOTA DE CRÉDITO' || estadoVenta === 'NOTA DE CREDITO';
        const esINC = estadoVenta === 'INCAUTACIÓN' || estadoVenta === 'INCAUTACION';

        const sedeNombre = this.sedeConfig.getConfig(sedeKey)?.nombre ?? sedeRaw;

        if (!esNC && !esINC && monto > 0) {
          this.dataVentas.push({
            IDVENTA: row['IDVENTA'],
            FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
            SedeKey: sedeKey,
            Sede: sedeNombre,
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
          });
        }

        // Notas de Crédito con las 3 columnas AF
        if (esNC) {
          this.dataNotasCredito.push({
            IDVENTA: row['IDVENTA'],
            FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
            SedeKey: sedeKey,
            Sede: sedeNombre,
            MontoConsolidado: Math.abs(monto),
            Productos: row['Productos'],
            ClienteVenta: row['ClienteVenta'],
            DocIdentidad: (row['DocIdentidad'] || '').toString().trim(),
            Vendedor: (row['Vendedor'] || 'SIN VENDEDOR').toString().trim().toUpperCase(),
            EstadoVenta: row['EstadoVenta'],
            AsesorVenta: row['AsesorVenta'],
            Entidad: row['Entidad'],
            TipoCredito: row['TipoCredito'],
            DiaAF: this.parseNumber(row['DiaAF']),
            MesAF: this.parseNumber(row['MesAF']),
            AñoAF: this.parseNumber(row['AñoAF'])
          });
        }

        // Incautaciones — misma lógica AF que las NC; restan del monto de ventas.
        if (esINC) {
          this.dataIncautaciones.push({
            IDVENTA: row['IDVENTA'],
            FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
            SedeKey: sedeKey,
            Sede: sedeNombre,
            MontoConsolidado: Math.abs(monto),
            Productos: row['Productos'],
            ClienteVenta: row['ClienteVenta'],
            DocIdentidad: (row['DocIdentidad'] || '').toString().trim(),
            Vendedor: (row['Vendedor'] || 'SIN VENDEDOR').toString().trim().toUpperCase(),
            EstadoVenta: row['EstadoVenta'],
            AsesorVenta: row['AsesorVenta'],
            Entidad: row['Entidad'],
            TipoCredito: row['TipoCredito'],
            DiaAF: this.parseNumber(row['DiaAF']),
            MesAF: this.parseNumber(row['MesAF']),
            AñoAF: this.parseNumber(row['AñoAF'])
          });
        }

        // Ventas Global GO
        if (entidad === 'GLOBAL GO' && !esNC && !esINC && monto > 0) {
          this.dataGlobalGo.push({
            ClienteVenta: row['ClienteVenta'],
            DocIdentidad: row['DocIdentidad'],
            FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
            SedeKey: sedeKey,
            Sede: sedeNombre,
            MontoConsolidado: monto,
            Productos: row['Productos'],
            TipoProducto: (row['TipoProducto'] || 'SIN TIPO').toString().trim().toUpperCase(),
            Vendedor: (row['Vendedor'] || 'SIN VENDEDOR').toString().trim().toUpperCase(),
            AsesorVenta: (row['AsesorVenta'] || '').toString().trim()
          });
        }
      });

      console.log(`✅ Ventas: ${this.dataVentas.length} | NC: ${this.dataNotasCredito.length} | INC: ${this.dataIncautaciones.length} | GO: ${this.dataGlobalGo.length}`);
      this.construirSedesDisponibles();
      this.actualizarFiltros();
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
  }

  private construirSedesDisponibles(): void {
    const keysEnData = new Set(this.dataVentas.map(v => v.SedeKey));
    let keys = Array.from(keysEnData);

    // Seguridad: usuario no global solo ve su sede
    if (!this.esGlobal) {
      keys = keys.filter(k => k === this.sedeForzada);
      if (!keys.includes(this.sedeForzada)) keys.push(this.sedeForzada);
    }

    this.sedesDisponibles = keys
      .map(k => ({ key: k, nombre: this.sedeConfig.getConfig(k)?.nombre ?? k.toUpperCase(), color: this.colorSede(k) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Para usuario no global, fijar su sede como seleccionada
    if (!this.esGlobal) this.sedeSeleccionada = this.sedeForzada;
  }

  seleccionarSede(key: string): void {
    this.sedeSeleccionada = key;
    this.formVentas.patchValue({ Vendedor: '' }, { emitEvent: false });
    this.actualizarFiltros();
  }

  volverResumen(): void {
    if (!this.esGlobal) return;
    this.sedeSeleccionada = '';
    this.actualizarFiltros();
  }

  onSedeChanged(_: any): void {
    this.formVentas.patchValue({ Vendedor: '' }, { emitEvent: false });
    this.actualizarFiltros();
  }

  actualizarFiltros(): void {
    if (!this.formVentas.valid) return;
    // Si cambió el año de la fecha fin, recargamos desde la base; si no, solo re-filtramos.
    const anio = new Date(this.formVentas.value.fechaFin).getFullYear();
    if (anio !== this.anioCargado) {
      this.cargarVentas(anio);
    } else {
      this.aplicarFiltros();
    }
  }

  aplicarFiltros(): void {
    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    // 1) Date-filter de TODAS las sedes (base del resumen general)
    this.ventasFecha = this.dataVentas.filter(v => {
      const f = new Date(v.FECHAVENTA);
      return f >= fechaInicio && f <= fechaFin;
    });
    this.calcularNotasCreditoFecha(fechaInicio, fechaFin);
    this.calcularIncautacionesFecha(fechaInicio, fechaFin);
    this.generarResumenPorSede();
    this.generarVentasPorLineaRealGlobal();

    // 2) Si no hay sede seleccionada → solo vista principal
    if (!this.sedeSeleccionada) {
      this.limpiarDetalle();
      return;
    }

    // 3) Detalle de la sede seleccionada
    const vend = (this.formVentas.value.Vendedor || '').toString().trim().toUpperCase();
    this.filtroVentas = this.ventasFecha.filter(v =>
      v.SedeKey === this.sedeSeleccionada && (!vend || v.Vendedor.includes(vend)));
    this.filtroNotasCredito = this.ncFecha.filter(nc =>
      nc.SedeKey === this.sedeSeleccionada && (!vend || nc.Vendedor.includes(vend)));
    this.filtroNotasCreditoVisible = this.filtroNotasCredito.filter(nc => (nc.MontoConsolidado || 0) > 0);
    this.filtroIncautaciones = this.incFecha.filter(inc =>
      inc.SedeKey === this.sedeSeleccionada && (!vend || inc.Vendedor.includes(vend)));

    this.construirVendedores();
    this.calcularKPIs();
    this.generarEvolutivo();
    this.generarChartData();
    this.generarResumenPorVendedor();
    this.generarVentasPorSemana();
    this.generarVentasPorEntidad();
    this.generarMotosPorEntidad();
    this.generarMotosPorTipoProducto();
    this.generarDetalleMotosGlobalGo();
    this.generarVentasPorTipoCredito();
    this.generarVentasPorLineaReal();
    this.generarChartMontoPorDia();
    this.generarChartNroVentasPorDia();
    this.generarChartMontoSemanal();
    this.generarChartMontoMensual();
    this.generarTablaVentasPorDiaMesActual();
    this.generarTablaOperacionesPorDiaMesActual();
    this.generarResumenBonosAsesor();
    this.generarMesesGlobalGo();
  }

  private limpiarDetalle(): void {
    this.filtroVentas = [];
    this.filtroNotasCredito = [];
    this.filtroNotasCreditoVisible = [];
    this.filtroIncautaciones = [];
    this.filtroGlobalGo = [];
  }

  /**
   * Date-filtra las INCAUTACIONES con la misma lógica AF que las NC. No tienen
   * refacturación: siempre restan del monto de ventas.
   */
  private calcularIncautacionesFecha(fechaInicio: Date, fechaFin: Date): void {
    const anioSeleccionado = fechaFin.getFullYear();
    const mesSeleccionado = fechaFin.getMonth() + 1;

    this.incFecha = this.dataIncautaciones.filter(inc => {
      const tieneAF = inc.AñoAF > 0 && inc.MesAF > 0;
      if (tieneAF) return inc.AñoAF === anioSeleccionado && inc.MesAF === mesSeleccionado;
      const fechaInc = inc.FECHAVENTA as Date;
      return fechaInc >= fechaInicio && fechaInc <= fechaFin;
    });
  }

  /** Agrupa el monto de las incautaciones de la sede actual por keyFn. */
  private agruparINC(keyFn: (inc: any) => string): Map<string, number> {
    const map = new Map<string, number>();
    this.filtroIncautaciones.forEach(inc => {
      const key = keyFn(inc);
      map.set(key, (map.get(key) || 0) + (inc.MontoConsolidado || 0));
    });
    return map;
  }

  /**
   * Date-filtra las NC (con lógica AF) y marca la refacturación.
   * La NC SIEMPRE se resta; solo NO se resta (se considera refacturación) cuando
   * la venta nueva ocurre en el MISMO mes que se está viendo. Si la refactura cae
   * en otro mes, su venta no está en filtroVentas → la NC debe restarse completa.
   * La refacturación se detecta dentro de la misma sede para evitar cruces.
   */
  private calcularNotasCreditoFecha(fechaInicio: Date, fechaFin: Date): void {
    const anioSeleccionado = fechaFin.getFullYear();
    const mesSeleccionado = fechaFin.getMonth() + 1;

    this.ncFecha = this.dataNotasCredito
      .filter(nc => {
        const tieneAF = nc.AñoAF > 0 && nc.MesAF > 0;
        if (tieneAF) return nc.AñoAF === anioSeleccionado && nc.MesAF === mesSeleccionado;
        const fechaNC = nc.FECHAVENTA as Date;
        return fechaNC >= fechaInicio && fechaNC <= fechaFin;
      })
      .map(nc => {
        // La refacturación SOLO cuenta si la NC es del mes en curso Y su venta
        // nueva también. Una NC de un mes anterior (arrastrada por AF al mes en
        // curso) refacturada ahora NO es refacturación → simplemente se resta.
        const fNC = nc.FECHAVENTA as Date;
        const ncDelMes = fNC.getFullYear() === anioSeleccionado && fNC.getMonth() + 1 === mesSeleccionado;
        const esRefacturacion = ncDelMes && !!nc.DocIdentidad && this.dataVentas.some(v => {
          if (v.SedeKey !== nc.SedeKey) return false;
          if (v.DocIdentidad !== nc.DocIdentidad) return false;
          if (v.IDVENTA === nc.IDVENTA) return false;
          if (v.FECHAVENTA < nc.FECHAVENTA) return false;
          // La venta refacturada debe pertenecer al mes que se está viendo.
          const f = v.FECHAVENTA as Date;
          return f.getFullYear() === anioSeleccionado && f.getMonth() + 1 === mesSeleccionado;
        });
        return {
          ...nc,
          esRefacturacion,
          MontoRefacturacion: esRefacturacion ? nc.MontoConsolidado : 0
        };
      });
  }

  /**
   * Agrupa el monto de NC por keyFn EXCLUYENDO las refacturadas (su venta nueva
   * ya está sumada en filtroVentas, restarlas sería doble descuento).
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

  // ─── VISTA PRINCIPAL: RESUMEN POR SEDE ───────────────────────────────────────
  generarResumenPorSede(): void {
    const mapVentas = new Map<string, { monto: number; ops: number; nombre: string }>();
    this.ventasFecha.forEach(v => {
      const cur = mapVentas.get(v.SedeKey) || { monto: 0, ops: 0, nombre: v.Sede };
      mapVentas.set(v.SedeKey, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1, nombre: v.Sede });
    });

    // NC puras (sin refacturación) por sede
    const mapNC = new Map<string, number>();
    this.ncFecha.forEach(nc => {
      if (nc.esRefacturacion) return;
      mapNC.set(nc.SedeKey, (mapNC.get(nc.SedeKey) || 0) + (nc.MontoConsolidado || 0));
    });

    // Incautaciones por sede (siempre restan)
    const mapINC = new Map<string, number>();
    this.incFecha.forEach(inc => {
      mapINC.set(inc.SedeKey, (mapINC.get(inc.SedeKey) || 0) + (inc.MontoConsolidado || 0));
    });

    // Restringir a sedes visibles para el usuario
    const visibles = new Set(this.sedesDisponibles.map(s => s.key));

    const rows: ResumenSede[] = [];
    mapVentas.forEach((data, key) => {
      if (visibles.size > 0 && !visibles.has(key)) return;
      const montoNC = Math.round(mapNC.get(key) || 0);
      const montoINC = Math.round(mapINC.get(key) || 0);
      const monto = Math.round(data.monto);
      rows.push({
        SedeKey: key,
        Sede: data.nombre,
        MontoVentas: monto,
        MontoNC: montoNC,
        MontoINC: montoINC,
        MontoNeto: Math.max(0, monto - montoNC - montoINC),
        NroOps: data.ops,
        TicketPromedio: data.ops > 0 ? Math.round(data.monto / data.ops) : 0,
        Participacion: 0,
        Color: this.colorSede(key)
      });
    });

    const totalNeto = rows.reduce((s, r) => s + r.MontoNeto, 0);
    rows.forEach(r => { r.Participacion = totalNeto > 0 ? Math.round((r.MontoNeto / totalNeto) * 1000) / 10 : 0; });
    rows.sort((a, b) => b.MontoNeto - a.MontoNeto);

    this.resumenPorSede = rows;
    this.maxMontoSede = rows.length > 0 ? rows[0].MontoVentas : 1;

    this.colorPorNombre = {};
    rows.forEach(r => { this.colorPorNombre[r.Sede] = r.Color; });
    this.chartPorSede = rows.map(r => ({ Sede: r.Sede, MontoNeto: r.MontoNeto }));

    this.totalGeneral = {
      monto: rows.reduce((s, r) => s + r.MontoVentas, 0),
      nc: rows.reduce((s, r) => s + r.MontoNC, 0),
      inc: rows.reduce((s, r) => s + r.MontoINC, 0),
      neto: totalNeto,
      ops: rows.reduce((s, r) => s + r.NroOps, 0),
      ticket: 0,
      sedes: rows.length
    };
    this.totalGeneral.ticket = this.totalGeneral.ops > 0
      ? Math.round(this.totalGeneral.monto / this.totalGeneral.ops) : 0;
  }

  onResumenSedeClick(e: any): void {
    if (e.rowType === 'data' && e.data?.SedeKey) this.seleccionarSede(e.data.SedeKey);
  }

  private construirVendedores(): void {
    const set = new Set<string>();
    this.dataVentas
      .filter(v => v.SedeKey === this.sedeSeleccionada)
      .forEach(v => set.add(v.Vendedor));
    this.vendedores = Array.from(set).sort();
  }

  private nombreVendedor(v: any): string {
    return (v.Vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase();
  }

  calcularKPIs(): void {
    this.totalVentas = this.filtroVentas.length;
    this.totalMontoVentas = Math.round(this.filtroVentas.reduce((sum, v) => sum + v.MontoConsolidado, 0));
    this.totalNotasCredito = Math.round(this.filtroNotasCredito.reduce((sum, nc) => sum + nc.MontoConsolidado, 0));
    this.totalMontoRefacturacion = Math.round(this.filtroNotasCredito.reduce((sum, nc) => sum + (nc.MontoRefacturacion || 0), 0));
    this.totalIncautaciones = Math.round(this.filtroIncautaciones.reduce((sum, inc) => sum + (inc.MontoConsolidado || 0), 0));
    this.montoRealVentas = this.totalMontoVentas - this.totalNotasCredito + this.totalMontoRefacturacion - this.totalIncautaciones;
    this.ticket = this.totalVentas > 0 ? Math.round(this.totalMontoVentas / this.totalVentas) : 0;

    const hoy = new Date();
    const fechaFinFiltro = new Date(this.formVentas.value.fechaFin);
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();
    const anioFiltro = fechaFinFiltro.getFullYear();
    const mesFiltro = fechaFinFiltro.getMonth();
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

  /**
   * Evolutivo construido desde la data principal de la sede (todas las fechas),
   * agrupado por mes y neteado por NC puras (sin refacturación) de cada mes.
   */
  generarEvolutivo(): void {
    const ventasSede = this.dataVentas.filter(v => v.SedeKey === this.sedeSeleccionada);
    const map = new Map<string, number>();
    ventasSede.forEach(v => {
      const f = v.FECHAVENTA as Date;
      const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + (v.MontoConsolidado || 0));
    });

    // NC puras por mes (excluye refacturadas). Cada NC se resta del mes al que
    // pertenece; solo NO se resta si su venta nueva cae en ESE MISMO mes.
    const ncSede = this.dataNotasCredito.filter(nc => nc.SedeKey === this.sedeSeleccionada);
    const ncMap = new Map<string, number>();
    ncSede.forEach(nc => {
      const baseFecha = (nc.AñoAF > 0 && nc.MesAF > 0)
        ? new Date(nc.AñoAF, nc.MesAF - 1, 1)
        : (nc.FECHAVENTA as Date);
      const anioBase = baseFecha.getFullYear();
      const mesBase = baseFecha.getMonth();
      // Solo es refacturación si la NC pertenece de verdad a ese mes por su
      // propia fecha (no arrastrada por AF desde un mes anterior) Y su venta
      // nueva cae en ese mismo mes. Si no, la NC se resta.
      const fNC = nc.FECHAVENTA as Date;
      const ncDelMesBase = fNC.getFullYear() === anioBase && fNC.getMonth() === mesBase;
      const esRefacturacion = ncDelMesBase && !!nc.DocIdentidad && ventasSede.some(v => {
        if (v.DocIdentidad !== nc.DocIdentidad) return false;
        if (v.IDVENTA === nc.IDVENTA) return false;
        if (v.FECHAVENTA < nc.FECHAVENTA) return false;
        const f = v.FECHAVENTA as Date;
        return f.getFullYear() === anioBase && f.getMonth() === mesBase;
      });
      if (esRefacturacion) return;
      const key = `${anioBase}-${String(mesBase + 1).padStart(2, '0')}`;
      ncMap.set(key, (ncMap.get(key) || 0) + (nc.MontoConsolidado || 0));
    });

    // Incautaciones por mes (siempre restan, según su mes AF/fecha).
    const incSede = this.dataIncautaciones.filter(inc => inc.SedeKey === this.sedeSeleccionada);
    const incMap = new Map<string, number>();
    incSede.forEach(inc => {
      const baseFecha = (inc.AñoAF > 0 && inc.MesAF > 0)
        ? new Date(inc.AñoAF, inc.MesAF - 1, 1)
        : (inc.FECHAVENTA as Date);
      const key = `${baseFecha.getFullYear()}-${String(baseFecha.getMonth() + 1).padStart(2, '0')}`;
      incMap.set(key, (incMap.get(key) || 0) + (inc.MontoConsolidado || 0));
    });

    this.dataEvolutivo = Array.from(map.keys()).sort().map(k => {
      const monto = Math.max(0, (map.get(k) || 0) - (ncMap.get(k) || 0) - (incMap.get(k) || 0));
      const [anio, mes] = k.split('-');
      return {
        Periodo: `${this.getNombreMes(+mes).substring(0, 3).toUpperCase()} ${anio}`,
        Ventas: Math.round(monto)
      };
    });
    this.seriesEvolutivoMain = ['Ventas'];
    this.seriesEvolutivoTrend = [];
  }

  generarChartData(): void {
    const map = new Map<string, number>();
    this.filtroVentas.forEach(v => {
      const nombre = this.nombreVendedor(v);
      map.set(nombre, (map.get(nombre) || 0) + (v.MontoConsolidado || 0));
    });
    this.agruparNCSinRefacturacion(nc => this.nombreVendedor(nc))
      .forEach((monto, nombre) => map.set(nombre, (map.get(nombre) || 0) - monto));
    this.agruparINC(inc => this.nombreVendedor(inc))
      .forEach((monto, nombre) => map.set(nombre, (map.get(nombre) || 0) - monto));

    this.chartData = Array.from(map, ([name, total]) => ({
      Vendedor: name,
      MontoTotal: Math.max(0, Math.round(total))
    })).sort((a, b) => b.MontoTotal - a.MontoTotal);
  }

  customizeMontoTexto = (arg: any) => `S/ ${arg.valueText}`;

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
      if (inner) inner.forEach((val, keySemana) => { item[mapAlias.get(keySemana)!] = Math.round(val); });
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
      if (inner) inner.forEach((val, keySemana) => { item[mapAlias.get(keySemana)!] = val; });
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
      this.seriesMeses.forEach(m => { item[m] = Math.round(map.get(sem)?.get(m) || 0); });
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

    const ajusteNeto = (this.totalNotasCredito - this.totalMontoRefacturacion) + this.totalIncautaciones;
    if (ajusteNeto > 0) {
      const hoy = new Date();
      const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
      if (map.has(mesActualKey)) map.set(mesActualKey, Math.max(0, (map.get(mesActualKey) || 0) - ajusteNeto));
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
      const nombre = this.nombreVendedor(v);
      const cur = mapVentas.get(nombre) || { monto: 0, ops: 0 };
      mapVentas.set(nombre, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });

    const mapNC = this.agruparNCSinRefacturacion(nc => this.nombreVendedor(nc));
    const mapINC = this.agruparINC(inc => this.nombreVendedor(inc));

    const rows: any[] = [];
    mapVentas.forEach((data, nombre) => {
      const montoNC = mapNC.get(nombre) || 0;
      const montoINC = mapINC.get(nombre) || 0;
      const montoNeto = Math.max(0, data.monto - montoNC - montoINC);
      rows.push({
        Vendedor: nombre,
        MontoVentas: Math.round(data.monto),
        MontoNC: Math.round(montoNC),
        MontoINC: Math.round(montoINC),
        MontoNeto: Math.round(montoNeto),
        NroOps: data.ops,
        TicketPromedio: data.ops > 0 ? Math.round(data.monto / data.ops) : 0,
        Participacion: 0
      });
    });

    const totalNeto = rows.reduce((sum, r) => sum + r.MontoNeto, 0);
    rows.forEach(r => { r.Participacion = totalNeto > 0 ? Math.round((r.MontoNeto / totalNeto) * 1000) / 10 : 0; });

    this.resumenPorVendedor = rows.sort((a, b) => b.MontoNeto - a.MontoNeto);
    this.maxMontoVendedor = this.resumenPorVendedor.length > 0 ? this.resumenPorVendedor[0].MontoVentas : 1;
  }

  // Entidad TAL CUAL: a diferencia de ventas-campo, no se mapea LEONCITO → REALZZA.
  private entidadDisplay(e: string): string {
    return (e || '').toString().trim().toUpperCase() || 'SIN ENTIDAD';
  }

  generarVentasPorSemana(): void {
    const config = [
      { label: 'Semana 1 (1-7)',   min: 1,  max: 7  },
      { label: 'Semana 2 (8-14)',  min: 8,  max: 14 },
      { label: 'Semana 3 (15-21)', min: 15, max: 21 },
      { label: 'Semana 4 (22-28)', min: 22, max: 28 },
      { label: 'Semana 5 (29-31)', min: 29, max: 31 },
    ];
    const semanaDeNCAF = (diaAF: number): string => {
      if (diaAF <= 7)  return 'Semana 1 (1-7)';
      if (diaAF <= 14) return 'Semana 2 (8-14)';
      if (diaAF <= 21) return 'Semana 3 (15-21)';
      if (diaAF <= 28) return 'Semana 4 (22-28)';
      return 'Semana 5 (29-31)';
    };
    const ncPorSemana = this.agruparNCSinRefacturacion(nc => semanaDeNCAF(nc.DiaAF || 0));
    const incPorSemana = this.agruparINC(inc => semanaDeNCAF(inc.DiaAF || 0));
    this.ventasPorSemana = config.map(s => {
      const ventas = this.filtroVentas.filter(v => {
        const dia = (v.FECHAVENTA as Date).getDate();
        return dia >= s.min && dia <= s.max;
      });
      const montoVentas = Math.round(ventas.reduce((sum, v) => sum + (v.MontoConsolidado || 0), 0));
      const montoNC = Math.round(ncPorSemana.get(s.label) || 0);
      const montoINC = Math.round(incPorSemana.get(s.label) || 0);
      const ops = ventas.length;
      return {
        Semana: s.label,
        MontoVentas: montoVentas,
        MontoNC: montoNC,
        MontoNeto: Math.max(0, montoVentas - montoNC - montoINC),
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
    const mapINC = this.agruparINC(inc => this.entidadDisplay(inc.Entidad));
    const rows: any[] = [];
    mapVentas.forEach((data, ent) => {
      const montoNC = Math.round(mapNC.get(ent) || 0);
      const montoINC = Math.round(mapINC.get(ent) || 0);
      const montoNeto = Math.max(0, Math.round(data.monto) - montoNC - montoINC);
      rows.push({ Entidad: ent, MontoVentas: Math.round(data.monto), MontoNC: montoNC, MontoINC: montoINC,
        MontoNeto: montoNeto, NroOps: data.ops,
        TicketPromedio: data.ops > 0 ? Math.round(data.monto / data.ops) : 0, Participacion: 0 });
    });
    const totalNeto = rows.reduce((sum, r) => sum + r.MontoNeto, 0);
    rows.forEach(r => { r.Participacion = totalNeto > 0 ? Math.round((r.MontoNeto / totalNeto) * 1000) / 10 : 0; });
    this.ventasPorEntidad = rows.sort((a, b) => b.MontoNeto - a.MontoNeto);
    this.maxMontoEntidad = this.ventasPorEntidad.length > 0 ? this.ventasPorEntidad[0].MontoVentas : 1;
  }

  generarMotosPorEntidad(): void {
    const motos = this.filtroVentas.filter(v => (v.TipoProducto || '').toString().toUpperCase().includes('MOTO'));
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
    const motos = this.filtroVentas.filter(v => (v.TipoProducto || '').toString().toUpperCase().includes('MOTO'));
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

  // ⚠️ A diferencia de ventas-campo: el TIPO CRÉDITO se usa TAL CUAL.
  // No se mapea GLOBAL GO → CONTADO.
  generarVentasPorTipoCredito(): void {
    const tipoKey = (v: any): string => (v.TipoCredito || 'SIN TIPO').toString().trim().toUpperCase();

    const mapVentas = new Map<string, { monto: number; ops: number }>();
    this.filtroVentas.forEach(v => {
      const tipo = tipoKey(v);
      const cur = mapVentas.get(tipo) || { monto: 0, ops: 0 };
      mapVentas.set(tipo, { monto: cur.monto + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });

    const mapNC = this.agruparNCSinRefacturacion(tipoKey);
    const mapINC = this.agruparINC(tipoKey);

    const rows: any[] = [];
    mapVentas.forEach((data, tipo) => {
      const montoNC = Math.round(mapNC.get(tipo) || 0);
      const montoINC = Math.round(mapINC.get(tipo) || 0);
      rows.push({
        TipoCredito: tipo,
        MontoVentas: Math.round(data.monto),
        MontoNC: montoNC,
        MontoINC: montoINC,
        MontoNeto: Math.max(0, Math.round(data.monto) - montoNC - montoINC),
        NroOps: data.ops,
        TicketPromedio: data.ops > 0 ? Math.round(data.monto / data.ops) : 0,
        Participacion: 0
      });
    });

    const totalMonto = rows.reduce((sum, r) => sum + r.MontoVentas, 0);
    rows.forEach(r => { r.Participacion = totalMonto > 0 ? Math.round((r.MontoVentas / totalMonto) * 1000) / 10 : 0; });
    rows.sort((a, b) => b.MontoVentas - a.MontoVentas);
    this.maxMontoTipoCredito = rows.length > 0 ? rows[0].MontoVentas : 1;
    this.ventasPorTipoCredito = rows;
  }

  generarDetalleMotosGlobalGo(): void {
    const fechaInicio = new Date(this.formVentas.value.fechaInicio);
    const fechaFin    = new Date(this.formVentas.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const tiposSet = new Set<string>();
    const mapVendedor = new Map<string, Map<string, { monto: number; ops: number }>>();

    this.dataGlobalGo
      .filter(v => v.SedeKey === this.sedeSeleccionada)
      .filter(v => { const f = v.FECHAVENTA as Date; return f >= fechaInicio && f <= fechaFin; })
      .forEach(v => {
        const nombre = this.nombreVendedor(v);
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
    const goSede = this.dataGlobalGo.filter(v => v.SedeKey === this.sedeSeleccionada);
    const mesesSet = new Set<string>();
    goSede.forEach(v => {
      const f: Date = v.FECHAVENTA;
      mesesSet.add(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`);
    });
    const mesesOrdenados = Array.from(mesesSet).sort().map(k => {
      const [y, m] = k.split('-');
      return { value: k, label: `${this.getNombreMes(+m)} ${y}` };
    });
    this.mesesGlobalGo = [{ value: '', label: 'Seleccionar (Todos)' }, ...mesesOrdenados];
    this.mesSeleccionadoGlobalGo = '';
    this.filtrarGlobalGo();
  }

  filtrarGlobalGo(): void {
    const goSede = this.dataGlobalGo.filter(v => v.SedeKey === this.sedeSeleccionada);
    if (!this.mesSeleccionadoGlobalGo) {
      this.filtroGlobalGo = [...goSede];
      return;
    }
    this.filtroGlobalGo = goSede.filter(v => {
      const f: Date = v.FECHAVENTA;
      const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      return key === this.mesSeleccionadoGlobalGo;
    });
  }

  onVendedorChanged(_: any) { this.actualizarFiltros(); }

  getFechaJS(excelDate: any): Date {
    if (typeof excelDate === 'number' && excelDate > 0) {
      const utc_days = Math.floor(excelDate - 25569);
      const utc_value = utc_days * 86400 * 1000;
      const date_info = new Date(utc_value);
      return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate());
    }
    const str = (excelDate || '').toString().trim();
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
    if (this.dataGrid) this.excelService.exportarDesdeGrid(`ReporteVentas_${this.nombreSedeActual}`, this.dataGrid);
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

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.fontWeight = "bold";
    }
  }

  onCellPreparedSede(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'data') {
      if (e.column.dataField === 'Sede') e.cellElement.style.cursor = 'pointer';
      if (e.column.dataField === 'MontoNC' && e.data.MontoNC > 0) {
        e.cellElement.style.color = '#b71c1c';
        e.cellElement.style.fontWeight = '600';
      }
      if (e.column.dataField === 'MontoINC' && e.data.MontoINC > 0) {
        e.cellElement.style.color = '#C2410C';
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
      if (e.column.dataField === 'MontoINC' && e.data.MontoINC > 0) {
        e.cellElement.style.color = '#C2410C';
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

  onCellPreparedINC(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = "#C2410C";
      e.cellElement.style.color = "white";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.textAlign = "center";
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.backgroundColor = "#fff1e8";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.color = "#C2410C";
    }
  }

  // ─── BONOS ───────────────────────────────────────────────────────────────────
  calcularBono(proyeccion: number): number {
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
      const nombre = this.nombreVendedor(v);
      const cur = mapVentas.get(nombre) || { ventas: 0, ops: 0 };
      mapVentas.set(nombre, { ventas: cur.ventas + (v.MontoConsolidado || 0), ops: cur.ops + 1 });
    });

    const mapNC = this.agruparNCSinRefacturacion(nc => this.nombreVendedor(nc));

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
        BONO: this.calcularBono(proyeccion)
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
