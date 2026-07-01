import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { AuthService } from '../../services/auth.service';
import * as XLSX from 'xlsx';
import { DxSchedulerComponent } from 'devextreme-angular';

@Component({
  selector: 'app-cierre-gestion',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './cierre-gestion.component.html',
  styleUrl: './cierre-gestion.component.css'
})
export class CierreGestionComponent implements OnInit {
  protected service = inject(SheetsService);
  protected auth    = inject(AuthService);

  // true cuando el usuario es gerente/supervisor de Realzza
  get soloRealzza(): boolean {
    const u = this.auth.getUsuario();
    if (!u || u.rol === 'admin') return false;
    return u.sede.toLowerCase().includes('realzza');
  }

  // Contactabilidad calculada solo para Realzza
  get pctContactabilidadRealzza(): number {
    const c = this.dataContactabilidadRealzza.reduce((s, r) => s + (r['CONTACTO'] || 0), 0);
    const t = this.dataContactabilidadRealzza.reduce((s, r) => s + (r['TOTAL']    || 0), 0);
    return t > 0 ? Math.round((c / t) * 100) : 0;
  }

  get totalContactosRz(): number {
    return this.dataContactabilidadRealzza.reduce((s, r) => s + (r['CONTACTO'] || 0), 0);
  }

  get totalGestionesRz(): number {
    return this.dataContactabilidadRealzza.reduce((s, r) => s + (r['TOTAL'] || 0), 0);
  }

  formCierreGestion: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  // DATASOURCES PRINCIPALES
  dataOriginal: any[] = []; // Data Call Center
  dataRealzza: any[] = [];  // Data Campo/Realzza
  dataPostVenta: any[] = [];
  dataKOMMO: any[] = [];

  // VARIABLES PARA LA VISTA SPLIT (CALL CENTER)
  dataContactabilidadCall: any[] = [];
  dataAgendamientosCall: any[] = [];
  dataDerivacionesCall: any[] = [];
  dataContactabilidadKOMMOCall: any[] = [];
  porcentajeMetaCall = 0;
  porcentajeMetaDerivacionCall = 0;

  // VARIABLES PARA LA VISTA SPLIT (REALZZA)
  dataContactabilidadRealzza: any[] = [];
  dataAgendamientosRealzza: any[] = [];
  dataDerivacionesRealzza: any[] = [];
  dataContactabilidadKOMMORealzza: any[] = [];
  porcentajeMetaRealzza = 0;
  porcentajeMetaDerivacionRealzza = 0;

  // KOMMO Market Place (registros con MARKET PLACE = SI)
  dataContactabilidadKOMMOCallMarket: any[] = [];
  dataContactabilidadKOMMORealzzaMarket: any[] = [];

  // Variables globales / Resumen
  dataContactabilidad: any[] = [];
  dataContactabilidadKOMMO: any[] = [];
  dataDerivaciones: any[] = [];
  dataDerivacionesXSEDE: any[] = [];

  dataGestionPorSedeYCliente: any[] = [];
  dataGestionPorAsesorYCliente: any[] = [];

  dataGestionPorAsesorYTipoCliente: any[] = [];
  columnasTiposCliente: string[] = [];

  planeamiento: any[] = [];
  planeamientoTotales: any[] = [];

  // Metas
  agendamientoIndividual = 15;
  derivacionesIndividual = 2;
  metaDerivacionEquipo = 12;
  metaAgendamientoEquipo = 90;

  porcentajeTotalContactabilidad = 0; // Global

  dataGrafico: any[] = [];
  chartData: any[] = [];
  chartPorDia: any[] = [];
  totalContactados = 0;
  totalInteresados = 0;
  totalDerivaciones = 0;

  montoCall = 0;
  montoRealzza = 0;
  ventasCallCount = 0;
  ventasRealzzaCount = 0;
  proyeccionCall = 0;
  proyeccionRealzza = 0;
  ticketCall = 0;
  ticketRealzza = 0;

  intervaloMediaHora: any = null;
  timeoutMediaHora: any = null;
  intervaloCincoMin: any = null;

  semanas: string[] = [];
  semanaMap = new Map<string, string>();

  totalMontoVentas = 0;
  totalVentas = 0;
  ticket = 0;
  proyeccion = 0;

  // KPI propiedades
  totalAgendamientos = 0;
  totalAgendamientosCall = 0;
  totalAgendamientosRealzza = 0;
  porcentajeAgendamientoTotal = 0;
  totalDerivacionesCall = 0;
  totalDerivacionesRealzza = 0;
  porcentajeDerivacionTotal = 0;
  totalGestiones = 0;
  totalContactadosCall = 0;
  totalContactadosRealzza = 0;

  operacionesPorDiaMesActual: any[] = [];
  columnasDiasMes: string[] = [];

  colorMap: { [key: string]: string } = {};
  colorPalette: string[] = [
    '#FFD700', '#1E90FF', '#32CD32', '#FF4500', '#8A2BE2', '#FF1493', '#00CED1', '#DC143C'
  ];

