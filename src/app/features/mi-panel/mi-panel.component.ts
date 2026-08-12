import { Component, OnInit, inject } from '@angular/core';
import { forkJoin } from 'rxjs';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { SheetsService } from '../../services/service-google.service';
import { ASESORES_CALL } from '../../shared/asesores';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { exportDataGrid } from 'devextreme/excel_exporter';

interface Agrupado { clave: string; monto: number; n: number; }
interface ColDet { field: string; caption: string; width?: number; type?: 'date' | 'money' | 'number' | 'text'; }
interface AgrupadoTabla { clave: string; monto: number; ops: number; ticket: number; part: number; }
interface HistMes {
  mes: string;        // 'YYYY-MM' (clave para ordenar)
  mesLabel: string;   // 'Jul - 2026' (eje)
  monto: number;
  n: number;
  crecimiento: number;        // % vs mes anterior
  proyeccion: number | null;  // solo el mes en curso
}

import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-mi-panel',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './mi-panel.component.html',
  styleUrl: './mi-panel.component.css',
})
export class MiPanelComponent implements OnInit {
  private auth = inject(AuthService);
  private ventasSvc = inject(CargaVentasService);
  private fb = inject(UntypedFormBuilder);
  private sedeCfg = inject(SedeConfigService);
  private sheets = inject(SheetsService);

  nombre = '';
  vendedor = '';
  canal = '';
  sedeKey = '';      // clave de sede del usuario (para gestión sedes)
  sedeNombre = '';   // sede a la que pertenece (para la cabecera)
  sinVendedor = false;
  cargando = false;
  error = '';

  form!: UntypedFormGroup;      // rango opcional { desde, hasta }

  // Paneles colapsables (acordeón). Abiertos por defecto: gestiones + resumen.
  abiertos: Record<string, boolean> = { gestiones: true, resumen: true, sueldo: true, graficos: false, analisis: false, evolucion: false, detalle: false };
  /** ¿Es vendedor de sede? (canal distinto de call/realzza). */
  get esSedeVendedor(): boolean {
    const c = (this.canal || '').toLowerCase();
    return c !== 'call' && c !== 'realzza';
  }

  // Popup para ampliar un gráfico. '' = cerrado.
  popupChart = '';
  ampliar(k: string): void {
    this.popupChart = k;
    setTimeout(() => window.dispatchEvent(new Event('resize')), 120);   // redibuja al tamaño grande
  }
  get popupTitulo(): string {
    return ({ entidad: 'Ventas por entidad',
      evolucion: 'Evolución de ventas mensual', gestiones: 'Gestiones del día' } as Record<string, string>)[this.popupChart] || '';
  }

  togglePanel(k: string): void {
    this.abiertos[k] = !this.abiertos[k];
    // Los gráficos DevExtreme se dibujan a 0px si el panel nace colapsado; al
    // abrirlo forzamos un redraw tras la animación de expansión.
    if (this.abiertos[k]) setTimeout(() => window.dispatchEvent(new Event('resize')), 420);
  }

  private todas: any[] = [];    // todas las ventas del vendedor
  ventas: any[] = [];           // filtradas por el rango (para el detalle)

  // KPIs
  montoTotal = 0;
  numVentas = 0;
  ticket = 0;
  montoMes = 0;

  porEntidad: Agrupado[] = [];
  historial: HistMes[] = [];

  // Columnas del detalle según canal (Call / Realzza / sede).
  columnasDetalle: ColDet[] = [];
  // Agrupaciones extra por canal (tabla con monto/ops/ticket/%).
  porContacto: AgrupadoTabla[] = [];     // Call: tipo base (contacto)
  porSedeTab: AgrupadoTabla[] = [];      // Call: por sede
  porTipoCliente: AgrupadoTabla[] = [];  // Call: por tipo de cliente
  porTipoBase: AgrupadoTabla[] = [];     // Realzza: por tipo de base
  porEntidadTab: AgrupadoTabla[] = [];   // Realzza: por entidad
  motosEntidad: AgrupadoTabla[] = [];    // Realzza: motos por entidad
  motosTipoProd: AgrupadoTabla[] = [];   // Realzza: motos por tipo de producto

  // ── Mi sueldo estimado (Call / Realzza): base + comisión por monto vendido + motos ──
  readonly sueldoBase = 1130;            // fijo para todos
  mesesSueldo: { value: string; label: string }[] = [];  // meses con ventas (YYYY-MM)
  sueldoMesSel = '';                     // mes elegido para el cálculo (YYYY-MM)
  montoVendidoMes = 0;                   // monto real vendido en el mes elegido
  comisionVentas = 0;                    // bono por monto vendido (tabla del canal)
  motosGlobal = 0;                       // motos GLOBAL GO vendidas en el mes
  tarifaMoto = 0;                        // S/ por moto (Realzza: 125 si ≥5, si no 100; Call: 125)
  pagoMotos = 0;                         // motosGlobal * tarifaMoto
  totalGanar = 0;                        // sueldoBase + comisionVentas + pagoMotos
  get aplicaSueldo(): boolean { return this.esCall || this.esRealzza; }

  // ── Mi sueldo estimado (VENDEDOR DE SEDE): comisión electro/melamina/motos + bonos ──
  sueldoSede: any = null;                 // respuesta de /ventas-sedes/sueldo
  cargandoSueldoSede = false;
  mesesSueldoSede: { value: string; label: string }[] = [];
  sueldoSedeMes = '';                     // YYYY-MM

  // Simulador "¿cuánto ganaría?": el asesor edita ventas y motos (base fijo).
  simVentas = 0;                         // monto de ventas a simular
  simMotos = 0;                          // motos GLOBAL GO a simular
  simComision = 0;                       // comisión resultante
  simTarifaMoto = 0;                     // S/ por moto según la cantidad simulada
  simPagoMotos = 0;                      // simMotos * simTarifaMoto
  simTotal = 0;                          // base + comisión + motos simulados

