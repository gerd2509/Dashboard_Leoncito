import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { AuthService } from '../../services/auth.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { nombreCorto as nombreCortoCompartido } from '../../shared/asesores';
import { AsesoresPorTienda, NOMBRE_CORTO_PIURA } from '../../shared/asesores-por-tienda';
import { TIENDAS_REALZZA, esGestorTiendaRealzza, tiendaFijaRealzza } from '../../shared/canal-usuario';
import * as XLSX from 'xlsx';
import { DxSchedulerComponent } from 'devextreme-angular';

import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

// Gestión de UNA tienda (Call Center o una de las 3 Realzza) lista para pintar sus 3
// grillas. `customizeTextoPct` va pre-armado (closure con el % ya calculado) porque
// DevExtreme necesita una función estable por columna de resumen.
interface BloqueTienda {
  key: string; nombre: string; icono: string; claseBarra: string;
  campoAsesor: string;
  kommo: any[]; market: any[]; contactabilidad: any[];
  pctTotal: string;
  customizeTextoPct: (arg: any) => string;
}

@Component({
  selector: 'app-cierre-gestion',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './cierre-gestion.component.html',
  styleUrl: './cierre-gestion.component.css'
})
export class CierreGestionComponent implements OnInit {
  protected service = inject(SheetsService);
  protected auth    = inject(AuthService);
  private cap = inject(CapSedesService);
  private tiendas = new AsesoresPorTienda(this.cap);

  // Tienda: Call Center · Realzza Chiclayo/Piura/Lima (asesores del CAP) · Todas (stackea
  // la gestión de cada una, una debajo de otra). Un gestor Realzza de Piura/Lima no ve el
  // combo (fijo a su tienda); un jefe general de Realzza (soloRealzza) no ve Call Center.
  readonly tiendaGestor = esGestorTiendaRealzza(this.auth.getUsuario()) ? tiendaFijaRealzza(this.auth.getUsuario()) : '';
  tiendaCierre = this.tiendaGestor || 'TODAS';

  get tiendasOpciones() {
    const base = this.soloRealzza
      ? [...TIENDAS_REALZZA]
      : [{ value: 'CALL', viewValue: 'CALL CENTER' }, ...TIENDAS_REALZZA];
    return [...base, { value: 'TODAS', viewValue: 'TODAS LAS TIENDAS' }];
  }

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
  dataRealzza: any[] = [];  // Data Campo/Realzza (todas las tiendas, sin filtrar)
  // Postventa: ya no se usa — se deja el dataset (sin cargar) y la lógica comentada
  // más abajo por si se necesita reactivar.
  dataPostVenta: any[] = [];
  dataKOMMO: any[] = [];

  // Gestión por tienda (CALL CENTER / REALZZA CHICLAYO / PIURA / LIMA), una tarjeta por
  // tienda con sus 3 grillas (KOMMO, Market Place, Contactabilidad). El combo decide
  // cuáles se muestran: una sola tienda, o todas apiladas una debajo de otra.
  bloques: BloqueTienda[] = [];

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

  // Pase Kelly (CC8) / Anita (CC21) / Brenda (CC12): son Call HASTA agosto-2026 y Realzza
  // DESDE septiembre-2026. Se decide según el mes seleccionado (fechaGestion) para no
  // afectar agosto. Aurora (RZ10) salió de Realzza.
  private readonly KELLY = { value: 'CC8', viewValue: 'CHANTA CAMPOS KELLY KARINTIA' };
  private readonly ANITA = { value: 'CC21', viewValue: 'CHANAME SOTO ANITA NOEMI' };
  private readonly BRENDA = { value: 'CC12', viewValue: 'BERNAL BAZAN BRENDA NICOLL' };
  private get TRANSICION() { return [this.KELLY, this.ANITA, this.BRENDA]; }
  private get kellyAnitaRealzza(): boolean {
    const f: Date = this.formCierreGestion?.value?.fechaGestion || new Date();
    const a = f.getFullYear(), m = f.getMonth() + 1;
    return a > 2026 || (a === 2026 && m >= 9);
  }