  // LISTA ASESORES CALL CENTER
  asesoresCall = [
    { value: 'CC1', viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    // { value: 'CC3', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'CC5', viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6', viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC8', viewValue: 'CHANTA CAMPOS KELLY KARINTIA' },
    // { value: 'CC11', viewValue: 'SAMAME HUAMAN ARIADNE' },
    { value: 'CC12', viewValue: 'BERNAL BAZAN BRENDA NICOL' },
    // { value: 'CC13', viewValue: 'CARBONEL GUERRERO FRANCIS JHON' },
    { value: 'CC15', viewValue: 'TORRES ALVARADO JUDY ESMERALDA' },
    // { value: 'CC16', viewValue: 'BONILLA CHUMACERO VILMA ROSSMERY' },
    { value: 'CC21', viewValue: 'CHANAME SOTO ANITA NOEMI' },
    { value: 'CC22', viewValue: 'BERNAL BAZAN FABRICIO ROLANDO' }
  ];

  // LISTA ASESORES REALZZA
  asesoresRealzza = [
    { value: 'RZ1', viewValue: 'MONTALVO LUYO ERNESTO ADOLFO' },
    { value: 'RZ2', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'RZ3', viewValue: 'PEREZ TINEO MARICIELO TATIANA' },
    { value: 'RZ4', viewValue: 'RIVAS PURISACA KAREN YUDITH' },
    { value: 'RZ5', viewValue: 'MIÑOPE GONZALES ANYELA ESTHEFANY' },
    { value: 'RZ6', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'RZ7', viewValue: 'SANTAMARIA GUZMAN MERLY BRIGHITE' },
    // { value: 'RZ8', viewValue: 'RIQUERO ULCO CESAR JEFFERSON' },
    { value: 'RZ9', viewValue: 'BUSTAMANTE CHALAN ANA RUT' },
    { value: 'RZ10', viewValue: 'BUSTAMANTE BANCES LUCIA NICOLL' },
    { value: 'RZ11', viewValue: 'LLONTOP DAVILA DENNIS CHRISTIAN' }
  ];

  asesores1 = this.asesoresCall;

  // ── Sublistas fijas para KOMMO (se muestran siempre, tengan o no registros) ──
  // Leoncito / Call KOMMO: solo KAREN, ESMERALDA, KELLY
  private readonly kommoCallIds = ['CC5', 'CC15', 'CC8'];
  // Realzza KOMMO: NATALY, ANYELA, TATIANA, MERLY, FELICITA, ANA RUT, YUDITH
  private readonly kommoRealzzaIds = ['RZ2', 'RZ5', 'RZ3', 'RZ7', 'RZ6', 'RZ9', 'RZ4'];

  get asesoresKommoCall() {
    return this.kommoCallIds
      .map(id => this.asesoresCall.find(a => a.value === id))
      .filter((a): a is { value: string; viewValue: string } => !!a);
  }
  get asesoresKommoRealzza() {
    return this.kommoRealzzaIds
      .map(id => this.asesoresRealzza.find(a => a.value === id))
      .filter((a): a is { value: string; viewValue: string } => !!a);
  }

  asesorMap: { [codigo: string]: string } = {
    'CC10': 'Yudith', 'CC6': 'Maria', 'CC1': 'Patricia',
    'CC8': 'Kelly', 'CC3': 'Felicita', 'CC5': 'Karen', 'CC11': 'Ariadne'
  };

  // Nombres cortos para mostrar en las tablas (mismo criterio que ventas / ventas-campo)
  nombresCortos: Record<string, string> = {
    // Call Center
    'CC1':  'PATRICIA', 'CC3':  'FELICITA', 'CC5':  'KAREN',   'CC6':  'MARIA',
    'CC8':  'KELLY',    'CC11': 'ARIADNE',  'CC12': 'BRENDA',  'CC13': 'FRANCIS',
    'CC15': 'ESMERALDA','CC16': 'ROSMERY',  'CC21': 'ANITA',   'CC22': 'FABRICIO',
    // Realzza
    'RZ1':  'ERNESTO',  'RZ2':  'NATALY',   'RZ3':  'TATIANA', 'RZ4':  'YUDITH',
    'RZ5':  'ANYELA',   'RZ6':  'FELICITA', 'RZ7': 'MERLY',   'RZ8': 'CESAR',
    'RZ9': 'ANA RUT', 'RZ10': 'LUCIA', 'RZ11': 'DENNIS'
  };

  // Devuelve el nombre corto del asesor; si no existe en el mapa, usa el nombre completo
  private nombreCorto(asesor: { value: string; viewValue: string }): string {
    return this.nombresCortos[asesor.value] || asesor.viewValue;
  }

  dataResumen: any[] = [];
  chartAreas: any[] = [];
  chartEstadoGestion: any[] = [];
  chartSatisfaccion: any[] = [];
  chartConformidad: any[] = [];

  isLoading = false;
  kpiSeleccionado: string | null = null;

  @ViewChild(DxSchedulerComponent, { static: false }) scheduler!: DxSchedulerComponent;

  constructor(private fb: UntypedFormBuilder) {
    const currentDate = new Date();
    this.formCierreGestion = this.fb.group({
      fechaGestion: [currentDate]
    });
  }

  async ngOnInit() {
    this.isLoading = true;
    try {
      const [dataCall, dataRealzza, dataPost, dataKOMMO] = await Promise.all([
        lastValueFrom(this.service.getSheetData()),
        lastValueFrom(this.service.getSheetDataCampo()),
        lastValueFrom(this.service.getSheetDataPostVenta()),
        lastValueFrom(this.service.getSheetKOMMO())
      ]);

      this.dataOriginal = dataCall;
      this.dataRealzza = dataRealzza;
      this.dataPostVenta = dataPost;
      this.dataKOMMO = dataKOMMO;

      this.calcularIndicadoresCompletos();

    } catch (error) {
      console.error('Error al cargar datos iniciales:', error);
    } finally {
      this.isLoading = false;
    }

    this.limpiarTimers();
    this.programarActualizacionCadaMediaHora();
    this.programarActualizacionCadaCincoMinutos();
  }

  ngOnDestroy() {
    this.limpiarTimers();
  }

  calcularIndicadoresCompletos() {
    this.calcularContactabilidadCall();
    this.calcularContactabilidadRealzza();
    this.calcularContactabilidadKOMMOCall();
    this.calcularContactabilidadKOMMOCallMarket();
    this.calcularContactabilidadKOMMORealzza();
    this.calcularContactabilidadKOMMORealzzaMarket();
    this.calcularAgendamientosCall();
    this.calcularAgendamientosRealzza();
    this.calcularDerivacionesCall();
    this.calcularDerivacionesRealzza();
    this.totalGestionesPorSedeYTipoCliente();
    this.totalDerivacionesPorSede();
    this.graficoData();
    this.generarGraficoAreasFiltrado();
    this.generarGraficoEstadoGestionFiltrado();
    this.generarGraficoSatisfaccionFiltrado();
    this.generarGraficoConformidadFiltrado();
    this.procesarDatosPostVentaFiltrada();
    this.totalGestionesPorAsesorYTipo();
  }

  async actualizar() {
    this.isLoading = true;
    try {
      const [dataCall, dataRealzza, dataPost, dataKOMMO] = await Promise.all([
        lastValueFrom(this.service.getSheetData()),
        lastValueFrom(this.service.getSheetDataCampo()),
        lastValueFrom(this.service.getSheetDataPostVenta()),
        lastValueFrom(this.service.getSheetKOMMO())
      ]);
      this.dataOriginal = dataCall;
      this.dataRealzza = dataRealzza;
      this.dataPostVenta = dataPost;
      this.dataKOMMO = dataKOMMO;
      this.calcularIndicadoresCompletos();
    } catch (error) {
      console.error('Error al actualizar datos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // LOGICA CONTACTABILIDAD
  calcularContactabilidadCall() {
    // Contactabilidad Leoncito (llamadas): TODOS los asesores, tengan o no gestión.
    this.dataContactabilidadCall = this
      .procesarContactabilidad(this.dataOriginal, this.asesoresCall, 'ASESOR CONTACT');
  }

  calcularContactabilidadRealzza() {
    // Contactabilidad Realzza: TODOS los asesores, tengan o no gestión.
    this.dataContactabilidadRealzza = this
      .procesarContactabilidad(this.dataRealzza, this.asesoresRealzza, 'ASESOR REALZZA');
  }

  calcularContactabilidadKOMMOCall() {
    // KOMMO Leoncito (NO market place): SOLO Karen, Esmeralda, Kelly; tengan o no registros.
    this.dataContactabilidadKOMMOCall = this
      .procesarContactabilidadKOMMO(this.dataKOMMO, this.asesoresKommoCall, 'ASESOR CONTACT', 'ESTADO DE GESTIÓN', 'MARKET PLACE L', false);
  }

  calcularContactabilidadKOMMOCallMarket() {
    // KOMMO Leoncito MARKET PLACE: TODOS los asesores, tengan o no registros.
    this.dataContactabilidadKOMMOCallMarket = this
      .procesarContactabilidadKOMMO(this.dataKOMMO, this.asesoresCall, 'ASESOR CONTACT', 'ESTADO DE GESTIÓN', 'MARKET PLACE L', true);
  }

  calcularContactabilidadKOMMORealzza() {
    // KOMMO Realzza (NO market place): SOLO Nataly, Anyela, Tatiana, Merly, Felicita, Ana Rut, Yudith.
    this.dataContactabilidadKOMMORealzza = this
      .procesarContactabilidadKOMMO(this.dataKOMMO, this.asesoresKommoRealzza, 'ASESOR REALZZA', 'ESTADO DE GESTIÓN REALZZA', 'MARKET PLACE R', false);
  }

  calcularContactabilidadKOMMORealzzaMarket() {
    // KOMMO Realzza MARKET PLACE: TODOS los asesores, tengan o no registros.
    this.dataContactabilidadKOMMORealzzaMarket = this
      .procesarContactabilidadKOMMO(this.dataKOMMO, this.asesoresRealzza, 'ASESOR REALZZA', 'ESTADO DE GESTIÓN REALZZA', 'MARKET PLACE R', true);
  }

  private procesarContactabilidad(dataSource: any[], listaAsesores: any[], nombreColumnaAsesor: string): any[] {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();
    if (!fechaSeleccionada) return [];

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    listaAsesores.forEach(asesor => {
      const registrosAsesor = dataSource.filter(item =>
        item[nombreColumnaAsesor]?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim() &&
        this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
      );

      const registrosContacto = registrosAsesor.filter(r => r['ESTADO DE GESTIÓN'] === 'CONTACTO');
      const cortaLlamada = registrosContacto.filter(r => r['MOTIVO NO INTERÉS'] === 'CORTA LLAMADA').length;
      const contacto = registrosContacto.length - cortaLlamada;
      const noContacto = registrosAsesor.filter(r => r['ESTADO DE GESTIÓN'] === 'NO CONTACTO').length;
      const total = contacto + cortaLlamada + noContacto;

      resultado.push({
        'ASESOR ID': asesor.value,
        'ASESOR CONTACT': this.nombreCorto(asesor),
        'CONTACTO': contacto,
        'CORTA LLAMADA': cortaLlamada,
        'NO CONTACTO': noContacto,
        'TOTAL': total,
        'PORCENTAJE': total > 0 ? (contacto / total) : 0
      });
    });

    this.dataContactabilidad = [...this.dataContactabilidadCall, ...this.dataContactabilidadRealzza];

    const sumaTotalContactos = this.dataContactabilidad.reduce((acc, curr) => acc + (curr['CONTACTO'] || 0), 0);
    const sumaTotalGestion = this.dataContactabilidad.reduce((acc, curr) => acc + (curr['TOTAL'] || 0), 0);
    this.porcentajeTotalContactabilidad = sumaTotalGestion > 0
      ? Math.round((sumaTotalContactos / sumaTotalGestion) * 100) : 0;

    return resultado;
  }

  // Devuelve true si la celda de Market Place (L o R) marca SI
  private esMarketPlace(item: any, columna: string): boolean {
    const v = (item?.[columna] ?? '').toString().toUpperCase().trim();
    return v === 'SI' || v === 'SÍ';
  }

  private procesarContactabilidadKOMMO(
    dataSource: any[],
    listaAsesores: any[],
    nombreColumnaAsesor: string, // 'ASESOR CONTACT' o 'ASESOR REALZZA'
    nombreColumnaEstado: string, // 'ESTADO DE GESTIÓN' o 'ESTADO DE GESTIÓN REALZZA'
    columnaMarketPlace?: string, // 'MARKET PLACE L' o 'MARKET PLACE R' (opcional)
    soloMarketPlace: boolean = false // true => solo SI ; false => NO/vacío
  ): any[] {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();
    if (!fechaSeleccionada || !dataSource) return [];

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    listaAsesores.forEach(asesor => {
      // 1. Filtrar usando las columnas específicas de este grupo
      const registrosAsesor = dataSource.filter(item => {
        const esAsesor = item[nombreColumnaAsesor]?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim();
        const esFecha = this.esMismaFecha(item['Marca temporal'], dia, mes, anio);
        if (!esAsesor || !esFecha) return false;

        // Separación KOMMO vs MARKET PLACE: SI => market; NO/vacío => kommo
        if (columnaMarketPlace) {
          const esMp = this.esMarketPlace(item, columnaMarketPlace);
          return soloMarketPlace ? esMp : !esMp;
        }
        return true;
      });

      // 2. Cálculos usando la columna de estado correspondiente (Normal o REALZZA)
      const registrosContacto = registrosAsesor.filter(r => r[nombreColumnaEstado] === 'CONTACTO');

      // El motivo de no interés parece ser el mismo para ambos según tu lista de columnas
      const cortaLlamada = registrosContacto.filter(r => r['MOTIVO NO INTERÉS'] === 'CORTA LLAMADA').length;

      const contactoEfectivo = registrosContacto.length - cortaLlamada;
      const noContacto = registrosAsesor.filter(r => r[nombreColumnaEstado] === 'NO CONTACTO').length;

      const totalGestiones = contactoEfectivo + noContacto + cortaLlamada;

      // 3. Mapeo para el Grid
      resultado.push({
        'ASESOR ID': asesor.value,
        [nombreColumnaAsesor]: this.nombreCorto(asesor),
        'CONTACTO': contactoEfectivo,
        'NO CONTACTO': noContacto,
        'CORTA LLAMADA': cortaLlamada,
        'TOTAL': totalGestiones
      });
    });

    this.actualizarTotalesGlobalesKOMMO();
    return resultado;
  }

  // Método auxiliar para no ensuciar el procesador
  private actualizarTotalesGlobalesKOMMO() {
    const totalData = [
      ...(this.dataContactabilidadKOMMOCall || []),
      ...(this.dataContactabilidadKOMMOCallMarket || []),
      ...(this.dataContactabilidadKOMMORealzza || []),
      ...(this.dataContactabilidadKOMMORealzzaMarket || [])
    ];

    const sumaTotalContactos = totalData.reduce((acc, curr) => acc + (curr['CONTACTO'] || 0), 0);
    const sumaTotalGestion = totalData.reduce((acc, curr) => acc + (curr['TOTAL'] || 0), 0);

    this.porcentajeTotalContactabilidad = sumaTotalGestion > 0
      ? Math.round((sumaTotalContactos / sumaTotalGestion) * 100) : 0;
  }

  // LOGICA AGENDAMIENTOS
  calcularAgendamientosCall() {
    const res = this.procesarAgendamientos(this.dataOriginal, this.asesoresCall, 'ASESOR CONTACT');
    this.dataAgendamientosCall = res.data;
    this.porcentajeMetaCall = res.porcentajeMeta;
  }

  calcularAgendamientosRealzza() {
    const res = this.procesarAgendamientos(this.dataRealzza, this.asesoresRealzza, 'ASESOR REALZZA');
    this.dataAgendamientosRealzza = res.data;
    this.porcentajeMetaRealzza = res.porcentajeMeta;
  }

  private procesarAgendamientos(dataSource: any[], listaAsesores: any[], nombreColumnaAsesor: string): { data: any[], porcentajeMeta: number } {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();
    if (!fechaSeleccionada) return { data: [], porcentajeMeta: 0 };

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    listaAsesores.forEach(asesor => {
      const registrosAsesor = dataSource.filter(item => {
        return (
          item[nombreColumnaAsesor]?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim() &&
          this.esMismaFecha(item['Marca temporal'], dia, mes, anio) &&
          item['MOTIVO INTERÉS']?.trim() === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)'
        );
      });

      const totalAgendamientos = registrosAsesor.length;
      const porcentajeMeta = this.agendamientoIndividual > 0
        ? Math.min((totalAgendamientos / this.agendamientoIndividual), 1) : 0;

      resultado.push({
        'ASESOR ID': asesor.value,
        'ASESOR CONTACT': asesor.viewValue,
        'AGENDAMIENTO': totalAgendamientos,
        'META': porcentajeMeta
      });
    });

    const total = resultado.reduce((acc, item) => acc + (item.AGENDAMIENTO || 0), 0);
    const porcentajeMeta = Math.min(Math.round((total / this.metaAgendamientoEquipo) * 100), 100);

    return { data: resultado, porcentajeMeta };
  }

  // LOGICA DERIVACIONES
  calcularDerivacionesCall() {
    const res = this.procesarDerivaciones(this.dataOriginal, this.asesoresCall, 'ASESOR CONTACT');
    this.dataDerivacionesCall = res.data;
    this.porcentajeMetaDerivacionCall = res.porcentajeMeta;
    this.combinarDerivacionesGlobales();
  }

  calcularDerivacionesRealzza() {
    const res = this.procesarDerivaciones(this.dataRealzza, this.asesoresRealzza, 'ASESOR REALZZA');
    this.dataDerivacionesRealzza = res.data;
    this.porcentajeMetaDerivacionRealzza = res.porcentajeMeta;
    this.combinarDerivacionesGlobales();
  }

  combinarDerivacionesGlobales() {
    this.dataDerivaciones = [...this.dataDerivacionesCall, ...this.dataDerivacionesRealzza];
  }

  private procesarDerivaciones(dataSource: any[], listaAsesores: any[], nombreColumnaAsesor: string): { data: any[], porcentajeMeta: number } {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();
    if (!fechaSeleccionada) return { data: [], porcentajeMeta: 0 };

    const { dia, mes, anio } = fechaSeleccionada;
    const motivosValidos = [
      'VENTA DERIVADA PARA CIERRE A SEDE',
      'VISITARÁ TIENDA',
      'SE ENVIÓ A ASESOR VISITA A DOMICILIO'
    ];

    const resultado: any[] = [];

    listaAsesores.forEach(asesor => {
      const registrosAsesor = dataSource.filter(item => {
        const esAsesor = item[nombreColumnaAsesor]?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim();
        const esFecha = this.esMismaFecha(item['Marca temporal'], dia, mes, anio);
        const motivoItem = item['MOTIVO INTERÉS']?.toUpperCase().trim();
        const esMotivoValido = motivosValidos.includes(motivoItem);

        return esAsesor && esFecha && esMotivoValido;
      });

      const totalDerivaciones = registrosAsesor.length;
      const porcentajeMeta = this.derivacionesIndividual > 0
        ? Math.min((totalDerivaciones / this.derivacionesIndividual), 1) : 0;

      resultado.push({
        'ASESOR ID': asesor.value,
        'ASESOR CONTACT': asesor.viewValue,
        'DERIVACION': totalDerivaciones,
        'META': porcentajeMeta
      });
    });

    const total = resultado.reduce((acc, item) => acc + (item.DERIVACION || 0), 0);
    const porcentajeMeta = this.metaDerivacionEquipo > 0
      ? Math.min(Math.round((total / this.metaDerivacionEquipo) * 100), 100) : 0;

    return { data: resultado, porcentajeMeta };
  }

  // TIMERS
  limpiarTimers() {
    if (this.timeoutMediaHora) clearTimeout(this.timeoutMediaHora);
    if (this.intervaloMediaHora) clearInterval(this.intervaloMediaHora);
    if (this.intervaloCincoMin) clearInterval(this.intervaloCincoMin);
    this.timeoutMediaHora = null;
    this.intervaloMediaHora = null;
    this.intervaloCincoMin = null;
  }

  programarActualizacionCadaMediaHora() {
    const ahora = new Date();
    const siguiente = new Date(ahora);
    if (ahora.getMinutes() < 30) {
      siguiente.setMinutes(30, 0, 0);
    } else {
      siguiente.setHours(ahora.getHours() + 1, 0, 0, 0);
    }
    const tiempoEspera = siguiente.getTime() - ahora.getTime();

    if (this.timeoutMediaHora) clearTimeout(this.timeoutMediaHora);
    if (this.intervaloMediaHora) clearInterval(this.intervaloMediaHora);

    this.timeoutMediaHora = setTimeout(() => {
      this.ejecutarActualizacionYVoz();
      this.intervaloMediaHora = setInterval(() => {
        this.ejecutarActualizacionYVoz();
      }, 30 * 60 * 1000);
    }, tiempoEspera);
  }

  programarActualizacionCadaCincoMinutos() {
    if (this.intervaloCincoMin) clearInterval(this.intervaloCincoMin);
    this.intervaloCincoMin = setInterval(() => {
      console.log("🔄 Actualización automática cada 5 minutos");
      this.actualizar();
    }, 5 * 60 * 1000);
  }

  async ejecutarActualizacionYVoz() {
    await this.actualizar();
    this.leerAvance();
  }

  protected getNombreParaVoz(nombreCompleto: string): string {
    const normalizado = nombreCompleto.trim().toUpperCase();
    if (normalizado === "RIVAS PURISACA KAREN YUDITH") return "Yudith";
    if (normalizado === "BONILLA CHUMACERO VILMA ROSSMERY") return "Rosmery";
    const partes = normalizado.split(" ");
    if (partes.length > 1) return this.capitalize(partes[2] ?? partes[0]);
    return this.capitalize(partes[0]);
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  leerAvance() {
    if (!('speechSynthesis' in window)) return;
    let mensaje = 'Reporte actualizado. ';
    this.dataContactabilidad.forEach(item => {
      const nombre = this.getNombreParaVoz(item['ASESOR CONTACT']);
      mensaje += `${nombre} tiene ${item['CONTACTO']} contactos de ${item['TOTAL']} gestiones. `;
    });
    mensaje += `En total van ${this.totalDerivaciones} derivaciones. `;
    const utterance = new SpeechSynthesisUtterance(mensaje);
    utterance.lang = 'es-PE';
    utterance.rate = 1;
    speechSynthesis.speak(utterance);
  }

  private obtenerFechaSeleccionada(): { dia: number; mes: number; anio: number } | null {
    const fecha: Date = this.formCierreGestion.value.fechaGestion;
    if (!fecha) return null;
    return { dia: fecha.getDate(), mes: fecha.getMonth() + 1, anio: fecha.getFullYear() };
  }

  private esMismaFecha(marcaTemporal: string, dia: number, mes: number, anio: number): boolean {
    if (!marcaTemporal || !marcaTemporal.includes('/')) return false;
    const [diaStr, mesStr, anioStr] = marcaTemporal.split(' ')[0].split('/');
    return parseInt(diaStr, 10) === dia && parseInt(mesStr, 10) === mes && parseInt(anioStr, 10) === anio;
  }

  esMismaFecha2(timestamp: string, dia: number, mes: number, anio: number): boolean {
    if (!timestamp) return false;
    const [fechaStr] = timestamp.split(' ');
    const [m, d, y] = fechaStr.split('/').map(Number);
    return d === dia && m === mes && y === anio;
  }

  // GRAFICOS Y HELPERS
  generarGraficoAreasFiltrado() {
    const fecha = this.obtenerFechaSeleccionada();
    if (!fecha) { this.chartAreas = []; return; }
    const areasMap = new Map<string, number>();
    this.dataPostVenta
      .filter(item => this.esMismaFecha2(item['Timestamp'], fecha.dia, fecha.mes, fecha.anio))
      .forEach(item => {
        const area = (item["AREA CORRESPONDIENTE"] || "").toString().trim();
        if (area) areasMap.set(area, (areasMap.get(area) || 0) + 1);
      });
    this.chartAreas = Array.from(areasMap, ([area, cantidad]) => ({ area, cantidad }));
  }

  generarGraficoEstadoGestionFiltrado() {
    const f = this.obtenerFechaSeleccionada();
    if (!f) { this.chartEstadoGestion = []; return; }
    let contacto = 0, noContacto = 0;
    this.dataPostVenta
      .filter(item => this.esMismaFecha2(item['Timestamp'], f.dia, f.mes, f.anio))
      .forEach(item => {
        const estado = (item["ESTADO DE GESTIÓN"] || "").toString().trim().toUpperCase();
        if (estado === "CONTACTO") contacto++; else if (estado === "NO CONTACTO") noContacto++;
      });
    this.chartEstadoGestion = [{ tipo: "CONTACTO", cantidad: contacto }, { tipo: "NO CONTACTO", cantidad: noContacto }];
  }

  generarGraficoConformidadFiltrado() {
    const f = this.obtenerFechaSeleccionada();
    if (!f) { this.chartConformidad = []; return; }
    let conforme = 0, noConforme = 0;
    this.dataPostVenta
      .filter(item => this.esMismaFecha2(item['Timestamp'], f.dia, f.mes, f.anio))
      .forEach(item => {
        const c = (item["CONFORMIDAD CLIENTE"] || "").toString().trim().toUpperCase();
        if (c === "CONFORME") conforme++; else if (c === "NO CONFORME") noConforme++;
      });
    this.chartConformidad = [{ tipo: "CONFORME", cantidad: conforme }, { tipo: "NO CONFORME", cantidad: noConforme }];
  }

  generarGraficoSatisfaccionFiltrado() {
    const f = this.obtenerFechaSeleccionada();
    if (!f) { this.chartSatisfaccion = []; return; }
    const datos: any[] = [];
    this.dataPostVenta
      .filter(item => this.esMismaFecha2(item['Timestamp'], f.dia, f.mes, f.anio))
      .forEach((item, index) => {
        const nivel = parseFloat(item["NIVEL SATISFACCIÓN"]);
        if (!isNaN(nivel)) datos.push({ indice: index + 1, nivel });
      });
    this.chartSatisfaccion = datos;
  }

  procesarDatosPostVentaFiltrada(): void {
    const f = this.obtenerFechaSeleccionada();
    if (!f) { this.dataResumen = []; return; }
    let contacto = 0, noContacto = 0, conforme = 0, noConforme = 0;
    const areasMap = new Map<string, number>();
    const satisfacciones: number[] = [];
    this.dataPostVenta.filter(item => this.esMismaFecha2(item['Timestamp'], f.dia, f.mes, f.anio)).forEach(item => {
      const estado = (item["ESTADO DE GESTIÓN"] || "").toString().trim().toUpperCase();
      if (estado === "CONTACTO") contacto++; else if (estado === "NO CONTACTO") noContacto++;
      const conf = (item["CONFORMIDAD CLIENTE"] || "").toString().trim().toUpperCase();
      if (conf === "CONFORME") conforme++; else if (conf === "NO CONFORME") noConforme++;
      const area = (item["AREA CORRESPONDIENTE"] || "").toString().trim();
      if (area) areasMap.set(area, (areasMap.get(area) || 0) + 1);
      const sat = parseFloat(item["NIVEL SATISFACCIÓN"]);
      if (!isNaN(sat)) satisfacciones.push(sat);
    });
    const promedioSatisf = satisfacciones.length > 0 ? (satisfacciones.reduce((a, b) => a + b, 0) / satisfacciones.length).toFixed(1) : "0";
    const totalAreasValidas = Array.from(areasMap.values()).reduce((a, b) => a + b, 0);
    const areaPrincipal = Array.from(areasMap.entries()).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
    this.dataResumen = [{ contacto, noContacto, conforme, noConforme, area: areaPrincipal[0], porcentajeArea: totalAreasValidas > 0 ? ((areaPrincipal[1] / totalAreasValidas) * 100).toFixed(0) : "0", satisfaccion: promedioSatisf }];
  }

  totalGestionesPorSedeYTipoCliente() {
    const f = this.obtenerFechaSeleccionada();
    if (!f) { this.dataGestionPorSedeYCliente = []; return; }
    const resultado: any[] = [];
    const sedesUnicas = Array.from(new Set(this.dataOriginal.map(item => item['SEDE']?.toUpperCase().trim()))).filter(s => s);
    sedesUnicas.forEach(sede => {
      const registrosSede = this.dataOriginal.filter(item => item['SEDE']?.toUpperCase().trim() === sede && this.esMismaFecha(item['Marca temporal'], f.dia, f.mes, f.anio));
      if (registrosSede.length > 0) {
        const fila: any = { SEDE: sede, VIGENTE: 0, "NO VIGENTE": 0, BRILLA: 0, EFECTIVA: 0, DORMIDO: 0, NUEVO: 0, CANCELADO: 0, "LOVER A": 0, "LOVER B": 0, REENGANCHE: 0, TOTAL: 0 };
        registrosSede.forEach(item => {
          const tipo = item['TIPO DE CLIENTE']?.toUpperCase().trim();
          if (fila.hasOwnProperty(tipo)) fila[tipo]++;
          fila.TOTAL++;
        });
        resultado.push(fila);
      }
    });
    this.dataGestionPorSedeYCliente = resultado;
  }

  totalGestionesPorAsesorYTipoCliente() { /* Omitido por ahora */ }

  graficoData() {
    this.totalContactados = this.dataContactabilidad.reduce((acc, val) => acc + (val.CONTACTO || 0), 0);
    this.totalGestiones = this.dataContactabilidad.reduce((acc, val) => acc + (val.TOTAL || 0), 0);
    this.totalContactadosCall = this.dataContactabilidadCall.reduce((acc, val) => acc + (val.CONTACTO || 0), 0);
    this.totalContactadosRealzza = this.dataContactabilidadRealzza.reduce((acc, val) => acc + (val.CONTACTO || 0), 0);

    const agendCall = this.dataAgendamientosCall.reduce((acc, val) => acc + (val.AGENDAMIENTO || 0), 0);
    const agendRealzza = this.dataAgendamientosRealzza.reduce((acc, val) => acc + (val.AGENDAMIENTO || 0), 0);
    const totalAgend = agendCall + agendRealzza;
    this.totalAgendamientosCall = agendCall;
    this.totalAgendamientosRealzza = agendRealzza;
    this.totalAgendamientos = totalAgend;
    this.porcentajeAgendamientoTotal = this.metaAgendamientoEquipo > 0
      ? Math.min(Math.round((totalAgend / this.metaAgendamientoEquipo) * 100), 100) : 0;

    const totalDeriv = this.dataDerivaciones.reduce((acc, val) => acc + (val.DERIVACION || 0), 0);
    this.totalDerivaciones = totalDeriv;
    this.totalDerivacionesCall = this.dataDerivacionesCall.reduce((acc, val) => acc + (val.DERIVACION || 0), 0);
    this.totalDerivacionesRealzza = this.dataDerivacionesRealzza.reduce((acc, val) => acc + (val.DERIVACION || 0), 0);
    this.porcentajeDerivacionTotal = this.metaDerivacionEquipo > 0
      ? Math.min(Math.round((totalDeriv / this.metaDerivacionEquipo) * 100), 100) : 0;

    this.totalInteresados = totalAgend + totalDeriv;

    this.dataGrafico = [
      { categoria: 'CONTACTADOS', valor: this.totalContactados, color: '#76d945' },
      { categoria: 'INTERESADOS', valor: this.totalInteresados, color: '#c6ce00' },
      { categoria: 'DERIVADOS', valor: this.totalDerivaciones, color: '#734222' }
    ];
  }

  onChartInit(e: any) {
    const chartInstance = e.component;
    chartInstance.option('customizePoint', (pointInfo: any) => ({ color: pointInfo.data.color }));
    chartInstance.refresh();
  }

  get tituloGrafico(): string { return `GESTIÓN DIARIA - ${this.formCierreGestion.controls['fechaGestion'].value.toLocaleDateString()}`; }
  get tituloGraficoVentasDiarias(): string { return `VENTA DIARIA - SEMANAL`; }

  // 🔹🔹🔹 LÓGICA DE IMPORTACIÓN Y FILTRADO (AQUÍ ESTÁ EL CAMBIO SOLICITADO) 🔹🔹🔹
  importar(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const fechaFiltro = this.formCierreGestion.get('fechaGestion')?.value;
    if (!fechaFiltro) {
      alert("Por favor selecciona una fecha de gestión primero.");
      return;
    }
    const mesFiltro = fechaFiltro.getMonth(); // 0-11
    const anioFiltro = fechaFiltro.getFullYear();

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook: XLSX.WorkBook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      const ventasTotales = jsonData.map((row: any) => {
        const fechaVenta = this.getFechaJS(row['FECHAVENTA']);
        const monto = this.parseNumber(row['MontoConsolidado']);

        // Identificar Equipo y Sede
        const codigoAsesor = (row['AsesorVenta'] || '').toString().trim();
        const vendedorNombre = (row['Vendedor'] || '').toString().trim().toUpperCase(); // Columna Realzza
        const sede = (row['Sede'] || '').toString().trim().toUpperCase(); // 🔹 Capturamos la Sede

        let equipo = 'DESCONOCIDO';
        let nombreMostrar = 'Desconocido';

        // A) Validar Call Center
        const foundCall = this.asesoresCall.find(a => a.value === codigoAsesor);
        if (foundCall) {
          equipo = 'CALL';
          nombreMostrar = foundCall.viewValue;
        }
        // B) Validar Realzza
        else {
          const foundRealzza = this.asesoresRealzza.find(a => a.viewValue.toUpperCase() === vendedorNombre);
          if (foundRealzza) {
            equipo = 'REALZZA';
            nombreMostrar = foundRealzza.viewValue;
          }
        }

        return {
          IDVENTA: row['IDVENTA'],
          FECHAVENTA: fechaVenta,
          MontoConsolidado: monto,
          Equipo: equipo,
          Sede: sede, // 🔹 Guardamos la sede para el filtro posterior
          AsesorVenta: nombreMostrar
        };
      });

      // 3. FILTRADO: MES + EQUIPO + (REALZZA SOLO TIENDA)
      this.filtroVentas = ventasTotales.filter(v => {
        const esMesCorrecto = v.FECHAVENTA.getMonth() === mesFiltro && v.FECHAVENTA.getFullYear() === anioFiltro;

        if (!esMesCorrecto) return false;

        // 🔹 Lógica específica para Realzza: Solo "SEDE REALZZA STORE"
        if (v.Equipo === 'REALZZA') {
          return v.Sede === 'SEDE REALZZA STORE';
        }

        // Para Call Center o cualquier otro, pasa normal si es CALL
        return v.Equipo === 'CALL';
      });

      // 4. EJECUTAR CALCULOS
      this.generarChartData();
      this.calculosProyeccion();
      this.generarChartMontoPorDia();
      this.generarTablaOperacionesPorDiaMesActual();
    };

    reader.readAsArrayBuffer(file);
  }

  calculosProyeccion(): void {
    const fechaFiltro = this.formCierreGestion.get('fechaGestion')?.value || new Date();
    const hoy = new Date();
    const diasMesActual = new Date(fechaFiltro.getFullYear(), fechaFiltro.getMonth() + 1, 0).getDate();

    const esMesActual = (fechaFiltro.getMonth() === hoy.getMonth() && fechaFiltro.getFullYear() === hoy.getFullYear());
    const diasTranscurridos = esMesActual ? Math.max(hoy.getDate() - 1, 1) : diasMesActual;

    const ventasCall = this.filtroVentas.filter(v => v.Equipo === 'CALL');
    const ventasRealzza = this.filtroVentas.filter(v => v.Equipo === 'REALZZA');

    this.ventasCallCount = ventasCall.length;
    this.montoCall = Math.round(ventasCall.reduce((sum, v) => sum + v.MontoConsolidado, 0));
    const diarioCall = diasTranscurridos > 0 ? this.montoCall / diasTranscurridos : 0;
    this.proyeccionCall = Math.round(diarioCall * diasMesActual);

    this.ticketCall = this.ventasCallCount > 0 ? Math.round(this.montoCall / this.ventasCallCount) : 0;

    this.ventasRealzzaCount = ventasRealzza.length;
    this.montoRealzza = Math.round(ventasRealzza.reduce((sum, v) => sum + v.MontoConsolidado, 0));
    const diarioRealzza = diasTranscurridos > 0 ? this.montoRealzza / diasTranscurridos : 0;
    this.proyeccionRealzza = Math.round(diarioRealzza * diasMesActual);

    this.ticketRealzza = this.ventasRealzzaCount > 0 ? Math.round(this.montoRealzza / this.ventasRealzzaCount) : 0;

    this.totalVentas = this.ventasCallCount + this.ventasRealzzaCount;
    this.totalMontoVentas = this.montoCall + this.montoRealzza;

    this.ticket = this.totalVentas ? Math.round(this.totalMontoVentas / this.totalVentas) : 0;
    this.proyeccion = this.proyeccionCall + this.proyeccionRealzza;
  }

  generarChartData(): void {
    const agrupado = new Map<string, { monto: number, equipo: string }>();

    for (const venta of this.filtroVentas) {
      const asesor = venta.AsesorVenta;
      const monto = venta.MontoConsolidado;
      const equipo = venta.Equipo;

      if (agrupado.has(asesor)) {
        const current = agrupado.get(asesor)!;
        current.monto += monto;
      } else {
        agrupado.set(asesor, { monto, equipo });
      }
    }

    // 🔹 FILTRO PARA EL GRÁFICO: Solo mostrar si MontoTotal > 0
    this.chartData = Array.from(agrupado, ([AsesorVenta, data]) => ({
      AsesorVenta,
      MontoTotal: Math.round(data.monto),
      Color: data.equipo === 'CALL' ? '#1e3a8a' : '#f59e0b'
    }))
      .filter(item => item.MontoTotal > 0) // <--- ESTO OCULTA LOS CEROS
      .sort((a, b) => b.MontoTotal - a.MontoTotal);
  }

  generarChartMontoPorDia(): void {
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const mapaDias = new Map<string, { call: number, realzza: number }>();

    diasSemana.forEach(d => mapaDias.set(d, { call: 0, realzza: 0 }));

    for (const venta of this.filtroVentas) {
      const fecha = new Date(venta.FECHAVENTA);
      const diaTexto = diasSemana[fecha.getDay()];
      const monto = venta.MontoConsolidado;

      const current = mapaDias.get(diaTexto)!;
      if (venta.Equipo === 'CALL') current.call += monto;
      if (venta.Equipo === 'REALZZA') current.realzza += monto;
    }

    this.chartPorDia = diasSemana.map(dia => ({
      Dia: dia,
      MontoCall: Math.round(mapaDias.get(dia)!.call),
      MontoRealzza: Math.round(mapaDias.get(dia)!.realzza)
    }));
  }

  customizeTooltipVentas(arg: any) {
    return {
      text: `${arg.seriesName}: S/. ${arg.valueText}`
    };
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
    return typeof value === 'string' ? Number(value.replace(',', '').replace(/[^0-9.]/g, '')) || 0 : value || 0;
  }

  generarTablaOperacionesPorDiaMesActual(): void {
    if (!this.filtroVentas || this.filtroVentas.length === 0) {
      this.operacionesPorDiaMesActual = [];
      this.columnasDiasMes = [];
      return;
    }

    const fechas = this.filtroVentas.map(v => new Date(v.FECHAVENTA));
    const fechaInicio = new Date(Math.min(...fechas.map(f => f.getTime())));
    const fechaFin = new Date(Math.max(...fechas.map(f => f.getTime())));

    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const dias: string[] = [];
    let cursor = new Date(fechaInicio);
    while (cursor <= fechaFin) {
      const diaNumero = cursor.getDate().toString();
      dias.push(diaNumero);
      cursor.setDate(cursor.getDate() + 1);
    }
    this.columnasDiasMes = dias;

    const codigosAsesores = [...new Set(this.filtroVentas.map(v => v.AsesorVenta))];

    const tabla: any[] = codigosAsesores.map(codigo => {
      const asesorObj = this.asesoresCall.find(a => a.value === codigo) || this.asesoresRealzza.find(a => a.value === codigo);
      const nombreAsesor = asesorObj ? asesorObj.viewValue : codigo;
      const fila: any = { Asesor: nombreAsesor };

      dias.forEach(dia => {
        const count = this.filtroVentas.filter(v => {
          const f = new Date(v.FECHAVENTA);
          // Ojo: Aquí comparamos contra el nombre 'AsesorVenta' que ya procesamos en el filtro, no el código original
          return v.AsesorVenta === nombreAsesor &&
            f.getDate().toString() === dia &&
            f.getMonth() === fechaInicio.getMonth() &&
            f.getFullYear() === fechaInicio.getFullYear();
        }).length;
        fila[dia] = count;
      });
      return fila;
    });
    this.operacionesPorDiaMesActual = tabla;
  }

  totalDerivacionesPorSede(): void {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();
    if (!fechaSeleccionada) { this.dataDerivacionesXSEDE = []; return; }
    const { dia, mes, anio } = fechaSeleccionada;
    const motivosValidos = ['venta derivada para cierre a sede', 'visitará tienda', 'se envió a asesor visita a domicilio'];
    const resultado: any[] = [];
    const sedesUnicas = Array.from(new Set(this.dataOriginal.map(item => item['SEDE']?.toUpperCase().trim()))).filter(s => s);

    sedesUnicas.forEach(sede => {
      const registrosSede = this.dataOriginal.filter(item => {
        const motivo = (item['MOTIVO INTERÉS'] || "").toString().trim().toLowerCase();
        return (
          item['SEDE']?.toUpperCase().trim() === sede &&
          this.esMismaFecha(item['Marca temporal'], dia, mes, anio) &&
          motivosValidos.includes(motivo)
        );
      });
      const totalDerivaciones = registrosSede.length;
      if (totalDerivaciones > 0) {
        resultado.push({ SEDE: sede, DERIVACIONES: totalDerivaciones });
      }
    });
    this.dataDerivacionesXSEDE = resultado;
  }

  totalGestionesPorAsesorYTipo() {
    const f = this.obtenerFechaSeleccionada();
    if (!f) {
      this.dataGestionPorAsesorYTipoCliente = [];
      return;
    }

    // 1. Combinar fuentes (usamos ambas porque un asesor de Call podría aparecer en dataRealzza por error o cruce)
    const dataCombinada = [...this.dataOriginal, ...this.dataRealzza];

    // 2. Filtrar por la fecha seleccionada
    const registrosDelDia = dataCombinada.filter(item =>
      this.esMismaFecha(item['Marca temporal'], f.dia, f.mes, f.anio)
    );

    // 3. Crear un Set de nombres de asesores de Call Center para búsqueda rápida
    const nombresAsesoresCall = new Set(this.asesoresCall.map(a => a.viewValue.toUpperCase().trim()));

    // 4. Identificar Tipos de Cliente únicos (solo de los registros que pertenecen a Call Center)
    const tiposSet = new Set<string>();
    registrosDelDia.forEach(item => {
      const nombreAsesor = (item['ASESOR CONTACT'] || item['ASESOR REALZZA'] || '').toUpperCase().trim();
      if (nombresAsesoresCall.has(nombreAsesor)) {
        const tipo = item['TIPO DE CLIENTE']?.toUpperCase().trim();
        if (tipo) tiposSet.add(tipo);
      }
    });
    this.columnasTiposCliente = Array.from(tiposSet).sort();

    // 5. Agrupar por Asesor (Solo Leoncito)
    const agrupadoPorAsesor = new Map<string, any>();

    registrosDelDia.forEach(item => {
      const nombreAsesor = (item['ASESOR CONTACT'] || item['ASESOR REALZZA'] || '').toUpperCase().trim();

      // 🔹 FILTRO CLAVE: Solo si el asesor está en la lista de Call Center
      if (nombresAsesoresCall.has(nombreAsesor)) {
        const tipoCliente = item['TIPO DE CLIENTE']?.toUpperCase().trim();

        if (!agrupadoPorAsesor.has(nombreAsesor)) {
          const nuevaFila: any = { Asesor: nombreAsesor, TOTAL_GENERAL: 0 };
          this.columnasTiposCliente.forEach(tipo => nuevaFila[tipo] = 0);
          agrupadoPorAsesor.set(nombreAsesor, nuevaFila);
        }

        const fila = agrupadoPorAsesor.get(nombreAsesor);
        if (tipoCliente && this.columnasTiposCliente.includes(tipoCliente)) {
          fila[tipoCliente]++;
          fila.TOTAL_GENERAL++;
        }
      }
    });

    this.dataGestionPorAsesorYTipoCliente = Array.from(agrupadoPorAsesor.values())
      .sort((a, b) => b.TOTAL_GENERAL - a.TOTAL_GENERAL);
  }

  getSemanaISO(date: Date): string { return ''; }
  generarOperacionesScheduler(): void { }
  generarTotalesScheduler(): void { }
  getAsesorColor(asesor: string): string { return '#000'; }
  onMouseLeave(e?: MouseEvent) { this.scheduler.instance.hideAppointmentTooltip(); }
  onMouseEnter(e: any, model: any) { }

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
        if (valor > 85) { e.cellElement.style.backgroundColor = '#4CAF50'; e.cellElement.style.color = 'black'; }
        else if (valor >= 50 && valor <= 85) { e.cellElement.style.backgroundColor = '#FFEB3B'; e.cellElement.style.color = 'black'; }
        else if (valor < 50) { e.cellElement.style.backgroundColor = '#d68e3bff'; e.cellElement.style.color = 'black'; }
      }
    }
    if (e.column?.dataField === 'META') {
      const valor = e.value * 100;
      if (valor > 85) { e.cellElement.style.backgroundColor = '#4CAF50'; e.cellElement.style.color = 'black'; }
      else if (valor >= 50 && valor <= 85) { e.cellElement.style.backgroundColor = '#FFEB3B'; e.cellElement.style.color = 'black'; }
      else if (valor < 50) { e.cellElement.style.backgroundColor = '#d68e3bff'; e.cellElement.style.color = 'black'; }
    }
  }