  // Escala de bonos por MONTO VENDIDO del mes. Son las mismas tablas que muestran
  // Ventas Call y Ventas Realzza; se toma el mayor tramo cuyo umbral ≤ monto vendido.
  private readonly bonosCall = [
    { monto: 115000, bono: 1800 }, { monto: 110000, bono: 1700 }, { monto: 105000, bono: 1600 },
    { monto: 100000, bono: 1500 }, { monto:  95000, bono: 1400 }, { monto:  90000, bono: 1300 },
    { monto:  85000, bono: 1200 }, { monto:  80000, bono: 1100 }, { monto:  75000, bono: 1000 },
    { monto:  70000, bono:  900 }, { monto:  65000, bono:  800 }, { monto:  60000, bono:  700 },
    { monto:  55000, bono:  600 }, { monto:  50000, bono:  500 }, { monto:  45000, bono:  400 },
    { monto:  40000, bono:  300 }, { monto:  35000, bono:  200 }, { monto:  30000, bono:  150 },
    { monto:  25000, bono:  100 }, { monto:  20000, bono:   75 }, { monto:  15000, bono:   50 },
  ];
  private readonly bonosRealzza = [
    { monto: 150000, bono: 2500 }, { monto: 145000, bono: 2400 }, { monto: 140000, bono: 2300 },
    { monto: 135000, bono: 2200 }, { monto: 130000, bono: 2100 }, { monto: 125000, bono: 2000 },
    { monto: 120000, bono: 1900 }, { monto: 115000, bono: 1800 }, { monto: 110000, bono: 1700 },
    { monto: 105000, bono: 1600 }, { monto: 100000, bono: 1500 }, { monto:  95000, bono: 1400 },
    { monto:  90000, bono: 1300 }, { monto:  85000, bono: 1200 }, { monto:  80000, bono: 1000 },
    { monto:  75000, bono:  800 }, { monto:  70000, bono:  650 }, { monto:  65000, bono:  600 },
    { monto:  60000, bono:  550 }, { monto:  55000, bono:  500 }, { monto:  50000, bono:  450 },
    { monto:  45000, bono:  400 }, { monto:  40000, bono:  350 }, { monto:  35000, bono:  300 },
    { monto:  30000, bono:  250 }, { monto:  25000, bono:  200 }, { monto:  20000, bono:  150 },
    { monto:  15000, bono:  100 }, { monto:  10000, bono:   50 },
  ];