  // LISTA ASESORES CALL CENTER (base, sin los que pasan a Realzza por fecha)
  private asesoresCallBase = [
    { value: 'CC1', viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    { value: 'CC2', viewValue: 'VALDERA PISCOYA DEXY ROSARIO' },
    { value: 'CC5', viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6', viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC15', viewValue: 'TORRES ALVARADO JUDY ESMERALDA' },
    { value: 'CC19', viewValue: 'SANDOVAL OTINIANO JUANA DEL PILAR' }
  ];

  // Listas efectivas según el mes seleccionado (Kelly/Anita/Brenda por fecha — esto
  // sigue aplicando SOLO del lado de Call; en el CAP, Realzza ya las tiene como
  // ACTIVAS, así que del lado de Realzza no hace falta ningún corte por fecha).
  get asesoresCall() {
    return this.kellyAnitaRealzza ? this.asesoresCallBase : [...this.asesoresCallBase, ...this.TRANSICION];
  }
  // Lista REALZZA completa (Chiclayo + Piura + Lima) — ya NO depende del combo; se usa
  // para los KPI/voz globales (siempre el equipo entero, independiente de qué tienda se
  // esté viendo en el detalle de abajo). Las 3 tiendas salen del Maestro CAP — ya no
  // hay lista hardcodeada en el código para ninguna (ver AsesoresPorTienda).
  get asesoresRealzza() {
    return [...this.asesoresRealzzaChiclayo, ...this.asesoresDeTienda('REALZZA PIURA'), ...this.asesoresDeTienda('REALZZA LIMA')];
  }
  private get asesoresRealzzaChiclayo() {
    return this.asesoresDeTienda('REALZZA');
  }
  private asesoresDeTienda(t: string): { value: string; viewValue: string }[] {
    return (this.tiendas.listaDe(t) ?? []).map(n => ({ value: n, viewValue: n }));
  }

  // ── Sublistas KOMMO (mismo corte por fecha) ──
  // Call KOMMO: KAREN, ESMERALDA (+KELLY, BRENDA hasta ago)
  private get kommoCallIds() {
    return this.kellyAnitaRealzza
      ? ['CC2', 'CC5', 'CC15']
      : ['CC2', 'CC5', 'CC15', 'CC8', 'CC12'];
  }
  // Ana Rut y Nataly no participan en Contactabilidad, KOMMO ni Market Place de Realzza
  // Chiclayo — el resto de la tienda sí, en los 3 cuadros. Por nombre completo (ya no
  // código RZ2/RZ8): el roster de Chiclayo ahora sale del CAP, donde `value` es el
  // nombre, no un código — de todos modos hoy ambas están RENUNCIA en el CAP, así que
  // ya ni aparecen en el roster activo; esto queda como red de seguridad si algún día
  // se las reactiva solo para otra función sin contactabilidad.
  private readonly SIN_CONTACTABILIDAD_REALZZA = ['ACOSTA JIMENEZ MARIELA NATALY', 'BUSTAMANTE CHALAN ANA RUT'];
  private get asesoresRealzzaChiclayoContactables() {
    return this.asesoresRealzzaChiclayo.filter(a => !this.SIN_CONTACTABILIDAD_REALZZA.includes(a.value));
  }

  get asesoresKommoCall() {
    return this.kommoCallIds
      .map(id => this.asesoresCall.find(a => a.value === id))
      .filter((a): a is { value: string; viewValue: string } => !!a);
  }
  private textoPctTotal(d: any[]): string {
    const c = d.reduce((a, r) => a + (r['CONTACTO'] || 0), 0);
    const t = d.reduce((a, r) => a + (r['TOTAL'] || 0), 0);
    return `${t > 0 ? Math.round((c / t) * 100) : 0}%`;
  }

  asesorMap: { [codigo: string]: string } = {
    'CC10': 'Yudith', 'CC6': 'Maria', 'CC1': 'Patricia',
    'CC8': 'Kelly', 'CC3': 'Felicita', 'CC5': 'Karen', 'CC11': 'Ariadne'
  };

  // Nombres cortos para Call Center (sigue siendo por código CC, lista propia del canal).
  // Realzza (Chiclayo/Piura/Lima) ya no usa código — su nombre corto sale del mapa
  // compartido `nombreCortoCompartido` (shared/asesores.ts), que tiene a todo el equipo.
  nombresCortos: Record<string, string> = {
    'CC1':  'PATRICIA', 'CC2':  'DEXY',     'CC3':  'FELICITA', 'CC5':  'KAREN',   'CC6':  'MARIA',
    'CC8':  'KELLY',    'CC11': 'ARIADNE',  'CC12': 'BRENDA',  'CC13': 'FRANCIS',
    'CC15': 'ESMERALDA','CC16': 'ROSMERY',  'CC21': 'ANITA',   'CC22': 'FABRICIO',
    'CC26': 'NOEMI',    'CC19': 'JUANA',
  };

  // Devuelve el nombre corto del asesor: por código (Call), por el mapa de Piura, o por
  // el mapa compartido (Chiclayo/Lima y cualquier otro no mapeado, con heurística).
  private nombreCorto(asesor: { value: string; viewValue: string }): string {
    const nombre = asesor.viewValue.toUpperCase().trim();
    return this.nombresCortos[asesor.value] || NOMBRE_CORTO_PIURA[nombre] || nombreCortoCompartido(nombre);
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

  // Rango = mes de la fecha de gestión seleccionada (los cálculos filtran por
  // marca_temporal del día/mes) → se traen solo las gestiones de ese mes, no todo.
  private rangoMes(): { desde: Date; hasta: Date } {
    const f: Date = this.formCierreGestion?.value?.fechaGestion || new Date();
    return { desde: new Date(f.getFullYear(), f.getMonth(), 1), hasta: new Date(f.getFullYear(), f.getMonth() + 1, 0) };
  }

  async ngOnInit() {
    this.isLoading = true;
    try {
      await this.tiendas.cargar();
      const r = this.rangoMes();
      const [dataCall, dataRealzza, dataKOMMO] = await Promise.all([
        lastValueFrom(this.service.getSheetDataCallRango(r)),   // BD gestion_call (mes)
        lastValueFrom(this.service.getSheetDataCampoRango(r)),  // BD gestion_realzza (mes)
        // Postventa: ya no se usa — se deja comentada la carga.
        // lastValueFrom(this.service.getSheetDataPostVenta()),
        lastValueFrom(this.service.getSheetKOMMORango(r))       // BD gestion_kommo (mes)
      ]);

      this.dataOriginal = dataCall;
      this.dataRealzza = dataRealzza;
      // this.dataPostVenta = dataPost;
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

  /** El combo solo decide qué tiendas se muestran — ya no recalcula nada. */
  setTiendaCierre(t: string): void {
    if (this.tiendaGestor) return;
    this.tiendaCierre = t || 'TODAS';
  }

  /** Bloques (tiendas) a pintar según el combo: uno solo, o todos apilados en "Todas". */
  get bloquesVisibles(): BloqueTienda[] {
    if (this.tiendaCierre === 'TODAS') {
      return this.soloRealzza ? this.bloques.filter(b => b.key !== 'CALL') : this.bloques;
    }
    return this.bloques.filter(b => b.key === this.tiendaCierre);
  }

  calcularIndicadoresCompletos() {
    this.construirBloques();
    this.sincronizarCamposLegado();
    this.calcularAgendamientosCall();
    this.calcularAgendamientosRealzza();
    this.calcularDerivacionesCall();
    this.calcularDerivacionesRealzza();
    this.totalGestionesPorSedeYTipoCliente();
    this.totalDerivacionesPorSede();
    this.graficoData();
    // Postventa: ya no se usa — queda comentado para no perder la lógica.
    // this.generarGraficoAreasFiltrado();
    // this.generarGraficoEstadoGestionFiltrado();
    // this.generarGraficoSatisfaccionFiltrado();
    // this.generarGraficoConformidadFiltrado();
    // this.procesarDatosPostVentaFiltrada();
    this.totalGestionesPorAsesorYTipo();
  }

  async actualizar() {
    this.isLoading = true;
    try {
      await this.tiendas.cargar();
      const r = this.rangoMes();
      const [dataCall, dataRealzza, dataKOMMO] = await Promise.all([
        lastValueFrom(this.service.getSheetDataCallRango(r)),   // BD gestion_call (mes)
        lastValueFrom(this.service.getSheetDataCampoRango(r)),  // BD gestion_realzza (mes)
        // Postventa: ya no se usa — se deja comentada la carga.
        // lastValueFrom(this.service.getSheetDataPostVenta()),
        lastValueFrom(this.service.getSheetKOMMORango(r))       // BD gestion_kommo (mes)
      ]);
      this.dataOriginal = dataCall;
      this.dataRealzza = dataRealzza;
      // this.dataPostVenta = dataPost;
      this.dataKOMMO = dataKOMMO;
      this.calcularIndicadoresCompletos();
    } catch (error) {
      console.error('Error al actualizar datos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /** Construye la gestión de cada tienda (Call Center + las 3 Realzza) en bloques
   *  independientes del combo — este solo decide cuáles se muestran (ver `bloquesVisibles`). */
  private construirBloques(): void {
    type Def = {
      key: string; nombre: string; icono: string; claseBarra: string;
      campoAsesor: string; campoEstado: string; campoMarket: string;
      dataContactab: any[]; dataKommo: any[];
      asesoresContactab: { value: string; viewValue: string }[];
      asesoresKommo: { value: string; viewValue: string }[];
      // Call Center usa un subconjunto chico de asesores para KOMMO (no market) pero
      // TODOS para Market Place; en Realzza ambos usan la misma lista.
      asesoresMarket?: { value: string; viewValue: string }[];
    };
    const defs: Def[] = [
      {
        key: 'CALL', nombre: 'CALL CENTER', icono: '📞', claseBarra: 'call-bar',
        campoAsesor: 'ASESOR CONTACT', campoEstado: 'ESTADO DE GESTIÓN', campoMarket: 'MARKET PLACE L',
        dataContactab: this.dataOriginal, dataKommo: this.dataKOMMO,
        asesoresContactab: this.asesoresCall, asesoresKommo: this.asesoresKommoCall, asesoresMarket: this.asesoresCall,
      },
      {
        key: 'REALZZA', nombre: 'REALZZA CHICLAYO', icono: '🏢', claseBarra: 'realzza-bar',
        campoAsesor: 'ASESOR REALZZA', campoEstado: 'ESTADO DE GESTIÓN REALZZA', campoMarket: 'MARKET PLACE R',
        dataContactab: this.dataRealzza, dataKommo: this.dataKOMMO,
        asesoresContactab: this.asesoresRealzzaChiclayoContactables, asesoresKommo: this.asesoresRealzzaChiclayoContactables,
      },
      {
        key: 'REALZZA PIURA', nombre: 'REALZZA PIURA', icono: '🏢', claseBarra: 'realzza-bar',
        campoAsesor: 'ASESOR REALZZA', campoEstado: 'ESTADO DE GESTIÓN REALZZA', campoMarket: 'MARKET PLACE R',
        dataContactab: this.dataRealzza, dataKommo: this.dataKOMMO,
        asesoresContactab: this.asesoresDeTienda('REALZZA PIURA'), asesoresKommo: this.asesoresDeTienda('REALZZA PIURA'),
      },
      {
        key: 'REALZZA LIMA', nombre: 'REALZZA LIMA', icono: '🏢', claseBarra: 'realzza-bar',
        campoAsesor: 'ASESOR REALZZA', campoEstado: 'ESTADO DE GESTIÓN REALZZA', campoMarket: 'MARKET PLACE R',
        dataContactab: this.dataRealzza, dataKommo: this.dataKOMMO,
        asesoresContactab: this.asesoresDeTienda('REALZZA LIMA'), asesoresKommo: this.asesoresDeTienda('REALZZA LIMA'),
      },
    ];

    this.bloques = defs.map(d => {
      const contactabilidad = this.procesarContactabilidad(d.dataContactab, d.asesoresContactab, d.campoAsesor, true);
      const kommo  = this.procesarContactabilidadKOMMO(d.dataKommo, d.asesoresKommo, d.campoAsesor, d.campoEstado, d.campoMarket, false);
      const market = this.procesarContactabilidadKOMMO(d.dataKommo, d.asesoresMarket ?? d.asesoresKommo, d.campoAsesor, d.campoEstado, d.campoMarket, true);
      const pctTotal = this.textoPctTotal(contactabilidad);
      return {
        key: d.key, nombre: d.nombre, icono: d.icono, claseBarra: d.claseBarra, campoAsesor: d.campoAsesor,
        contactabilidad, kommo, market, pctTotal,
        customizeTextoPct: (_arg: any) => pctTotal,
      };
    });
  }

  /** Mapea los bloques a los campos "globales" que usan las tarjetas KPI, el reporte de
   *  voz y los gráficos — para no tocar esa lógica, que no depende del combo de tienda. */
  private sincronizarCamposLegado(): void {
    const call = this.bloques.find(b => b.key === 'CALL');
    const realzza = this.bloques.filter(b => b.key !== 'CALL');

    this.dataContactabilidadCall = call?.contactabilidad ?? [];
    this.dataContactabilidadRealzza = realzza.flatMap(b => b.contactabilidad);
    this.dataContactabilidadKOMMOCall = call?.kommo ?? [];
    this.dataContactabilidadKOMMOCallMarket = call?.market ?? [];
    this.dataContactabilidadKOMMORealzza = realzza.flatMap(b => b.kommo);
    this.dataContactabilidadKOMMORealzzaMarket = realzza.flatMap(b => b.market);

    this.dataContactabilidad = [...this.dataContactabilidadCall, ...this.dataContactabilidadRealzza];

    // % global final = sobre el total de las 4 tablas KOMMO (igual que antes).
    const totalKommo = [
      ...this.dataContactabilidadKOMMOCall, ...this.dataContactabilidadKOMMOCallMarket,
      ...this.dataContactabilidadKOMMORealzza, ...this.dataContactabilidadKOMMORealzzaMarket,
    ];
    const c = totalKommo.reduce((a, r) => a + (r['CONTACTO'] || 0), 0);
    const t = totalKommo.reduce((a, r) => a + (r['TOTAL'] || 0), 0);
    this.porcentajeTotalContactabilidad = t > 0 ? Math.round((c / t) * 100) : 0;
  }

  private procesarContactabilidad(dataSource: any[], listaAsesores: any[], nombreColumnaAsesor: string, dedupePorDni = false): any[] {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();
    if (!fechaSeleccionada) return [];

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    listaAsesores.forEach(asesor => {
      const registrosAsesor = dataSource.filter(item =>
        item[nombreColumnaAsesor]?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim() &&
        this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
      );

      let contacto = 0, cortaLlamada = 0, noContacto = 0;

      if (dedupePorDni) {
        // Gestiones REALES: 1 registro por DNI aunque tenga varios teléfonos
        // gestionados. El estado del DNI = mejor resultado entre sus gestiones
        // (CONTACTO > CORTA LLAMADA > NO CONTACTO).
        const porDni = new Map<string, string>();
        registrosAsesor.forEach((r, i) => {
          const cat = this.categoriaContacto(r);
          if (!cat) return;
          const dni = this.soloDigitos(r['DNI CLIENTE']);
          const clave = dni ? `dni:${dni}` : `row:${i}`;   // sin DNI → cuenta individual
          const prev = porDni.get(clave);
          if (!prev || this.rankCategoria(cat) > this.rankCategoria(prev)) porDni.set(clave, cat);
        });
        porDni.forEach(cat => {
          if (cat === 'CONTACTO') contacto++;
          else if (cat === 'CORTA') cortaLlamada++;
          else noContacto++;
        });
      } else {
        const registrosContacto = registrosAsesor.filter(r => r['ESTADO DE GESTIÓN'] === 'CONTACTO');
        cortaLlamada = registrosContacto.filter(r => r['MOTIVO NO INTERÉS'] === 'CORTA LLAMADA').length;
        contacto = registrosContacto.length - cortaLlamada;
        noContacto = registrosAsesor.filter(r => r['ESTADO DE GESTIÓN'] === 'NO CONTACTO').length;
      }

      const total = contacto + cortaLlamada + noContacto;

      resultado.push({
        'ASESOR ID': asesor.value,
        [nombreColumnaAsesor]: this.nombreCorto(asesor),
        'CONTACTO': contacto,
        'CORTA LLAMADA': cortaLlamada,
        'NO CONTACTO': noContacto,
        'TOTAL': total,
        'PORCENTAJE': total > 0 ? (contacto / total) : 0
      });
    });

    return resultado;
  }

  // Categoría de contactabilidad de una fila (para contar por DNI):
  // 'CONTACTO' (contacto real), 'CORTA' (corta llamada), 'NOCONTACTO', o null (no cuenta).
  private categoriaContacto(r: any): 'CONTACTO' | 'CORTA' | 'NOCONTACTO' | null {
    const estado = r['ESTADO DE GESTIÓN'];
    if (estado === 'CONTACTO') {
      return r['MOTIVO NO INTERÉS'] === 'CORTA LLAMADA' ? 'CORTA' : 'CONTACTO';
    }
    if (estado === 'NO CONTACTO') return 'NOCONTACTO';
    return null;
  }
  // Prioridad para elegir el mejor resultado de un DNI: contacto > corta > no contacto.
  private rankCategoria(cat: string): number {
    return cat === 'CONTACTO' ? 3 : cat === 'CORTA' ? 2 : 1;
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

    return resultado;
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

  private soloDigitos(v: any): string {
    return (v ?? '').toString().replace(/\D/g, '');
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
      const nombre = this.getNombreParaVoz(item['ASESOR CONTACT'] ?? item['ASESOR REALZZA']);
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