  onCellPreparedVA(e: any) {
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
    if (e.rowType === 'data') {
      e.cellElement.style.border = '1px solid #ccc';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';
      if (e.column?.dataField !== 'Asesor') {
        const valor = e.value;
        if (valor && valor > 0) { e.cellElement.style.backgroundColor = '#7dd17fff'; e.cellElement.style.color = 'black'; }
        else { e.cellElement.style.backgroundColor = '#e66a6aff'; e.cellElement.style.color = 'black'; }
      }
    }
  }

  toggleKpi(tipo: string): void {
    this.kpiSeleccionado = this.kpiSeleccionado === tipo ? null : tipo;
  }

  get detalleKpiActual(): any[] {
    switch (this.kpiSeleccionado) {
      case 'agend-call':    return this.dataAgendamientosCall;
      case 'agend-realzza': return this.dataAgendamientosRealzza;
      case 'deriv-call':    return this.dataDerivacionesCall;
      case 'deriv-realzza': return this.dataDerivacionesRealzza;
      default: return [];
    }
  }

  get campoValorKpi(): string {
    if (this.kpiSeleccionado?.startsWith('agend')) return 'AGENDAMIENTO';
    if (this.kpiSeleccionado?.startsWith('deriv')) return 'DERIVACION';
    return '';
  }