  // ── Mis gestiones (Call / Realzza) — por defecto el día en curso ──
  gestAplica = false;    // solo canal call/realzza
  gestCargando = false;
  gestFecha: Date = new Date();   // día a consultar (editable por el vendedor)
  hoyMax: Date = new Date();      // no se puede elegir un día futuro
  gestHoyLabel = '';     // fecha consultada (dd/mm/yyyy) para mostrar
  get gestEsHoy(): boolean {
    const h = new Date();
    return this.gestFecha?.getDate() === h.getDate() && this.gestFecha?.getMonth() === h.getMonth() && this.gestFecha?.getFullYear() === h.getFullYear();
  }
  // Generales (llamadas) del día
  gestReales = 0;        // gestiones reales = 1 por DNI
  gestContacto = 0;
  gestCorta = 0;
  gestNoContacto = 0;
  gestPct = 0;           // % de contactabilidad
  gestChart: { clave: string; valor: number; color: string }[] = [];
  // Derivaciones / agendamientos del día (con su detalle para el popup)
  gestDerivaciones = 0;
  gestAgendamientos = 0;
  derivacionesDetalle: any[] = [];
  agendamientosDetalle: any[] = [];
  // Desglose por origen (Gestión / KOMMO / Market Place) para mostrar bajo el total del KPI.
  derivPorOrigen: Record<string, number> = {};
  agendaPorOrigen: Record<string, number> = {};
  popupDetalle: '' | 'deriv' | 'agenda' = '';
  private readonly MOTIVO_AGENDA = 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)';
  // KOMMO del día
  kommoTotal = 0; kommoContacto = 0; kommoNoContacto = 0;
  // Market Place del día
  mpTotal = 0; mpContacto = 0; mpNoContacto = 0;
  // Sede (llamadas / cartas) del día
  gestSede = false;      // true → vendedor de sede (gestión sedes)
  sedeLlamContacto = 0; sedeLlamNoContacto = 0;
  sedeCartaContacto = 0; sedeCartaNoContacto = 0;
  get sedeLlamadas(): number { return this.sedeLlamContacto + this.sedeLlamNoContacto; }
  get sedeCartas(): number { return this.sedeCartaContacto + this.sedeCartaNoContacto; }
  // Market Place (sede) del día
  sedeMpTotal = 0; sedeMpContacto = 0; sedeMpNoContacto = 0; sedeMpVnc = 0;
  sedeMpDetalle: any[] = [];
  // Derivaciones (sede) del día
  sedeDerivTotal = 0; sedeDerivDetalle: any[] = [];
  popupSede: '' | 'mp' | 'deriv' = '';

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    this.nombre = u?.nombre || '';
    this.vendedor = (u?.vendedor || '').trim();
    this.canal = u?.canal || '';
    const sede = (u?.sede || '').trim();
    this.sedeKey = sede;
    this.sedeNombre = this.sedeCfg.getConfig(sede)?.nombre
      ?? (sede ? sede.charAt(0).toUpperCase() + sede.slice(1) : '');
    this.form = this.fb.group({ desde: [null], hasta: [null] });
    this.columnasDetalle = this.columnasPorCanal();
    if (!this.vendedor) { this.sinVendedor = true; return; }
    this.cargar();
    this.cargarGestiones();
    if (this.esSedeVendedor) this.initSueldoSede();
  }

  // ── Sueldo estimado del vendedor de sede (endpoint /ventas-sedes/sueldo) ──
  private initSueldoSede(): void {
    const hoy = new Date();
    const meses: { value: string; label: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses.push({ value: v, label: this.formatMes(v) });
    }
    this.mesesSueldoSede = meses;
    this.sueldoSedeMes = meses[0].value;
    this.cargarSueldoSede();
  }

  cargarSueldoSede(): void {
    const [ay, am] = (this.sueldoSedeMes || '').split('-').map(Number);
    if (!ay || !am) return;
    this.cargandoSueldoSede = true;
    this.ventasSvc.obtenerSueldoSede(this.vendedor, ay, am).subscribe({
      next: r => { this.sueldoSede = r; this.cargandoSueldoSede = false; },
      error: () => { this.sueldoSede = null; this.cargandoSueldoSede = false; },
    });
  }

  onSueldoSedeMes(v: string): void { this.sueldoSedeMes = v; this.cargarSueldoSede(); }

  /** ¿Es vendedor Call? / Realzza? (para mostrar sus análisis específicos). */
  get esCall(): boolean { return (this.canal || '').toLowerCase() === 'call'; }
  get esRealzza(): boolean { return (this.canal || '').toLowerCase() === 'realzza'; }

  // Casos híbridos: vendedores cuyas VENTAS son de un canal pero sus GESTIONES se
  // registran en otro. BRENDA vende como Realzza pero gestiona en Call (como antes);
  // el sheet de gestión Call la tiene con otra ortografía del nombre.
  //   clave = vendedor (el de ventas)  →  { canal de gestión, nombre en el sheet de gestión }
  private readonly overrideGestion: Record<string, { canal: string; nombre: string }> = {
    'BERNAL BAZAN BRENDA NICOLL': { canal: 'call', nombre: 'BERNAL BAZAN BRENDA NICOL' },
  };
  /** Canal a usar SOLO para las gestiones (respeta el override; si no, el canal real). */
  private get canalGestion(): string {
    const o = this.overrideGestion[(this.vendedor || '').toUpperCase().trim()];
    return o ? o.canal : (this.canal || '').toLowerCase();
  }
  /** Nombre del asesor a usar SOLO para las gestiones (respeta el override). */
  private nombreGestion = '';

  /** Columnas del detalle de ventas según el canal del vendedor. */
  private columnasPorCanal(): ColDet[] {
    if (this.esCall) return [
      { field: 'codigo_cv', caption: 'ID Venta', width: 90 },
      { field: 'fecha_disp', caption: 'Fecha', type: 'date', width: 105 },
      { field: 'sede', caption: 'Sede', width: 130 },
      { field: 'monto_consolidado', caption: 'Monto', type: 'money', width: 115 },
      { field: 'cuota_inicial', caption: 'Cuota inicial', type: 'money', width: 110 },
      { field: 'productos', caption: 'Productos', width: 210 },
      { field: 'cuotas', caption: 'N° cuotas', type: 'number', width: 90 },
      { field: 'doc_identidad', caption: 'DNI cliente', width: 110 },
      { field: 'tipo_credito', caption: 'Tipo venta', width: 100 },
      { field: 'tipo_base', caption: 'Tipo base', width: 110 },
      { field: 'tipo_cliente', caption: 'Tipo cliente', width: 110 },
      { field: 'vendedor', caption: 'Asesor', width: 90 },
      { field: 'estado_venta', caption: 'Estado', width: 100 },
      { field: 'entidad', caption: 'Entidad', width: 110 },
      { field: 'contacto', caption: 'Contacto', width: 110 },
    ];
    if (this.esRealzza) return [
      { field: 'tipo_base', caption: 'Tipo base', width: 110 },
      { field: 'codigo_cv', caption: 'Código CV', width: 100 },
      { field: 'fecha_disp', caption: 'Fecha', type: 'date', width: 105 },
      { field: 'sede', caption: 'Sede', width: 140 },
      { field: 'monto_consolidado', caption: 'Monto', type: 'money', width: 115 },
      { field: 'cuota_inicial', caption: 'Cuota inicial', type: 'money', width: 110 },
      { field: 'doc_identidad', caption: 'DNI cliente', width: 110 },
      { field: 'productos', caption: 'Productos', width: 210 },
      { field: 'cuotas', caption: 'N° cuotas', type: 'number', width: 90 },
      { field: 'estado_venta', caption: 'Estado', width: 110 },
      { field: 'vendedor', caption: 'Vendedor', width: 180 },
      { field: 'entidad', caption: 'Entidad', width: 110 },
      { field: 'tipo_credito', caption: 'Tipo crédito', width: 120 },
      { field: 'tipo_producto', caption: 'Tipo producto', width: 130 },
    ];
    // Sede (por defecto)
    return [
      { field: 'fecha_disp', caption: 'Fecha', type: 'date', width: 105 },
      { field: 'cliente_venta', caption: 'Cliente', width: 180 },
      { field: 'doc_identidad', caption: 'DNI', width: 105 },
      { field: 'monto_consolidado', caption: 'Monto', type: 'money', width: 115 },
      { field: 'entidad', caption: 'Entidad', width: 120 },
      { field: 'tipo_credito', caption: 'Tipo crédito', width: 120 },
      { field: 'estado_venta', caption: 'Estado', width: 110 },
      { field: 'productos', caption: 'Productos', width: 160 },
      { field: 'sede', caption: 'Sede', width: 120 },
    ];
  }

  /**
   * Avance de gestiones del asesor del DÍA EN CURSO (Call / Realzza). Trae la hoja
   * de gestión general del canal (Call: getSheetData; Realzza: getSheetDataCampo,
   * que es un formulario/conexión distinta) y la hoja KOMMO, y filtra por el NOMBRE
   * del asesor y la fecha de hoy. Muestra gestiones generales + KOMMO + Market Place.
   */
  cargarGestiones(): void {
    // Las gestiones respetan el override híbrido (p.ej. BRENDA: ventas Realzza,
    // gestiones Call con el nombre del sheet Call).
    const canal = this.canalGestion;
    const o = this.overrideGestion[(this.vendedor || '').toUpperCase().trim()];
    this.nombreGestion = o ? o.nombre : this.vendedor;
    this.gestAplica = true;                       // aplica a todo vendedor con nombre
    this.gestSede = (canal !== 'call' && canal !== 'realzza');
    this.gestCargando = true;

    const dia = this.gestFecha || new Date();
    this.gestHoyLabel = `${String(dia.getDate()).padStart(2, '0')}/${String(dia.getMonth() + 1).padStart(2, '0')}/${dia.getFullYear()}`;
    const rango = { desde: dia, hasta: dia };     // solo el día elegido (filtra en el backend)

    // ── Vendedor de SEDE → gestión sedes (llamadas/cartas) + Market Place + Derivaciones ──
    if (this.gestSede) {
      forkJoin({
        sede:  this.sheets.getGestionSedesDB(rango),                 // llamadas / cartas (tabla gestion)
        mp:    this.sheets.getCallSedesDB(rango, this.vendedor),     // market place (gestion_call_sedes)
        deriv: this.sheets.getDerivacionesDB(rango, this.vendedor),  // derivaciones (gestion_sedes_deriv)
      }).subscribe({
        next: ({ sede, mp, deriv }) => {
          this.procesarSede(sede || []);
          this.procesarSedeMp(mp || []);
          this.procesarSedeDeriv(deriv || []);
          this.gestChart = [
            { clave: 'Llamadas', valor: this.sedeLlamadas, color: '#1565C0' },
            { clave: 'Cartas', valor: this.sedeCartas, color: '#6A1B9A' },
            { clave: 'Market Place', valor: this.sedeMpTotal, color: '#E65100' },
            { clave: 'Derivaciones', valor: this.sedeDerivTotal, color: '#2E7D32' },
          ];
          this.gestCargando = false;
        },
        error: () => { this.gestCargando = false; },
      });
      return;
    }

    // Columnas según canal. OJO: la hoja general usa 'ESTADO DE GESTIÓN' para ambos
    // canales; la hoja KOMMO usa 'ESTADO DE GESTIÓN REALZZA' para Realzza (columnas
    // separadas porque combina Call y Realzza). El asesor sí cambia por canal.
    const colAsesor = canal === 'call' ? 'ASESOR CONTACT' : 'ASESOR REALZZA';
    const colEstadoGeneral = 'ESTADO DE GESTIÓN';
    const colEstadoKommo = canal === 'call' ? 'ESTADO DE GESTIÓN' : 'ESTADO DE GESTIÓN REALZZA';
    const colMarket = canal === 'call' ? 'MARKET PLACE L' : 'MARKET PLACE R';

    // Respuestas del SHEET, igual que en los componentes Gestión Call / Realzza /
    // KOMMO. Cada canal es su propia hoja (Realzza = /campo, distinta a Call = /call);
    // en KOMMO se distingue KOMMO vs Market Place por la columna MARKET PLACE L/R.
    const general = canal === 'call'
      ? this.sheets.getSheetDataCallRango(rango)
      : this.sheets.getSheetDataCampoRango(rango);

    forkJoin({ general, kommo: this.sheets.getSheetKOMMORango(rango) }).subscribe({
      next: ({ general, kommo }) => {
        this.procesarGeneral(general || [], colAsesor, colEstadoGeneral, dia);
        this.procesarKommo(kommo || [], colAsesor, colEstadoKommo, colMarket, dia);
        // Derivaciones / agendamientos = de las 3 fuentes, etiquetadas por origen para el
        // desglose y el detalle agrupado. La hoja KOMMO se separa en KOMMO vs Market Place.
        const kommoMios = this.mios(kommo || [], colAsesor, dia);
        const esMp = (r: any) => { const v = (r[colMarket] ?? '').toString().toUpperCase().trim(); return v === 'SI' || v === 'SÍ'; };
        this.calcularDerivAgenda([
          { origen: 'Gestión', rows: this.mios(general || [], colAsesor, dia) },
          { origen: 'KOMMO', rows: kommoMios.filter(r => !esMp(r)) },
          { origen: 'Market Place', rows: kommoMios.filter(r => esMp(r)) },
        ]);
        this.gestCargando = false;
      },
      error: () => { this.gestCargando = false; },
    });
  }

  /** Vuelve al día de hoy y recarga las gestiones. */
  gestVolverHoy(): void { this.gestFecha = new Date(); this.cargarGestiones(); }

  /** Normaliza texto: minúsculas, sin tildes, sin espacios (para comparar). */
  private norm(s: any): string {
    return (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  }
  /** Normaliza un nombre (colapsa espacios a uno). */
  private normNombre(s: any): string {
    return (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }


  /**
   * Gestiones de SEDE del día (hoja gestión sedes): llamadas / cartas por resultado
   * (contacto / no contacto). Igual que Control Gestión Sede: la columna del asesor
   * es por sede (cfg.columnaAsesor, p.ej. 'ASESOR DE VENTA LAMBAYEQUE') y se acota a
   * la sede por 'TIENDA SEDE'. Clasifica por 'TIPO DE GESTION' y 'RESULTADO DE GESTION'.
   */
  private procesarSede(rows: any[]): void {
    const cfg = this.sedeCfg.getConfig(this.sedeKey);
    const colAsesor = cfg?.columnaAsesor || 'ASESOR';
    const valorSede = cfg?.valorSede;
    const objetivo = this.normNombre(this.vendedor);
    const dia = this.gestFecha || new Date();
    const regs = rows.filter(r => {
      const enSede = valorSede ? this.sedeCfg.mismaSede(r['TIENDA SEDE'], valorSede) : true;
      const nombre = this.normNombre(r[colAsesor] ?? r['ASESOR'] ?? '');
      return enSede && nombre === objetivo && this.esFecha(r['Marca temporal'], dia);
    });
    const esLlam = (r: any) => this.norm(r['TIPO DE GESTION']).includes('llamada');
    const esCarta = (r: any) => this.norm(r['TIPO DE GESTION']).includes('carta');
    const esCont = (r: any) => this.norm(r['RESULTADO DE GESTION']) === 'contacto';
    const esNoCont = (r: any) => this.norm(r['RESULTADO DE GESTION']) === 'nocontacto';
    this.sedeLlamContacto = regs.filter(r => esLlam(r) && esCont(r)).length;
    this.sedeLlamNoContacto = regs.filter(r => esLlam(r) && esNoCont(r)).length;
    this.sedeCartaContacto = regs.filter(r => esCarta(r) && esCont(r)).length;
    this.sedeCartaNoContacto = regs.filter(r => esCarta(r) && esNoCont(r)).length;
    this.gestChart = [
      { clave: 'Llamadas', valor: this.sedeLlamadas, color: '#1565C0' },
      { clave: 'Cartas', valor: this.sedeCartas, color: '#6A1B9A' },
    ];
  }

  /** Market Place del día (gestion_call_sedes, ya filtrado por asesor en el backend). */
  private procesarSedeMp(rows: any[]): void {
    const esCont = (r: any) => this.norm(r['ESTADO DE GESTIÓN']) === 'contacto';
    const esNoCont = (r: any) => this.norm(r['ESTADO DE GESTIÓN']) === 'nocontacto';
    const esVnc = (r: any) => this.norm(r['MOTIVO INTERÉS']) === this.norm('VENTA NO CONCRETADA');
    this.sedeMpTotal = rows.length;
    this.sedeMpContacto = rows.filter(esCont).length;
    this.sedeMpNoContacto = rows.filter(esNoCont).length;
    this.sedeMpVnc = rows.filter(esVnc).length;
    this.sedeMpDetalle = rows.map(r => ({
      dni: r['DNI CLIENTE'], celular: r['CELULAR GESTIONADO'], estado: r['ESTADO DE GESTIÓN'],
      resultado: r['RESULTADO DE GESTIÓN'], motivo: r['MOTIVO INTERÉS'], producto: r['PRODUCTO INTERÉS'],
    }));
  }

  /** Derivaciones del día (gestion_sedes_deriv, ya filtrado por asesor en el backend). */
  private procesarSedeDeriv(rows: any[]): void {
    this.sedeDerivTotal = rows.length;
    this.sedeDerivDetalle = rows.map(r => ({
      dni: r.dni_cliente, celular: r.celular_gestionado, fuente: r.tipo_base, tipoCliente: r.tipo_cliente,
      producto: r.producto_interes, fecha: r.fecha_interes_derivacion, hora: r.hora_interes_derivacion,
      comentario: r.comentario_derivacion,
    }));
  }

  /** Abre/cierra el detalle de Market Place o Derivaciones (sede). */
  toggleSedeDetalle(cual: 'mp' | 'deriv'): void { this.popupSede = this.popupSede === cual ? '' : cual; }

  /** ¿La marca temporal cae en la fecha dada? Tolera 'dd/mm/yyyy hh:mm' e ISO 'yyyy-mm-dd'. */
  private esFecha(marca: any, d: Date): boolean {
    const s = (marca ?? '').toString().trim();
    if (!s) return false;
    const fecha = s.split(/[ T]/)[0];
    let dd: number, mm: number, yy: number;
    if (fecha.includes('/')) { const p = fecha.split('/'); dd = +p[0]; mm = +p[1]; yy = +p[2]; }
    else if (fecha.includes('-')) { const p = fecha.split('-'); yy = +p[0]; mm = +p[1]; dd = +p[2]; }
    else return false;
    return dd === d.getDate() && mm === (d.getMonth() + 1) && yy === d.getFullYear();
  }
  private mios(rows: any[], colAsesor: string, d: Date): any[] {
    const nombre = (this.nombreGestion || this.vendedor).toUpperCase().trim();
    return rows.filter(r =>
      (r[colAsesor] ?? '').toString().toUpperCase().trim() === nombre && this.esFecha(r['Marca temporal'], d));
  }
  /** Categoriza una gestión: CONTACTO > CORTA > NOCONTACTO (o null). */
  private categoria(r: any, colEstado: string): 'CONTACTO' | 'CORTA' | 'NOCONTACTO' | null {
    const est = (r[colEstado] ?? '').toString().toUpperCase().trim();
    if (est === 'CONTACTO') return r['MOTIVO NO INTERÉS'] === 'CORTA LLAMADA' ? 'CORTA' : 'CONTACTO';
    if (est === 'NO CONTACTO') return 'NOCONTACTO';
    return null;
  }

  /** Gestiones GENERALES (llamadas) del día: 1 por DNI, con el mejor resultado. */
  private procesarGeneral(rows: any[], colAsesor: string, colEstado: string, d: Date): void {
    const rank = (c: string) => (c === 'CONTACTO' ? 3 : c === 'CORTA' ? 2 : 1);
    const porDni = new Map<string, string>();
    this.mios(rows, colAsesor, d).forEach((r, i) => {
      const cat = this.categoria(r, colEstado);
      if (!cat) return;
      const dni = (r['DNI CLIENTE'] ?? '').toString().replace(/\D/g, '').replace(/^0+/, '');
      const clave = dni ? `dni:${dni}` : `row:${i}`;
      const prev = porDni.get(clave);
      if (!prev || rank(cat) > rank(prev)) porDni.set(clave, cat);
    });
    let contacto = 0, corta = 0, nocont = 0;
    porDni.forEach(c => { if (c === 'CONTACTO') contacto++; else if (c === 'CORTA') corta++; else nocont++; });
    this.gestReales = porDni.size;
    this.gestContacto = contacto;
    this.gestCorta = corta;
    this.gestNoContacto = nocont;
    this.gestPct = this.gestReales ? Math.round((contacto / this.gestReales) * 100) : 0;
    this.gestChart = [
      { clave: 'Contacto', valor: contacto, color: '#2E7D32' },
      { clave: 'Corta llamada', valor: corta, color: '#F9A825' },
      { clave: 'No contacto', valor: nocont, color: '#C62828' },
    ];
  }

  /** Motivos que cuentan como DERIVACIÓN según el canal (Call incluye visita/tienda). */
  private motivosDeriv(): string[] {
    return this.esCall
      ? ['VENTA DERIVADA PARA CIERRE A SEDE', 'VISITARÁ TIENDA', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO']
      : ['VENTA DERIVADA PARA CIERRE A SEDE'];
  }

  /**
   * Cuenta derivaciones y agendamientos del día por FUENTE (Gestión / KOMMO / Market
   * Place) y arma el detalle (con columna Origen para agrupar en el popup).
   */
  private calcularDerivAgenda(grupos: { origen: string; rows: any[] }[]): void {
    const deriv = this.motivosDeriv();
    const motivoDe = (r: any) => (r['MOTIVO INTERÉS'] ?? r['MOTIVO DE INTERÉS'] ?? '').toString().toUpperCase().trim();
    const der: any[] = [], age: any[] = [];
    const derOrg: Record<string, number> = {}, ageOrg: Record<string, number> = {};
    for (const g of grupos) {
      for (const r of g.rows) {
        const m = motivoDe(r);
        if (deriv.includes(m)) { der.push({ ...this.detalleGestion(r, 'deriv'), origen: g.origen }); derOrg[g.origen] = (derOrg[g.origen] || 0) + 1; }
        else if (m === this.MOTIVO_AGENDA) { age.push({ ...this.detalleGestion(r, 'agenda'), origen: g.origen }); ageOrg[g.origen] = (ageOrg[g.origen] || 0) + 1; }
      }
    }
    this.derivacionesDetalle = der;
    this.agendamientosDetalle = age;
    this.gestDerivaciones = der.length;
    this.gestAgendamientos = age.length;
    this.derivPorOrigen = derOrg;
    this.agendaPorOrigen = ageOrg;
  }

  /** Texto corto del desglose por origen para mostrar bajo el total (p.ej. "5 gestión · 3 kommo · 2 MP"). */
  resumenOrigen(m: Record<string, number>): string {
    const parts: string[] = [];
    if (m['Gestión'])      parts.push(`${m['Gestión']} gestión`);
    if (m['KOMMO'])        parts.push(`${m['KOMMO']} kommo`);
    if (m['Market Place']) parts.push(`${m['Market Place']} MP`);
    return parts.join(' · ') || 'sin registros';
  }

  /** Fila de detalle (derivación / agendamiento) para el popup. */
  private detalleGestion(r: any, tipo: 'deriv' | 'agenda'): any {
    const g = (k: string) => (r[k] ?? '').toString().trim();
    const esDeriv = tipo === 'deriv';
    return {
      fecha: g('Marca temporal'),
      // La hoja KOMMO usa 'DNI CLIENTE REALZZA' (Realzza) / 'DNI CLIENTE' (Call/general).
      dni: g('DNI CLIENTE') || g('DNI CLIENTE REALZZA') || g('DNI CLIENTE LEONCITO'),
      producto: g('PRODUCTO INTERÉS') || g('PRODUCTO DE INTERÉS'),
      motivo: g('MOTIVO INTERÉS') || g('MOTIVO DE INTERÉS'),
      fechaInteres: esDeriv ? g('FECHA DE INTERÉS DERIVACIÓN') : g('FECHA DE INTERÉS AGENDAMIENTO'),
      horaInteres: esDeriv ? g('HORA APROXIMADA INTERÉS DERIVACIÓN') : g('HORA APROXIMADA INTERÉS AGENDAMIENTO'),
      comentario: esDeriv ? g('COMENTARIO ADICIONAL DERIVACIÓN') : g('COMENTARIO ADICIONAL AGENDAMIENTO'),
    };
  }

  /** Abre el popup con el detalle de derivaciones o agendamientos. */
  abrirDetalle(tipo: 'deriv' | 'agenda'): void { this.popupDetalle = tipo; }
  get popupDetalleTitulo(): string {
    return this.popupDetalle === 'deriv' ? 'Derivaciones del día' : 'Agendamientos del día';
  }
  get popupDetalleData(): any[] {
    return this.popupDetalle === 'deriv' ? this.derivacionesDetalle : this.agendamientosDetalle;
  }

  /** KOMMO y Market Place del día (hoja KOMMO). SI en la col. Market Place = market. */
  private procesarKommo(rows: any[], colAsesor: string, colEstado: string, colMarket: string, d: Date): void {
    const esMp = (r: any) => {
      const v = (r[colMarket] ?? '').toString().toUpperCase().trim();
      return v === 'SI' || v === 'SÍ';
    };
    const cuenta = (registros: any[]) => {
      let contacto = 0, corta = 0, nocont = 0;
      registros.forEach(r => {
        const cat = this.categoria(r, colEstado);
        if (cat === 'CONTACTO') contacto++; else if (cat === 'CORTA') corta++; else if (cat === 'NOCONTACTO') nocont++;
      });
      return { total: contacto + corta + nocont, contacto, nocont };
    };
    const mios = this.mios(rows, colAsesor, d);
    const k = cuenta(mios.filter(r => !esMp(r)));   // KOMMO = NO market place
    const m = cuenta(mios.filter(r => esMp(r)));    // Market Place = SI
    this.kommoTotal = k.total; this.kommoContacto = k.contacto; this.kommoNoContacto = k.nocont;
    this.mpTotal = m.total; this.mpContacto = m.contacto; this.mpNoContacto = m.nocont;
  }

  cargar(): void {
    this.cargando = true; this.error = '';
    // Fuente según canal:
    //  · Call    → tabla ventas_call    (evolutivo propio: mes actual + meses anteriores).
    //  · Realzza → tabla ventas_realzza (el "vendedor" es la sede; NC/refact por mes de afectación).
    //  · Sedes   → tabla ventas (afectaciones), como hasta ahora.
    const canal = (this.canal || '').toLowerCase();
    // En Ventas Call cada asesor se identifica por su CÓDIGO (CC1, CC5, …); la
    // tabla ventas_call guarda el código en `vendedor`, así que mapeamos el
    // nombre del usuario a su código antes de filtrar.
    const obs = canal === 'call'
      ? this.ventasSvc.obtenerVentasCanal('call', { vendedor: this.codigoCall(this.vendedor) })
      : canal === 'realzza'
        ? this.ventasSvc.obtenerVentasCanal('realzza', { vendedor: this.vendedor })
        : this.ventasSvc.obtenerVentasPorVendedor(this.vendedor);
    obs.subscribe({
      next: (rows) => {
        // Fecha de display construida desde dia/mes/anio (evita el corrimiento de
        // -1 día por zona horaria al parsear la columna DATE `fecha_cv`).
        // Todas las ventas del vendedor (incluidas las asistidas por Call), como el
        // detalle de Ventas Realzza. La fecha de display se arma desde dia/mes/anio.
        // Las ventas SIN derivación (ago-2026+) NO se reflejan en el panel del vendedor:
        // suman al global del canal pero no impactan su monto/tablas/sueldo. Excepciones que
        // SÍ cuentan: las CALL (tipo_base='CALL'), las marcadas "extranjero" (carnet de
        // extranjería) y las de DNI vacío (RUC/empresa) atribuidas a mano — no cruzan por DNI.
        const dniVacio = (r: any) => !((r.doc_identidad ?? '').toString().replace(/\D/g, ''));
        this.todas = (rows || [])
          // Call: las NOTAS DE CRÉDITO NUNCA cuentan (ni suman ni restan). En Realzza sí
          // se conservan porque restan del neto en su mes de afectación.
          .filter(r => !(this.esCall && this.esNotaCred(r)))
          .filter(r => !(r.sin_derivacion && !r.extranjero
              && !(dniVacio(r) && r.asesor_manual)
              && (r.tipo_base || '').toString().trim().toUpperCase() !== 'CALL'))
          .map(r => ({ ...r, fecha_disp: this.fechaLocal(r) }));
        this.aplicar();
        this.construirMesesSueldo();
        this.calcularSueldo();
        this.cargando = false;
      },
      error: () => { this.error = 'No se pudieron cargar tus ventas.'; this.cargando = false; },
    });
  }

  /** Fecha local exacta desde los enteros dia/mes/anio_cv (sin desfase de zona). */
  private fechaLocal(r: any): Date | null {
    const a = +r.anio_cv, m = +r.mes_cv, d = +r.dia_cv;
    return (a && m && d) ? new Date(a, m - 1, d) : null;
  }

  /**
   * Código del asesor Call (CC1, CC5…) a partir del nombre guardado en el usuario.
   * En Ventas Call la identidad es el código, no el nombre. Si el valor ya es un
   * código o no se encuentra, se devuelve tal cual para no romper el filtro.
   */
  private codigoCall(valor: string): string {
    const v = (valor || '').trim().toUpperCase();
    const a = ASESORES_CALL.find(x => x.nombre.toUpperCase() === v || x.value.toUpperCase() === v);
    return a ? a.value : (valor || '').trim();
  }

  /**
   * ¿La fila es una afectación que RESTA del monto real? (nota de crédito,
   * refacturación o incautación). Es la misma venta re-estampada con su fecha de
   * afectación (mes_af/anio_af): suma en su mes de venta y revierte en el de afectación.
   * PRONTO PAGO / CANCELADO / ACTIVO son ventas válidas y NO restan.
   */
  private esReductor(r: any): boolean {
    const e = (r?.estado_venta || '').toString().toUpperCase();
    return e.includes('NOTA DE CR') || e.includes('INCAUTAC') || e.includes('REFACTUR');
  }

  /** ¿Es una NOTA DE CRÉDITO? En Call se descarta del panel (nunca cuenta). */
  private esNotaCred(r: any): boolean {
    return (r?.estado_venta || '').toString().toUpperCase().includes('NOTA DE CR');
  }

  /**
   * Recalcula KPIs, agrupaciones e historial aplicando el rango (si hay). El MONTO
   * REAL del periodo se calcula igual que el mes en curso: cada venta suma en su
   * fecha de VENTA (cv) y cada afectación (NC/refact/incautación) resta en su fecha
   * de AFECTACIÓN (af). Así, para CUALQUIER mes/rango, se descuentan las NC cuya
   * afectación cae en el periodo aunque la venta sea de un mes anterior.
   */
  aplicar(): void {
    const desde = this.form.value.desde ? this.ymd(this.form.value.desde) : null;
    const hasta = this.form.value.hasta ? this.ymd(this.form.value.hasta) : null;
    const hayRango = !!(desde || hasta);
    const dentro = (f: any): boolean => {
      const s = (f || '').toString().slice(0, 10);
      if (!s) return false;
      if (desde && s < desde) return false;
      if (hasta && s > hasta) return false;
      return true;
    };
    // Sin rango = todo entra. Con rango: la venta por su fecha_cv, la afectación por fecha_af.
    const cvIn = (r: any) => !hayRango || dentro(r.fecha_cv);
    const afIn = (r: any) => !hayRango || dentro(r.fecha_af);

    // Detalle: ventas del periodo (por fecha de venta) + afectaciones que caen en él.
    this.ventas = hayRango
      ? this.todas.filter(r => dentro(r.fecha_cv) || (this.esReductor(r) && dentro(r.fecha_af)))
      : this.todas;

    // Monto real del periodo: + venta (cv en periodo), − afectación (af en periodo).
    let monto = 0, ops = 0;
    for (const r of this.todas) {
      const m = Number(r.monto_consolidado || 0);
      if (cvIn(r)) { monto += m; if (!this.esReductor(r)) ops++; }
      if (this.esReductor(r) && afIn(r)) monto -= m;
    }
    this.montoTotal = monto;
    this.numVentas = ops;
    this.ticket = ops ? monto / ops : 0;

    // "Ventas este mes": siempre el mes en curso, independiente del rango elegido.
    const hoy = new Date(), ay = hoy.getFullYear(), am = hoy.getMonth() + 1;
    this.montoMes = this.todas.reduce((s, r) => {
      let v = 0; const m = Number(r.monto_consolidado || 0);
      if (Number(r.anio_cv) === ay && Number(r.mes_cv) === am) v += m;
      if (this.esReductor(r) && Number(r.anio_af) === ay && Number(r.mes_af) === am) v -= m;
      return s + v;
    }, 0);

    this.porEntidad = this.agrupar(cvIn, afIn, 'entidad');

    // Análisis específico por canal (monto real, ops, ticket, % participación).
    if (this.esCall) {
      this.porContacto = this.agruparTabla(cvIn, afIn, 'contacto');
      this.porSedeTab = this.agruparTabla(cvIn, afIn, 'sede');
      this.porTipoCliente = this.agruparTabla(cvIn, afIn, 'tipo_cliente');
    } else if (this.esRealzza) {
      this.porTipoBase = this.agruparTabla(cvIn, afIn, 'tipo_base');
      this.porEntidadTab = this.agruparTabla(cvIn, afIn, 'entidad');
      const esMoto = (r: any) => (r.tipo_producto ?? '').toString().toUpperCase().includes('MOTO');
      this.motosEntidad = this.agruparTabla(cvIn, afIn, 'entidad', esMoto);
      this.motosTipoProd = this.agruparTabla(cvIn, afIn, 'tipo_producto', esMoto);
    }

    // Historial estilo "Evolución de Ventas Mensual": respeta el rango (solo los
    // meses del periodo), con neteo por mes.
    const base = this.porMes(cvIn, afIn);
    const hoyKey = `${ay}-${String(am).padStart(2, '0')}`;
    const diaHoy = hoy.getDate();
    const diasMes = new Date(ay, am, 0).getDate();
    let prev: number | null = null;
    this.historial = base.map(b => {
      let crecimiento = 0;
      if (prev !== null) crecimiento = prev > 0 ? Math.round(((b.monto - prev) / prev) * 100) : 0;
      prev = b.monto;
      let proyeccion: number | null = null;
      if (b.mes === hoyKey && diaHoy > 0 && b.monto > 0) proyeccion = Math.round((b.monto / diaHoy) * diasMes);
      return { mes: b.mes, mesLabel: this.formatMes(b.mes), monto: b.monto, n: b.n, crecimiento, proyeccion };
    });
  }

  /** Meses (YYYY-MM) con ventas/afectaciones del asesor, para el selector del sueldo. */
  private construirMesesSueldo(): void {
    if (!this.aplicaSueldo) return;
    const set = new Set<string>();
    for (const r of this.todas) {
      if (Number(r.anio_cv) && Number(r.mes_cv)) set.add(`${r.anio_cv}-${String(r.mes_cv).padStart(2, '0')}`);
      if (this.esReductor(r) && Number(r.anio_af) && Number(r.mes_af)) set.add(`${r.anio_af}-${String(r.mes_af).padStart(2, '0')}`);
    }
    const hoy = new Date();
    const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    set.add(actual);   // siempre se puede consultar el mes en curso, aunque aún no venda
    this.mesesSueldo = [...set].sort((a, b) => b.localeCompare(a)).map(v => ({ value: v, label: this.formatMes(v) }));
    if (!this.sueldoMesSel || !set.has(this.sueldoMesSel)) {
      this.sueldoMesSel = set.has(actual) ? actual : (this.mesesSueldo[0]?.value || actual);
    }
  }

  /**
   * Sueldo estimado del mes elegido (solo Call / Realzza):
   *  · Sueldo base fijo (1130).
   *  · Comisión = bono según el MONTO REAL VENDIDO del mes (tabla del canal).
   *  · Motos = motos vendidas por GLOBAL GO en el mes × tarifa. Realzza: 125 si son
   *    5 o más, 100 si son menos. Call: siempre 125.
   * El monto real del mes = + venta (mes de CV) − afectación NC/incaut. (mes de AF).
   */
  calcularSueldo(): void {
    if (!this.aplicaSueldo) return;
    const [ay, am] = (this.sueldoMesSel || '').split('-').map(Number);
    if (!ay || !am) { this.montoVendidoMes = this.comisionVentas = this.motosGlobal = this.pagoMotos = 0; this.totalGanar = this.sueldoBase; return; }

    let monto = 0;
    for (const r of this.todas) {
      const m = Number(r.monto_consolidado || 0);
      if (Number(r.anio_cv) === ay && Number(r.mes_cv) === am) monto += m;
      if (this.esReductor(r) && Number(r.anio_af) === ay && Number(r.mes_af) === am) monto -= m;
    }
    this.montoVendidoMes = monto;

    // Comisión por bono según el monto vendido (mismo escalonado que Ventas Call/Realzza).
    this.comisionVentas = this.bonoPorMonto(monto);

    // Motos GLOBAL GO vendidas en el mes (por su fecha de venta, sin NC/incaut.).
    this.motosGlobal = this.todas.filter(r =>
      !this.esReductor(r) &&
      Number(r.anio_cv) === ay && Number(r.mes_cv) === am &&
      (r.tipo_producto ?? '').toString().toUpperCase().includes('MOTO') &&
      (r.entidad ?? '').toString().toUpperCase().includes('GLOBAL GO'),
    ).length;
    this.tarifaMoto = this.tarifaPorMotos(this.motosGlobal);
    this.pagoMotos = this.motosGlobal * this.tarifaMoto;

    this.totalGanar = this.sueldoBase + this.comisionVentas + this.pagoMotos;

    // El simulador parte de los valores reales del mes; el asesor puede editarlos.
    this.simVentas = Math.round(monto);
    this.simMotos = this.motosGlobal;
    this.calcularSimulacion();
  }

  /** Bono (comisión) según el monto vendido, con la tabla del canal del asesor. */
  private bonoPorMonto(monto: number): number {
    const tabla = this.esCall ? this.bonosCall : this.bonosRealzza;
    const min = this.esCall ? 15000 : 10000;
    return monto >= min ? (tabla.find(t => monto >= t.monto)?.bono || 0) : 0;
  }
  /** Tarifa por moto: Call siempre 125; Realzza 125 si son ≥5, si no 100. */
  private tarifaPorMotos(motos: number): number {
    return this.esCall ? 125 : (motos >= 5 ? 125 : 100);
  }

  /** Simulación editable: recalcula comisión + motos + total con los valores que ingresa el asesor. */
  calcularSimulacion(): void {
    const v = Math.max(0, Number(this.simVentas) || 0);
    const n = Math.max(0, Math.floor(Number(this.simMotos) || 0));
    this.simComision = this.bonoPorMonto(v);
    this.simTarifaMoto = this.tarifaPorMotos(n);
    this.simPagoMotos = n * this.simTarifaMoto;
    this.simTotal = this.sueldoBase + this.simComision + this.simPagoMotos;
  }

  /** El asesor cambia el mes del cálculo de sueldo. */
  onSueldoMes(v: string): void { this.sueldoMesSel = v; this.calcularSueldo(); }

  /**
   * Agrupa por un campo con el monto real del periodo: + venta (cv en periodo),
   * − afectación (af en periodo). n cuenta solo ventas reales (no reductoras).
   */
  private agrupar(cvIn: (r: any) => boolean, afIn: (r: any) => boolean, campo: string): Agrupado[] {
    const m = new Map<string, Agrupado>();
    const bump = (r: any, dMonto: number, dN: number) => {
      const k = (r[campo] ?? '').toString().trim() || '—';
      if (!m.has(k)) m.set(k, { clave: k, monto: 0, n: 0 });
      const o = m.get(k)!; o.monto += dMonto; o.n += dN;
    };
    for (const r of this.todas) {
      const mo = Number(r.monto_consolidado || 0);
      const red = this.esReductor(r);
      if (cvIn(r)) bump(r, mo, red ? 0 : 1);      // aporte de la venta
      if (red && afIn(r)) bump(r, -mo, 0);        // resta de la afectación
    }
    return [...m.values()].filter(x => Math.round(x.monto) !== 0 || x.n > 0).sort((a, b) => b.monto - a.monto);
  }

  /**
   * Agrupa por un campo con monto real (neteo por periodo) + N° ops, ticket y
   * % participación. Para las tablas de análisis por canal (tipo base, sede, etc.).
   */
  private agruparTabla(cvIn: (r: any) => boolean, afIn: (r: any) => boolean, campo: string, filtro?: (r: any) => boolean): AgrupadoTabla[] {
    const m = new Map<string, { monto: number; ops: number }>();
    for (const r of this.todas) {
      if (filtro && !filtro(r)) continue;
      const mo = Number(r.monto_consolidado || 0);
      const red = this.esReductor(r);
      const k = (r[campo] ?? '').toString().trim().toUpperCase() || '—';
      if (!m.has(k)) m.set(k, { monto: 0, ops: 0 });
      const o = m.get(k)!;
      if (cvIn(r)) { o.monto += mo; if (!red) o.ops++; }
      if (red && afIn(r)) o.monto -= mo;
    }
    const rows = [...m.entries()].map(([clave, v]) => ({
      clave, monto: v.monto, ops: v.ops, ticket: v.ops ? v.monto / v.ops : 0, part: 0,
    }));
    const total = rows.reduce((s, r) => s + r.monto, 0);
    rows.forEach(r => r.part = total > 0 ? (r.monto / total) * 100 : 0);
    return rows.filter(r => Math.round(r.monto) !== 0 || r.ops > 0).sort((a, b) => b.monto - a.monto);
  }

  /**
   * Historial mensual del monto real: cada venta suma en su mes de VENTA (CV) y
   * las afectaciones restan en su mes de AFECTACIÓN (AF). Respeta el rango: solo
   * se incluyen las ventas/afectaciones cuya fecha cae en el periodo (predicados
   * cvIn/afIn), así la evolución también se filtra por el rango elegido.
   */
  private porMes(cvIn: (r: any) => boolean, afIn: (r: any) => boolean): { mes: string; monto: number; n: number }[] {
    const m = new Map<string, { mes: string; monto: number; n: number }>();
    const add = (a: number, me: number, monto: number, dn: number) => {
      if (!a || !me) return;
      const k = `${a}-${String(me).padStart(2, '0')}`;
      if (!m.has(k)) m.set(k, { mes: k, monto: 0, n: 0 });
      const o = m.get(k)!; o.monto += monto; o.n += dn;
    };
    for (const r of this.todas) {
      const monto = Number(r.monto_consolidado || 0);
      if (cvIn(r)) add(Number(r.anio_cv), Number(r.mes_cv), monto, 1);                 // venta en su mes CV
      if (this.esReductor(r) && afIn(r)) add(Number(r.anio_af), Number(r.mes_af), -monto, -1); // reversa en su mes AF
    }
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  limpiarRango(): void { this.form.patchValue({ desde: null, hasta: null }); this.aplicar(); }

  soles(v: number): string { return 'S/ ' + Math.round(v || 0).toLocaleString('es-PE'); }
  formatoSoles = (arg: any) => this.soles(arg.value);

  // 'YYYY-MM' → 'Jul - 2026'
  private readonly MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  formatMes(ym: string): string {
    const m = (ym || '').toString().match(/^(\d{4})-(\d{2})/);
    return m ? `${this.MESES[+m[2] - 1] || m[2]} - ${m[1]}` : ym;
  }
  mesAxisLabel = (arg: any) => this.formatMes(arg.value);

  /** Colorea cada barra del gráfico de gestiones con su color. */
  gestPoint = (info: any) => ({ color: info.data?.color });

  /** Tooltip S/ para los gráficos de barras (entidad / tipo). */
  tipMonto = (info: any) => ({ text: `${info.argument}: ${this.soles(info.value)}` });

  // Tipo/formato/alineación de columna del detalle según su `type`.
  colDataType = (c: ColDet) => c.type === 'date' ? 'date' : (c.type === 'money' || c.type === 'number') ? 'number' : 'string';
  colFormat = (c: ColDet) => c.type === 'date' ? 'dd/MM/yyyy' : c.type === 'money' ? 'S/ #,##0' : c.type === 'number' ? '#,##0' : '';
  colAlign = (c: ColDet) => (c.type === 'money' || c.type === 'number') ? 'right' : 'left';

  totalTabla = (d: AgrupadoTabla[]) => d.reduce((s, r) => s + r.monto, 0);
  totalOps = (d: AgrupadoTabla[]) => d.reduce((s, r) => s + r.ops, 0);

  /**
   * Exporta el detalle de ventas a Excel. dxo-export solo muestra el botón: la
   * exportación real la hace este handler con exportDataGrid (respeta columnas,
   * formato y filtros visibles del grid) + exceljs.
   */
  onExporting(e: any): void {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Mis ventas');
    exportDataGrid({ component: e.component, worksheet, autoFilterEnabled: true }).then(() => {
      workbook.xlsx.writeBuffer().then((buffer) => {
        const nombre = (this.nombre || this.vendedor || 'detalle').replace(/[^\w]+/g, '-');
        FileSaver.saveAs(
          new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          `Mis-ventas-${nombre}.xlsx`,
        );
      });
    });
    e.cancel = true;
  }

  /** Hace el botón de exportar del grid más llamativo (icono + texto verde). */
  onToolbarPreparing(e: any): void {
    const exp = (e.toolbarOptions?.items || []).find((i: any) => i.name === 'exportButton');
    if (exp) {
      exp.showText = 'always';
      exp.location = 'after';
      exp.options = { ...exp.options, text: 'Exportar a Excel', icon: 'exportxlsx', stylingMode: 'contained', type: 'success' };
    }
  }

  // ── Historial "Evolución de Ventas Mensual" (estilo Comparativo) ──
  /** Colorea los puntos de la línea de crecimiento: verde +, rojo −, gris 0. */
  histPoint = (info: any) => {
    if (info.seriesName === 'Crecimiento (%)') {
      const v = info.data?.crecimiento ?? 0;
      return {
        color: v > 0 ? '#4CAF50' : v < 0 ? '#F44336' : '#9E9E9E',
        hoverStyle: { color: v > 0 ? '#66BB6A' : v < 0 ? '#E57373' : '#BDBDBD' },
      };
    }
    return {};
  };
  histMonto = (info: any): string => {
    const v = Number(info.value);
    return v ? `S/ ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}` : '';
  };
  histCrec = (info: any): string => {
    const v = info.value as number;
    if (v === 0 || v == null) return '0%';
    return `${v > 0 ? '+' : ''}${v}%`;
  };
  histProy = (info: any): string => {
    const v = Number(info.value);
    return v ? `Proy: S/ ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}` : '';
  };
  histTooltip = (p: any) => {
    if (p.seriesName === 'Crecimiento (%)') return { text: `Crecimiento: ${Math.round(p.value)}%` };
    if (p.seriesName === 'Proyección Mes Actual') return { text: `Proyección mes: ${this.soles(p.value)}` };
    return { text: `Monto: ${this.soles(p.value)}` };
  };
}
