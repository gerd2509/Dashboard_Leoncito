import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { ExcelExportService } from '../../services/excel/excel.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ASESORES_CALL, ASESORES_REALZZA } from '../../shared/asesores';
import { DxDataGridComponent } from 'devextreme-angular';


@Component({
  selector: 'app-comparativo-ventas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './comparativo-ventas.component.html',
  styleUrl: './comparativo-ventas.component.css'
})
export class ComparativoVentasComponent implements OnInit {
  protected excelService = inject(ExcelExportService);
  private ventasSrv = inject(CargaVentasService);
  cargando = false;   // overlay animado mientras trae de BD

  // Roster de asesores ACTUALES (para que la lista/analisis no traiga a otros vendedores):
  //  · Call    → ASESORES_CALL (canon), SIN Brenda CC12 (ella vende como Realzza).
  //  · Realzza → ASESORES_REALZZA (los vendedores Realzza reales, NO el CAP de piso) + Brenda.
  private readonly BRENDA_REALZZA = 'BERNAL BAZAN BRENDA NICOLL';
  private rosterRealzza = new Set<string>();      // nombres normalizados (para match)
  private nombresRealzzaRoster: string[] = [];    // nombres para el dropdown
  // Estados que NO son venta neta → se excluyen (restan las NC del asesor). Igual criterio
  // que el comparativo de cartera / el neto del sistema.
  private readonly ESTADOS_EXCLUIDOS = [
    'NOTA DE CREDITO', 'INCAUTACION', 'CLASIFICADO A PERDIDA', 'CLASIFICADO A LEGAL',
    'ERROR DEL SISTEMA', 'MORAS MAL COBRADAS',
  ];
  private normNom(s: any): string {
    return (s ?? '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }
  private esVentaReal(estado: any): boolean {
    return !this.ESTADOS_EXCLUIDOS.includes(this.normNom(estado));
  }

  // ── Fuente directa de BD: Call → ventas_call · Realzza → ventas_realzza ──
  canal: 'call' | 'realzza' = 'call';
  anio = new Date().getFullYear();
  mes: number | '' = '';   // '' = todos los meses del año (para la tendencia mensual)
  readonly meses = [
    { v: '', t: 'Todos los meses' },
    { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' }, { v: 4, t: 'Abril' },
    { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' }, { v: 8, t: 'Agosto' },
    { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' }, { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];
  // Mapa CC → nombre de los asesores Call ACTUALES (sin Brenda CC12 → va a Realzza).
  // Solo estos CC se consideran Call válidos (excluye CC viejos y "NAS").
  private ccANombre = new Map<string, string>(
    ASESORES_CALL.filter(a => a.value !== 'CC12').map(a => [a.value, a.nombre]));
  get esRealzza(): boolean { return this.canal === 'realzza'; }
  /** Título del gráfico por origen: Call = CONTACTO; Realzza = TIPO DE BASE. */
  get contactoTitulo(): string { return this.esRealzza ? 'Ventas por Tipo de Base' : 'Ventas por Contacto (KOMMO / BD / …)'; }
  /** Etiqueta del periodo cargado (canal + mes/año). */
  get periodoLabel(): string {
    const c = this.esRealzza ? 'Realzza' : 'Call';
    const m = this.mes ? (this.meses.find(x => x.v === this.mes)?.t || '') + ' ' : '';
    return `${c} · ${m}${this.anio}`;
  }

  formComparativo: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  chartComparativo: any[] = [];
  chartMontoMensual: { Mes: string; MontoTotal: number }[] = [];
  chartRankingAsesores: { Asesor: string; Monto: number }[] = [];

  // Comparativo por CONTACTO (KOMMO, BD, etc.) — eje X = Contacto
  chartContacto: any[] = [];          // default: [{ Contacto, MontoGen }] | comparación: [{ Contacto, MontoA, MontoB }]
  comparandoContacto = false;         // modo: false = rango general; true = Rango A vs Rango B
  serieGenLabel = 'Rango general';
  serieALabel = 'Rango A';
  serieBLabel = 'Rango B';
  formContacto: UntypedFormGroup;     // 2 rangos de fecha solo para este gráfico

  keepAssesorsUnique = () => 0;

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  // Asesores del canal cargado (se arma dinámicamente de la data: distinct AsesorVenta).
  asesores: { value: string; viewValue: string }[] = [{ value: '', viewValue: 'Todos los asesores' }];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formComparativo = this.fb.group({ Asesores: [''] });

    // Rangos de fecha exclusivos del gráfico por contacto
    this.formContacto = this.fb.group({
      aInicio: [null], aFin: [null],
      bInicio: [null], bFin: [null],
    });
  }

  ngOnInit(): void {
    // Roster Realzza = vendedores Realzza reales (ASESORES_REALZZA) + Brenda (excepción).
    this.nombresRealzzaRoster = [...ASESORES_REALZZA.map(a => a.nombre), this.BRENDA_REALZZA].sort();
    this.rosterRealzza = new Set(this.nombresRealzzaRoster.map(n => this.normNom(n)));
    this.cargarDatos();
  }

  /** Formato de monto: "S/ 430,986" (sin decimales, redondeado). */
  soles = (v: any): string => `S/ ${Math.round(Number(v) || 0).toLocaleString('es-PE')}`;
  /** Tooltip uniforme: "<serie>: S/ 430,986" (sin decimales) para todos los gráficos de monto. */
  tooltipMonto = (info: any) => ({ text: `${info.seriesName}: ${this.soles(info.value)}` });

  /** Cambia de canal (Call / Realzza) y recarga desde BD. */
  setCanal(c: 'call' | 'realzza'): void {
    if (this.canal === c) return;
    this.canal = c;
    this.formComparativo.patchValue({ Asesores: '' });
    this.cargarDatos();
  }

  /** Nombre del asesor a mostrar/agrupar: Call = nombre del CC; Realzza = asesor_venta. */
  private nombreAsesor(r: any): string {
    if (this.esRealzza) {
      // En Realzza el nombre del asesor está en `vendedor`; asesor_venta suele venir vacío.
      return (r.vendedor || r.asesor_venta || 'SIN ASESOR').toString().trim().toUpperCase() || 'SIN ASESOR';
    }
    const cc = (r.vendedor || '').toString().trim().toUpperCase();
    return (this.ccANombre.get(cc) || cc || 'SIN ASESOR').toUpperCase();
  }

  /** Fecha de venta (CV) desde los enteros dia/mes/anio_cv. */
  private fechaDe(r: any): Date {
    return new Date(+r.anio_cv || 0, (+r.mes_cv || 1) - 1, +r.dia_cv || 1);
  }
  /** Fecha de afectación (AF) — para las NC. null si no tiene AF. */
  private fechaAF(r: any): Date | null {
    if (!r.anio_af || !r.mes_af) return null;
    return new Date(+r.anio_af, (+r.mes_af || 1) - 1, +r.dia_af || 1);
  }
  private soloDigitos(v: any): string { return (v ?? '').toString().replace(/\D/g, ''); }
  private esNotaCredito(estado: any): boolean { return this.normNom(estado).includes('NOTA DE'); }

  /** Carga desde BD según el canal (con overlay). */
  cargarDatos(): void {
    this.cargando = true;
    const done = (movs: any[]) => { this.dataVentas = movs; this.construirAsesores(); this.aplicarFiltros(); this.cargando = false; };
    const fail = () => { this.dataVentas = []; this.filtroVentas = []; this.recalcular(); this.cargando = false; };
    if (this.esRealzza) {
      // Realzza: neto REAL (igual que el evolutivo del módulo) desde `ventas` (afectaciones).
      this.ventasSrv.obtenerVentasRealzzaModulo(this.anio).subscribe({ next: r => done(this.movsRealzza(r || [])), error: fail });
    } else {
      // Call: tabla ventas_call por año/mes; neto excluyendo NC/incautación.
      this.ventasSrv.obtenerVentasCanal('call', { anio: this.anio, mes: this.mes || undefined }).subscribe({ next: r => done(this.movsCall(r || [])), error: fail });
    }
  }

  /** Movimientos Call: una venta neta (positiva) por su mes de venta. */
  private movsCall(rows: any[]): any[] {
    const out: any[] = [];
    for (const r of rows) {
      if (!this.esVentaReal(r.estado_venta)) continue;            // fuera NC/incautación
      if (!this.ccANombre.has((r.vendedor || '').toString().trim().toUpperCase())) continue;  // solo Call actual
      const monto = Number(r.monto_consolidado) || 0;
      if (monto <= 0) continue;
      out.push(this.mov(r, this.fechaDe(r), monto, this.nombreAsesor(r),
        (r.contacto || '').toString().trim().toUpperCase() || 'SIN CONTACTO'));
    }
    return out;
  }

  /**
   * Movimientos Realzza replicando el NETO del evolutivo del módulo:
   *  · venta (no NC) → +monto en su mes de VENTA (CV).
   *  · NC no refacturada → −monto en su mes de AFECTACIÓN (AF).
   *  · NC refacturada (mismo cliente re-compra ese mes, fecha ≥ la NC) → no resta.
   *  Filtra al roster Realzza y, si hay mes elegido, al mes de atribución.
   */
  private movsRealzza(rows: any[]): any[] {
    // Índice de ventas NO-NC por DNI (para detectar refacturación).
    const porDni = new Map<string, any[]>();
    for (const v of rows) {
      if (this.esNotaCredito(v.estado_venta)) continue;
      const dni = this.soloDigitos(v.doc_identidad); if (!dni) continue;
      (porDni.get(dni) ?? porDni.set(dni, []).get(dni)!).push(v);
    }
    const out: any[] = [];
    for (const r of rows) {
      const asesor = this.nombreAsesor(r);
      if (!this.rosterRealzza.has(this.normNom(asesor))) continue;   // solo asesores Realzza
      const monto = Number(r.monto_consolidado) || 0;
      if (monto <= 0) continue;
      const contacto = (r.tipo_base || '').toString().trim().toUpperCase() || 'SIN BASE';
      if (this.esNotaCredito(r.estado_venta)) {
        if (this.esRefacturada(r, porDni)) continue;                 // refacturada → no resta
        const f = this.fechaAF(r); if (!f) continue;
        if (this.mes && +r.mes_af !== this.mes) continue;            // mes de AF
        out.push(this.mov(r, f, -monto, asesor, contacto));
      } else {
        if (this.mes && +r.mes_cv !== this.mes) continue;            // mes de CV
        out.push(this.mov(r, this.fechaDe(r), monto, asesor, contacto));
      }
    }
    return out;
  }

  /** NC refacturada: mismo mes CV=AF y el cliente tiene otra venta (no NC) ese mes con fecha ≥ la NC. */
  private esRefacturada(r: any, porDni: Map<string, any[]>): boolean {
    if (!(+r.anio_cv === +r.anio_af && +r.mes_cv === +r.mes_af)) return false;
    const dni = this.soloDigitos(r.doc_identidad); if (!dni) return false;
    return (porDni.get(dni) || []).some(v =>
      v.codigo_cv !== r.codigo_cv && +v.anio_cv === +r.anio_cv && +v.mes_cv === +r.mes_cv && (+v.dia_cv || 0) >= (+r.dia_cv || 0));
  }

  /** Arma un movimiento con los campos que usan los gráficos. */
  private mov(r: any, fecha: Date, monto: number, asesor: string, contacto: string): any {
    return {
      IDVENTA: r.codigo_cv, FECHAVENTA: fecha, Sede: r.sede, MontoConsolidado: monto,
      DocIdentidad: r.doc_identidad, TipoBase: (r.tipo_base || '').toString().trim().toUpperCase(),
      AsesorVenta: asesor, EstadoVenta: r.estado_venta, Entidad: r.entidad, Contacto: contacto,
    };
  }

  /** Dropdown de asesores = roster ACTUAL del canal (no de la data): Call = ASESORES_CALL
   *  sin Brenda; Realzza = CAP activos (+ Brenda). */
  private construirAsesores(): void {
    const nombres = this.esRealzza
      ? this.nombresRealzzaRoster
      : ASESORES_CALL.filter(a => a.value !== 'CC12').map(a => a.nombre).sort();
    this.asesores = [{ value: '', viewValue: 'Todos los asesores' },
      ...nombres.map(a => ({ value: a, viewValue: a }))];
  }

  onAsesorChanged(_event?: any): void { this.aplicarFiltros(); }

  actualizarFiltros(): void { this.cargarDatos(); }


  /** Filtra la data ya cargada (del canal + periodo) por el asesor elegido y recalcula. */
  aplicarFiltros(): void {
    const sel = this.normNom(this.formComparativo.value.Asesores);
    this.filtroVentas = this.dataVentas.filter(v => !sel || this.normNom(v.AsesorVenta) === sel);
    this.recalcular();
  }

  /** Regenera todos los gráficos a partir de filtroVentas. */
  private recalcular(): void {
    this.generarComparativo();
    this.generarChartMontoMensual();
    this.generarRankingAsesores();
    // Volvemos al modo "rango general" del gráfico por contacto/tipo base.
    this.comparandoContacto = false;
    this.generarChartContacto();
  }

  calcularVentasPorAsesorYRango(fechaInicio: Date, fechaFin: Date): any[] {
    const ventasFiltradas = this.dataVentas.filter(v => {
      const fechaVenta = new Date(v.FECHAVENTA);
      return fechaVenta >= fechaInicio && fechaVenta <= fechaFin;
    });

    const agrupado = new Map<string, number>();

    for (const venta of ventasFiltradas) {
      const asesor = venta.AsesorVenta || 'SIN ASESOR';
      const monto = venta.MontoConsolidado || 0;
      agrupado.set(asesor, (agrupado.get(asesor) || 0) + monto);
    }

    return Array.from(agrupado, ([Asesor, Monto]) => ({ Asesor, Monto }));
  }

  // generarComparativo(): void {
  //   const f1Inicio = new Date(this.formComparativo.value.fechaInicio);
  //   const f1Fin = new Date(this.formComparativo.value.fechaFin);
  //   const f2Inicio = new Date(this.formComparativo.value.fechaInicio2);
  //   const f2Fin = new Date(this.formComparativo.value.fechaFin2);

  //   const rango1 = this.calcularVentasPorAsesorYRango(f1Inicio, f1Fin);
  //   const rango2 = (f2Inicio && f2Fin) ? this.calcularVentasPorAsesorYRango(f2Inicio, f2Fin) : [];

  //   const asesoresUnicos = Array.from(
  //     new Set([...rango1.map(r => r.Asesor), ...rango2.map(r => r.Asesor)])
  //   );

  //   this.chartComparativo = asesoresUnicos.map(asesor => {
  //     const v1 = rango1.find(r => r.Asesor === asesor)?.Monto || 0;
  //     const v2 = rango2.find(r => r.Asesor === asesor)?.Monto || 0;
  //     const diferencia = v2 - v1;

  //     return {
  //       asesor,
  //       Rango1: v1,
  //       Rango2: v2,
  //       Crecimiento: diferencia
  //     };
  //   });
  // }

  generarComparativo(): void {
    // Usamos this.filtroVentas, ya filtrado por fechas/asesor en aplicarFiltros()
    const ventasFiltradas = this.filtroVentas;

    // 🔹 Map para agrupar montos y Set para coleccionar claves de mes (YYYY-MM)
    const agrupado = new Map<string, { label: string; monto: number }>();
    const mesesSet = new Set<string>(); // 💡 Nuevo: Similar a generarChartMontoMensual

    ventasFiltradas.forEach(v => {
      const monto = Number(v.MontoConsolidado || v.Monto || 0);

      if (!monto) return;   // se permiten negativos (NC restan el neto)

      const fechaVenta = new Date(v.FECHAVENTA);
      const year = fechaVenta.getFullYear();
      const month = fechaVenta.getMonth() + 1;

      const mesKey = `${year}-${String(month).padStart(2, '0')}`; // Ej: "2025-10"
      const mesLabel = `${this.getNombreMes(month)} ${year}`;

      // 💡 Nuevo: Agregamos la clave al Set
      mesesSet.add(mesKey);

      if (!agrupado.has(mesKey)) agrupado.set(mesKey, { label: mesLabel, monto: 0 });
      agrupado.get(mesKey)!.monto += monto;
    });

    // 🔹 Ordenar los meses usando el Set (similar a generarChartMontoMensual)
    const mesesOrdenados = Array.from(mesesSet).sort();

    const datosFinales: any[] = [];
    let montoPrevio: number | null = null;

    // 🔹 Iteramos sobre las claves de mes ordenadas
    mesesOrdenados.forEach(mesKey => {
      const dataMes = agrupado.get(mesKey);

      // Debe existir la data, pero es buena práctica verificar
      if (!dataMes) return;

      const { label, monto } = dataMes;

      let crecimiento = 0;
      if (montoPrevio !== null) {
        // Cálculo del crecimiento porcentual
        crecimiento = montoPrevio > 0 ? ((monto - montoPrevio) / montoPrevio) * 100 : 0;
      }

      datosFinales.push({
        Mes: label,
        MesKey: mesKey,
        Monto: parseFloat(monto.toFixed(2)),
        Crecimiento: Math.round(crecimiento),
        Proyeccion: null as number | null
      });

      montoPrevio = monto;
    });

    // Proyección para el mes en curso
    const hoy = new Date();
    const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const diasTranscurridos = hoy.getDate();
    const totalDiasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

    datosFinales.forEach(item => {
      if (item.MesKey === mesActualKey && diasTranscurridos > 0 && item.Monto > 0) {
        item.Proyeccion = parseFloat(((item.Monto / diasTranscurridos) * totalDiasMes).toFixed(2));
      }
    });

    this.chartComparativo = datosFinales;
  }

  customizePoint = (info: any) => {
    // Solo colorear la línea de crecimiento
    if (info.seriesName === 'Crecimiento (%)') {
      const val = info.data.Crecimiento;
      return {
        color: val > 0 ? '#4CAF50' : val < 0 ? '#F44336' : '#9E9E9E',
        hoverStyle: {
          color: val > 0 ? '#66BB6A' : val < 0 ? '#E57373' : '#BDBDBD'
        }
      };
    }
    return {};
  };

  customizeTooltip(pointInfo: any) {
    if (pointInfo.seriesName === 'Monto (S/)') {
      return { text: `Monto: S/ ${Number(pointInfo.value).toLocaleString('es-PE', { maximumFractionDigits: 0 })}` };
    }
    if (pointInfo.seriesName === 'Crecimiento (%)') {
      return { text: `Crecimiento: ${Math.round(pointInfo.value)}%` };
    }
    if (pointInfo.seriesName === 'Proyección Mes Actual') {
      return { text: `Proyección mes: S/ ${Number(pointInfo.value).toLocaleString('es-PE', { maximumFractionDigits: 0 })}` };
    }
    return { text: '' };
  }

  generarChartMontoMensual(): void {
    const agrupado = new Map<string, number>();
    const mesesSet = new Set<string>();

    for (const venta of this.filtroVentas) {
      if (!venta.MontoConsolidado) continue;   // permite negativos (NC)

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

  /** Normaliza el valor de la columna CONTACTO. */
  private normContacto(v: any): string {
    return (v || 'SIN CONTACTO').toString().trim().toUpperCase() || 'SIN CONTACTO';
  }

  /** Suma montos por contacto dentro de un rango de fechas, respetando el asesor seleccionado. */
  private montosPorContacto(fechaInicio: any, fechaFin: any): Map<string, number> {
    const di = new Date(fechaInicio); di.setHours(0, 0, 0, 0);
    const df = new Date(fechaFin);    df.setHours(23, 59, 59, 999);
    const asesor = this.normNom(this.formComparativo.value.Asesores);

    const map = new Map<string, number>();
    for (const v of this.dataVentas) {
      const monto = Number(v.MontoConsolidado || 0);
      if (!monto) continue;   // permite negativos (NC)

      const fv = new Date(v.FECHAVENTA);
      if (fv < di || fv > df) continue;

      if (asesor && this.normNom(v.AsesorVenta) !== asesor) continue;

      const c = this.normContacto(v.Contacto);
      map.set(c, (map.get(c) || 0) + monto);
    }
    return map;
  }

  /** Modo por defecto: monto por contacto en el rango GENERAL (usa filtroVentas ya filtrado). */
  generarChartContacto(): void {
    const agrupado = new Map<string, number>();
    for (const v of this.filtroVentas) {
      const monto = Number(v.MontoConsolidado || 0);
      if (!monto) continue;   // permite negativos (NC)
      const c = this.normContacto(v.Contacto);
      agrupado.set(c, (agrupado.get(c) || 0) + monto);
    }

    this.serieGenLabel = this.periodoLabel;

    this.chartContacto = Array.from(agrupado, ([Contacto, MontoGen]) => ({
      Contacto, MontoGen: parseFloat(MontoGen.toFixed(2))
    })).sort((a, b) => b.MontoGen - a.MontoGen);
  }

  /** Modo comparación: Rango A vs Rango B por contacto (2 barras por contacto). */
  compararRangosContacto(): void {
    const f = this.formContacto.value;
    if (!f.aInicio || !f.aFin || !f.bInicio || !f.bFin) {
      return; // se requieren los 4 campos de fecha
    }

    const mapA = this.montosPorContacto(f.aInicio, f.aFin);
    const mapB = this.montosPorContacto(f.bInicio, f.bFin);
    const contactos = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();

    this.serieALabel = `A: ${this.fmtFecha(f.aInicio)} – ${this.fmtFecha(f.aFin)}`;
    this.serieBLabel = `B: ${this.fmtFecha(f.bInicio)} – ${this.fmtFecha(f.bFin)}`;

    this.chartContacto = contactos.map(c => ({
      Contacto: c,
      MontoA: parseFloat((mapA.get(c) || 0).toFixed(2)),
      MontoB: parseFloat((mapB.get(c) || 0).toFixed(2)),
    }));
    this.comparandoContacto = true;
  }

  /** Quita la comparación y vuelve al monto por contacto del rango general. */
  limpiarComparacionContacto(): void {
    this.formContacto.reset();
    this.comparandoContacto = false;
    this.generarChartContacto();
  }

  private fmtFecha(d: any): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  customizeContactoTooltip = (pointInfo: any) => {
    return {
      text: `${pointInfo.seriesName}\n${pointInfo.argument}: S/ ${Number(pointInfo.value).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
    };
  };

  getNombreMes(mes: number): string {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[mes - 1] || '';
  }

  generarRankingAsesores(): void {
    const agrupado = new Map<string, number>();
    for (const venta of this.filtroVentas) {
      const asesor = venta.AsesorVenta || 'SIN ASESOR';
      const monto = venta.MontoConsolidado || 0;
      if (!monto) continue;   // permite negativos (NC restan al asesor)
      agrupado.set(asesor, (agrupado.get(asesor) || 0) + monto);
    }
    this.chartRankingAsesores = Array.from(agrupado, ([Asesor, Monto]) => ({ Asesor, Monto }))
      .sort((a, b) => b.Monto - a.Monto);
  }

  formatMontoLabel = (info: any): string => {
    const val = Number(info.value);
    if (!val) return '';
    return `S/ ${val.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
  };

  formatCrecimientoLabel = (info: any): string => {
    const val = info.value as number;
    if (val === 0 || val == null) return '0%';
    return `${val > 0 ? '+' : ''}${val}%`;
  };

  formatProyeccionLabel = (info: any): string => {
    const val = Number(info.value);
    if (!val) return '';
    return `Proy: S/ ${val.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
  };

  customizeRankingPoint = (info: any): any => {
    const total = this.chartRankingAsesores.length;
    if (total === 0) return {};
    const idx = this.chartRankingAsesores.findIndex(r => r.Asesor === info.argument);
    if (idx === -1) return {};
    const tercio = Math.ceil(total / 3);
    if (idx < tercio) return { color: '#2E7D32' };
    if (idx >= total - tercio) return { color: '#C62828' };
    return { color: '#1565C0' };
  };

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataAgendamientos", this.dataGrid);
    }
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
}