  get tituloDetalleKpi(): string {
    const titulos: Record<string, string> = {
      'agend-call':    '📅 Agendamientos · Call Center',
      'agend-realzza': '📅 Agendamientos · Realzza',
      'deriv-call':    '🔄 Derivaciones · Call Center',
      'deriv-realzza': '🔄 Derivaciones · Realzza',
    };
    return this.kpiSeleccionado ? (titulos[this.kpiSeleccionado] ?? '') : '';
  }

  onAppointmentClick(e: any): void { e.cancel = true; }
  onAppointmentDblClick(e: any): void { e.cancel = true; }
  customizeTooltip = (arg: any) => ({ text: `${arg.argumentText}: (${arg.percentText})` });

  onChartRankingInit(e: any) {
    const chart = e.component;
    chart.option('customizePoint', (pointInfo: any) => {
      return { color: pointInfo.data.Color };
    });
  }

  customizeTooltipRanking(arg: any) {
    return {
      text: `<b>${arg.argumentText}</b><br/>Venta: S/. ${arg.valueText}`
    };
  }

  // Función para ocultar ceros en las barras apiladas
  customizeLabelVentas(arg: any) {
    if (arg.value === 0) {
      return ''; // Si el valor es 0, no muestra nada
    }
    return arg.valueText; // Si tiene venta, muestra el número
  }
}