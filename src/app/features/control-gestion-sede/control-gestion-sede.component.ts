import { Component, OnInit, OnDestroy } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SheetsService } from '../../services/service-google.service';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';

interface AsesorRow {
  asesor: string;
  supervisor: string;   // supervisor del CAP (para agrupar el detalle por sede)
  llamadas: number;     // total llamadas (contacto + no contacto) — vista simple
  cartas: number;       // total cartas   (contacto + no contacto) — vista simple
  llamadaContacto: number;
  llamadaNoContacto: number;
  cartaContacto: number;
  cartaNoContacto: number;
  totalContacto: number;
  total: number;
  porcentaje: number;
  afiliaciones: number;   // del Excel importado (cruce por nombre)
}

/** Fila del Excel de afiliaciones cuya DIRECCIÓN y/o TELÉFONO no pasó la validación
 *  (ver `validarDireccion`/`validarTelefono`) — se junta con la sede del asesor
 *  (vía el roster del CAP) para poder mostrarla agrupada por sede en el export. */
interface AfiliacionIncorrecta {
  sedeKey: string; sede: string; asesor: string; fecha: string;
  direccion: string; telefono: string; motivos: string[];
}

interface AfiliacionSedeResumen { sedeKey: string; sede: string; total: number; incorrectas: number; pct: number; }
interface AfiliacionesResumenMes {
  totalGeneral: number; incorrectasGeneral: number; pctGeneral: number; porSede: AfiliacionSedeResumen[];
}

interface EvoPunto { fecha: string; llamadas: number; cartas: number; afiliaciones: number; }
interface EvoPivotFila { sedeKey: string; sede: string; valores: number[]; total: number; }
interface EvoPivot { metrica: 'llamadas' | 'cartas' | 'afiliaciones'; label: string; color: string; filas: EvoPivotFila[]; totales: number[]; totalGeneral: number; valoresConDato: number[]; }

interface SedeBloque {
  key: string;
  nombre: string;
  zona: string;
  expandida: boolean;
  filas: AsesorRow[];
  totalLlamadas: number;
  totalCartas: number;
  totalLlamadasContacto: number;
  totalCartasContacto: number;
  totalContactos: number;
  totalGestiones: number;
  totalAfiliaciones: number;
  porcentaje: number;
  metaLlamadasMensual: number;
  metaCartasMensual: number;
  metaDiariaLlamadas: number;
  metaDiariaCartas: number;
  metaDiariaAfiliaciones: number;
  pctLlamadas: number;   // % cumplimiento llamadas vs meta diaria (0-100+)
  pctCartas: number;     // % cumplimiento cartas   vs meta diaria (0-100+)
  pctAfiliaciones: number;  // % cumplimiento afiliaciones vs meta diaria (0-100+)
}

interface ZonaGrupo {
  zona: string;
  sedes: SedeBloque[];
  llamadas: number;
  cartas: number;
  gestiones: number;
  afiliaciones: number;
  metaDiariaLlamadas: number;
  metaDiariaCartas: number;
  metaDiariaAfiliaciones: number;
  pctLlamadas: number;
  pctCartas: number;
  pctAfiliaciones: number;
}

import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-control-gestion-sede',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './control-gestion-sede.component.html',
  styleUrl: './control-gestion-sede.component.css'
})
export class ControlGestionSedeComponent implements OnInit, OnDestroy {

  formCtrl: UntypedFormGroup;
  isLoading = false;
  resumenVisible = true;
  verDetalle = false;   // false = LLAMADAS/CARTAS en total; true = detalle contacto/no contacto

  // ── Evolución por rango (combo barras+líneas: Llamadas / Cartas / Afiliaciones) ──
  evoVisible = false;
  evoLoading = false;
  evoForm!: UntypedFormGroup;
  evoScopeOptions: { value: string; label: string }[] = [];   // Global / Zona / Sede (por perfil)
  readonly evoMetricasOptions = [
    { value: 'llamadas', label: 'Llamadas' },
    { value: 'cartas', label: 'Cartas' },
    { value: 'afiliaciones', label: 'Afiliaciones' },
  ];
  evoMetricas: string[] = ['llamadas', 'cartas', 'afiliaciones'];   // qué series mostrar
  readonly evoAgrupacionOptions = [
    { value: 'dia', label: 'Por día' },
    { value: 'mes', label: 'Por mes' },
  ];
  private readonly MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  onEvoMetricasChanged(e: any): void {
    // No permitir dejarlo vacío (que siempre quede al menos 1 serie visible).
    if (!e.value?.length) { e.component.option('value', this.evoMetricas); return; }
    this.evoMetricas = e.value;
  }
  evoMuestra(m: 'llamadas' | 'cartas' | 'afiliaciones'): boolean { return this.evoMetricas.includes(m); }
  evoMetricasLabel(): string {
    return this.evoMetricasOptions.filter(o => this.evoMetricas.includes(o.value)).map(o => o.label).join(' / ');
  }
  evoDatos: EvoPunto[] = [];
  evoPivots: EvoPivot[] = [];   // detalle por sede (solo con más de 1 sede en el ámbito)
  evoAfiliacionesSinMatch: { nombre: string; cantidad: number }[] = [];
  evoTitulo = '';
  evoError = '';

  sedesBloques: SedeBloque[] = [];

  // ── Resumen agrupado por zona ──
  resumenGrupos: ZonaGrupo[] = [];
  resumenTotalGen = { llamadas: 0, cartas: 0, gestiones: 0, afiliaciones: 0, metaDiariaLlamadas: 0, metaDiariaCartas: 0, metaDiariaAfiliaciones: 0, pctLlamadas: 0, pctCartas: 0, pctAfiliaciones: 0 };

  // ── Afiliaciones (se importan de un Excel y se guardan en el navegador) ──
  // normNombre → { 'YYYY-MM-DD': nº afiliaciones }. Se cuenta por la FECHO REGISTRO
  // del Excel y se muestra según la fecha seleccionada en el componente.
  private afiliacionesData = new Map<string, Record<string, number>>();
  afiliacionesInfo: { archivo: string; fecha: string; total: number; sinFecha: number } | null = null;
  afiliacionesError = '';
  // Afiliaciones del día seleccionado cuyo "ASESOR DE VENTA" (del Excel) no coincide
  // con ningún asesor conocido de ninguna sede (roster CAP + gestión real del día):
  // probable typo/tilde/nombre distinto — se muestran para poder corregirlas a mano.
  afiliacionesSinMatch: { nombre: string; cantidad: number }[] = [];
  private readonly AFI_KEY = 'cgs_afiliaciones_v2';
  // Detalle de filas del Excel importado cuya DIRECCIÓN y/o TELÉFONO quedó mal
  // (vacío, con letras, menos de 9 dígitos, número repetido/falso, etc.) — se
  // guarda junto con el resto del Excel para poder exportarlo agrupado por sede.
  afiliacionesDetalleIncorrectas: AfiliacionIncorrecta[] = [];
  // Subconjunto de `afiliacionesDetalleIncorrectas` del MES del `fechaGestion`
  // elegido (no del día puntual) — se recalcula en `calcular()`. Es lo que se
  // muestra en pantalla y lo que se exporta a Excel.
  afiliacionesDetalleIncorrectasMes: AfiliacionIncorrecta[] = [];
  // KPIs del mes (total, incorrectas, % y desglose por sede) — se recalcula junto
  // con `afiliacionesDetalleIncorrectasMes`, en el mismo lugar.
  afiliacionesResumenMes: AfiliacionesResumenMes = { totalGeneral: 0, incorrectasGeneral: 0, pctGeneral: 0, porSede: [] };
  // Si el Excel importado no tenía columna DIRECCIÓN/TELÉFONO, no se pudo validar.
  afiliacionesSinColumnas: { direccion: boolean; telefono: boolean } = { direccion: true, telefono: true };
  // normNombre → sede, tomado de la columna "SEDE" del propio Excel (si la trae) —
  // más confiable que cruzar por nombre contra el roster del CAP. Se usa tanto para
  // el detalle de incorrectas como para el recuento por sede del export, así ambos
  // quedan consistentes entre sí.
  private afiliacionesSedePorNombre = new Map<string, { key: string; nombre: string }>();
  // Toggle de la grilla de incorrectas en pantalla (no solo en el Excel exportado).
  verIncorrectas = false;
  // Metas diarias POR ASESOR/VENDEDOR (la de la sede = nº asesores AJUSTADO × esto).
  private readonly META_LLAMADAS_ASESOR = 40;
  private readonly META_CARTAS_ASESOR = 5;
  private readonly META_AFI_ASESOR = 2;
  diasDelMes = 30;
  private readonly ordenZonas = ['CENTRO', 'NORTE', 'SUR'];
  // Orden exacto de las sedes dentro de cada zona (como se muestra en el resumen).
  private readonly ordenSedes = [
    'lambayeque', 'ferrenafe',                          // CENTRO
    'morrope', 'mochumi', 'jayanca', 'motupe', 'olmos', // NORTE
    'cayalti', 'oyotun', 'chongoyape',                  // SUR
  ];

  // Valores de % cumplimiento por sede → para la escala de 3 colores (rojo/amarillo/verde)
  private valoresPctLlamadas: number[] = [];
  private valoresPctCartas: number[] = [];

  // Sedes cerradas: dejan de aparecer en este módulo desde su fecha de cierre en
  // adelante, pero SIGUEN saliendo si se elige un día anterior (histórico real de
  // cuando sí operaban) — por eso no se borran de SedeConfigService (ese es
  // compartido por toda la app y rompería el histórico de otros módulos también).
  private readonly SEDES_CERRADAS_DESDE = new Map<string, Date>([
    ['chongoyape', new Date(2026, 10, 1)],
    ['oyotun', new Date(2026, 10, 1)],
    ['cayalti', new Date(2026, 10, 1)],
    ['jayanca', new Date(2026, 10, 1)],
  ]);
  private sedeSigueAbierta(key: string, fecha: Date): boolean {
    const cierre = this.SEDES_CERRADAS_DESDE.get(key);
    return !cierre || fecha < cierre;
  }

  private listData: any[] = [];
  private sedesObjetivo: { key: string; nombre: string }[] = [];
  // Roster de vendedores ACTIVOS por sede, tomado del CAP (nombres correctos).
  private capPorSede = new Map<string, string[]>();
  // Mapa vendedor(UPPER) → supervisor por sede (del CAP), para agrupar el detalle.
  private supPorSede = new Map<string, Map<string, string>>();

  private intervaloCincoMin: any = null;

  sincronizando = false;

  constructor(
    private fb: UntypedFormBuilder,
    private sheetsService: SheetsService,
    private auth: AuthService,
    private sedeConfig: SedeConfigService,
    private cap: CapSedesService,
    private snack: MatSnackBar,
  ) {
    this.formCtrl = this.fb.group({ fechaGestion: [new Date()] });
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.evoForm = this.fb.group({ desde: [inicioMes], hasta: [hoy], scope: ['GLOBAL'], agrupacion: ['dia'] });
  }

  async ngOnInit() {
    this.cargarAfiliacionesLocal();   // afiliaciones guardadas en el navegador (si hay)
    this.recalcularSedesObjetivo();
    this.construirEvoScope();   // opciones de ámbito para la evolución (Global/Zona/Sede)

    // Mostrar headers de inmediato (skeleton) para que no se vea vacío al cargar
    this.inicializarBloquesSkeleton();

    // Carga los datos y renderiza YA (con la lista estática como fallback).
    await this.cargarDatos();
    this.intervaloCincoMin = setInterval(() => this.cargarDatos(), 5 * 60 * 1000);

    // El CAP se carga en segundo plano; al llegar, recalcula con los nombres correctos.
    this.cargarRosterCap();
  }

  /** Arma `sedesObjetivo` según el perfil del usuario, filtrando además las sedes
   *  cerradas que no sigan abiertas para la fecha elegida (sedeSigueAbierta). Se
   *  llama en ngOnInit y de nuevo en cada cargarDatos(), para que cambiar el día a
   *  un mes anterior (cuando una sede sí operaba) la vuelva a mostrar. */
  private recalcularSedesObjetivo(): void {
    const fecha = (this.formCtrl?.value?.fechaGestion as Date) || new Date();
    const u = this.auth.getUsuario();
    const sedesU = this.auth.sedesUsuario();
    const esGlobal = !u || u.rol === 'admin' || this.sedeConfig.incluyeTodas(sedesU);

    if (esGlobal) {
      // Orden por zona (CENTRO → NORTE → SUR) para que las tarjetas de detalle
      // coincidan con el resumen agrupado. Excluye sedes `soloVentas` (de piso, sin
      // gestión de Call Center, ej. Piura/Lima): no tienen llamadas/cartas que mostrar.
      this.sedesObjetivo = this.sedeConfig.getSedesConGestionCall()
        .filter(s => this.sedeSigueAbierta(s.key, fecha))
        .sort((a, b) => this.ordenSedes.indexOf(a.key) - this.ordenSedes.indexOf(b.key));
    } else {
      // Una o varias sedes/zonas asignadas al usuario (las zonas se expanden a sus sedes).
      const sedesFisicas = this.sedeConfig.expandirSedes(sedesU);
      this.sedesObjetivo = this.sedeConfig.getSedesParaCombo()
        .filter(s => sedesFisicas.includes(s.key) && this.sedeSigueAbierta(s.key, fecha))
        .sort((a, b) => this.ordenSedes.indexOf(a.key) - this.ordenSedes.indexOf(b.key));
      if (!this.sedesObjetivo.length) {
        const cfg = this.sedeConfig.getConfig(u!.sede);
        if (cfg && this.sedeSigueAbierta(this.sedeConfig.normalizar(u!.sede), fecha)) {
          this.sedesObjetivo = [{ key: this.sedeConfig.normalizar(u!.sede), nombre: cfg.nombre }];
        }
      }
    }
  }

  // Roster de vendedores ACTIVOS por sede desde el CAP (no bloquea el render).
  private async cargarRosterCap(): Promise<void> {
    await this.cap.cargar();
    for (const s of this.sedesObjetivo) {
      this.capPorSede.set(s.key, await this.cap.vendedoresActivos(s.key));
      const sup = await this.cap.supervisoresPorVendedor(s.key);
      // Quien ya no figura ACTIVO conserva el supervisor de su última fila CAP (no "sin supervisor").
      for (const r of (await this.cap.cargar()).filter(x => x.sedeKey === s.key && x.supervisor)) {
        const n = r.vendedor.toUpperCase();
        if (!sup.has(n)) sup.set(n, r.supervisor.toUpperCase());
      }
      this.supPorSede.set(s.key, sup);
    }
    if (this.listData.length) this.calcular();
  }

  private inicializarBloquesSkeleton() {
    const soloUna = this.sedesObjetivo.length === 1;
    this.sedesBloques = this.sedesObjetivo.map(sede => ({
      key: sede.key,
      nombre: sede.nombre,
      zona: this.sedeConfig.getConfig(sede.key)?.zona ?? 'SUR',
      expandida: soloUna,
      filas: [],
      totalLlamadas: 0,
      totalCartas: 0,
      totalLlamadasContacto: 0,
      totalCartasContacto: 0,
      totalContactos: 0,
      totalGestiones: 0,
      totalAfiliaciones: 0,
      porcentaje: 0,
      metaLlamadasMensual: this.sedeConfig.getConfig(sede.key)?.metaLlamadasMensual ?? 0,
      metaCartasMensual: this.sedeConfig.getConfig(sede.key)?.metaCartasMensual ?? 0,
      metaDiariaLlamadas: 0,
      metaDiariaCartas: 0,
      metaDiariaAfiliaciones: 0,
      pctLlamadas: 0,
      pctCartas: 0,
      pctAfiliaciones: 0,
    }));
  }

  ngOnDestroy() {
    if (this.intervaloCincoMin) clearInterval(this.intervaloCincoMin);
  }

  async cargarDatos() {
    this.isLoading = true;
    try {
      // Recalcula sedesObjetivo primero: si el usuario cambió la fecha a un mes
      // donde una sede hoy cerrada seguía operando, debe reaparecer.
      this.recalcularSedesObjetivo();
      // Solo el día seleccionado (el sheet de sedes es enorme; filtrar en el backend
      // evita descargar todo el histórico y que la app se cuelgue al refrescar).
      const fecha = this.formCtrl.value.fechaGestion as Date;
      // Fuente única = BD (gestion). Incluye lo sincronizado del formulario + lo
      // registrado por plataforma (Ferreñafe). Mapeado a la forma del sheet.
      this.listData = await lastValueFrom(
        this.sheetsService.getGestionSedesDB({ desde: fecha, hasta: fecha })
      );
      this.calcular();
    } catch (e) {
      console.error('Error al cargar datos de sedes:', e);
      this.listData = [];
      this.sedesBloques = [];
    } finally {
      this.isLoading = false;
    }
  }

  async actualizar() {
    await this.cargarDatos();
  }

  /** Trae del formulario (sheet) lo NUEVO a la BD y recarga. Para las sedes que aún
   *  registran por formulario (Ferreñafe ya registra por plataforma → directo a BD). */
  sincronizar(): void {
    if (this.sincronizando) return;
    this.sincronizando = true;
    // SIN rango → el backend trae TODO LO NUEVO del formulario (desde la última fecha ya
    // en BD hasta hoy), no solo el día que se ve. Inserta lo que falte (dedupe por hash).
    this.sheetsService.sincronizarGestionSedes().subscribe({
      next: async r => {
        this.sincronizando = false;
        this.snack.open(`✔ Sincronizado: ${r.insertados} gestiones nuevas del formulario.`, 'OK',
          { duration: 3500, horizontalPosition: 'end', verticalPosition: 'top', panelClass: 'toast-ok' });
        await this.cargarDatos();
      },
      error: () => {
        this.sincronizando = false;
        this.snack.open('❌ No se pudo sincronizar con el formulario.', 'OK',
          { duration: 5000, horizontalPosition: 'end', verticalPosition: 'top', panelClass: 'toast-error' });
      },
    });
  }

  /** Afiliaciones incorrectas del MES completo de la fecha elegida en el formulario
   *  (no solo el día puntual) — es lo que se muestra en pantalla y lo que se exporta
   *  a Excel. Se llama tras cualquier cambio de `afiliacionesDetalleIncorrectas` o
   *  de `fechaGestion`. */
  private recomputarAfiliacionesIncorrectasMes(): void {
    const fecha = (this.formCtrl?.value?.fechaGestion as Date) || new Date();
    const prefijoMes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    this.afiliacionesDetalleIncorrectasMes = this.afiliacionesDetalleIncorrectas.filter(d => d.fecha.startsWith(prefijoMes));

    // Total de afiliaciones del mes por sede (misma fuente de sede que el detalle:
    // columna SEDE del Excel si la trajo, si no el roster del CAP).
    const sedePorAsesor = this.afiliacionesSedePorNombre.size ? this.afiliacionesSedePorNombre : this.construirMapaSedeAsesor();
    const totalPorSede = new Map<string, { nombre: string; total: number }>();
    let totalGeneral = 0;
    for (const [nombre, porDia] of this.afiliacionesData) {
      const total = Object.entries(porDia).filter(([clave]) => clave.startsWith(prefijoMes)).reduce((s, [, n]) => s + n, 0);
      if (!total) continue;
      totalGeneral += total;
      const sede = sedePorAsesor.get(nombre);
      const key = sede?.key ?? 'sin-sede';
      const nombreSede = sede?.nombre ?? 'SIN SEDE (nombre no reconocido)';
      const actual = totalPorSede.get(key) ?? { nombre: nombreSede, total: 0 };
      actual.total += total;
      totalPorSede.set(key, actual);
    }
    const incorrectasPorSede = new Map<string, number>();
    for (const d of this.afiliacionesDetalleIncorrectasMes) {
      incorrectasPorSede.set(d.sedeKey, (incorrectasPorSede.get(d.sedeKey) ?? 0) + 1);
    }
    const porSede: AfiliacionSedeResumen[] = Array.from(totalPorSede.entries())
      .map(([key, info]) => {
        const incorrectas = incorrectasPorSede.get(key) ?? 0;
        return { sedeKey: key, sede: info.nombre, total: info.total, incorrectas, pct: info.total > 0 ? Math.round((incorrectas / info.total) * 100) : 0 };
      })
      .sort((a, b) => b.total - a.total);

    const incorrectasGeneral = this.afiliacionesDetalleIncorrectasMes.length;
    this.afiliacionesResumenMes = {
      totalGeneral, incorrectasGeneral,
      pctGeneral: totalGeneral > 0 ? Math.round((incorrectasGeneral / totalGeneral) * 100) : 0,
      porSede,
    };
  }

  /** Semáforo para un % de afiliaciones INCORRECTAS: a diferencia de `colorPct`
   *  (donde más alto es mejor), aquí más alto es peor. */
  colorPctIncorrectas(pct: number): string {
    return pct === 0 ? '#3D9B2F' : pct <= 5 ? '#F07420' : '#DC2626';
  }

  private calcular() {
    const fecha = this.formCtrl.value.fechaGestion as Date;
    const claveFechaSel = this.claveFecha(fecha);   // afiliaciones del día seleccionado
    const yaExpandida = new Set(this.sedesBloques.filter(b => b.expandida).map(b => b.key));
    const soloUna = this.sedesObjetivo.length === 1;

    // Días del mes seleccionado → meta diaria = meta mensual / días del mes
    this.diasDelMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();

    this.recomputarAfiliacionesIncorrectasMes();

    const cubiertosGlobal = new Set<string>();
    this.sedesBloques = this.sedesObjetivo.map(sede => {
      const cfg = this.sedeConfig.getConfig(sede.key);
      // Roster desde el CAP (solo ACTIVOS de HOY); si no hay CAP, cae al listado estático.
      const asesoresBase = this.capPorSede.get(sede.key)?.length
        ? this.capPorSede.get(sede.key)!
        : (cfg?.asesores ?? []);
      const supMap = this.supPorSede.get(sede.key);
      const valorSede = cfg?.valorSede ?? sede.nombre;

      // Filtrar filas de esta sede + fecha seleccionada
      const filasSede = this.listData.filter(r =>
        this.sedeConfig.mismaSede(r['TIENDA SEDE'], valorSede) &&
        this.esMismaFecha(r['Marca temporal'], fecha)
      );

      // El roster "activo de HOY" no basta para fechas pasadas: si alguien ya no
      // figura ACTIVO en el CAP (renunció, aún no la dieron de alta, etc.) pero SÍ
      // tiene gestión real ese día, se agrega igual — si no, sus llamadas/cartas/
      // afiliaciones desaparecerían del total de la sede sin dejar rastro.
      const cubiertos = new Set(asesoresBase.map(a => this.normNombre(a)));
      const extra: string[] = [];
      for (const r of filasSede) {
        const crudo = (r['ASESOR'] ?? r[cfg!.columnaAsesor] ?? '').toString().trim();
        if (!crudo) continue;
        const n = this.normNombre(crudo);
        if (cubiertos.has(n)) continue;
        cubiertos.add(n);
        extra.push(crudo);
      }
      const asesores = [...asesoresBase, ...extra];
      asesores.forEach(a => cubiertosGlobal.add(this.normNombre(a)));

      const filas: AsesorRow[] = asesores.map(asesorNombre => {
        const objetivo = this.normNombre(asesorNombre);
        const regs = filasSede.filter(r =>
          this.normNombre(r['ASESOR'] ?? r[cfg!.columnaAsesor] ?? '') === objetivo
        );

        const llamadaContacto   = regs.filter(r => this.esLlamada(r) && this.esContacto(r)).length;
        const llamadaNoContacto = regs.filter(r => this.esLlamada(r) && this.esNoContacto(r)).length;
        const cartaContacto     = regs.filter(r => this.esCarta(r)   && this.esContacto(r)).length;
        const cartaNoContacto   = regs.filter(r => this.esCarta(r)   && this.esNoContacto(r)).length;

        const totalContacto = llamadaContacto + cartaContacto;
        const total         = llamadaContacto + llamadaNoContacto + cartaContacto + cartaNoContacto;

        return {
          asesor: asesorNombre,
          supervisor: supMap?.get(asesorNombre) ?? 'NO EN CAP',
          llamadas: llamadaContacto + llamadaNoContacto,
          cartas: cartaContacto + cartaNoContacto,
          llamadaContacto, llamadaNoContacto,
          cartaContacto, cartaNoContacto,
          totalContacto, total,
          porcentaje: total > 0 ? totalContacto / total : 0,
          afiliaciones: this.afiliacionesData.get(objetivo)?.[claveFechaSel] ?? 0,
        };
      })
      // Se muestran los asesores con gestión en el día O con afiliaciones importadas.
      .filter(f => f.total > 0 || f.afiliaciones > 0);

      const totalLlamadas         = filas.reduce((s, f) => s + f.llamadaContacto + f.llamadaNoContacto, 0);
      const totalCartas           = filas.reduce((s, f) => s + f.cartaContacto   + f.cartaNoContacto,   0);
      const totalLlamadasContacto = filas.reduce((s, f) => s + f.llamadaContacto, 0);
      const totalCartasContacto   = filas.reduce((s, f) => s + f.cartaContacto,   0);
      const totalContactos        = filas.reduce((s, f) => s + f.totalContacto, 0);
      const totalGestiones        = filas.reduce((s, f) => s + f.total, 0);
      const totalAfiliaciones     = filas.reduce((s, f) => s + f.afiliaciones, 0);

      // Metas diarias = nº de asesores ACTIVOS ese día × meta por asesor (40 llamadas / 5
      // cartas / 2 afiliaciones). El headcount NO es el roster completo del CAP (incluiría
      // gente de vacaciones/baja que no gestiona ese día): es el nº de asesores que
      // REALMENTE registraron llamadas/cartas ese día en esa sede (filas con total > 0),
      // sin ningún descuento adicional. Reemplaza la meta mensual configurada por sede
      // (Maestro de Sedes), que ya no se usa para el % de cumplimiento.
      const metaLlamadasMensual    = cfg?.metaLlamadasMensual ?? 0;
      const metaCartasMensual      = cfg?.metaCartasMensual ?? 0;
      const nAsesoresMeta          = filas.filter(f => f.total > 0).length;
      const metaDiariaLlamadas     = nAsesoresMeta * this.META_LLAMADAS_ASESOR;
      const metaDiariaCartas       = nAsesoresMeta * this.META_CARTAS_ASESOR;
      const metaDiariaAfiliaciones = nAsesoresMeta * this.META_AFI_ASESOR;

      return {
        key: sede.key,
        nombre: sede.nombre,
        zona: cfg?.zona ?? 'SUR',
        expandida: soloUna ? true : yaExpandida.has(sede.key),
        filas,
        totalLlamadas,
        totalCartas,
        totalLlamadasContacto,
        totalCartasContacto,
        totalContactos,
        totalGestiones,
        totalAfiliaciones,
        porcentaje: totalGestiones > 0 ? Math.round((totalContactos / totalGestiones) * 100) : 0,
        metaLlamadasMensual,
        metaCartasMensual,
        metaDiariaLlamadas,
        metaDiariaCartas,
        metaDiariaAfiliaciones,
        // % cumplimiento = gestiones del día / meta diaria
        pctLlamadas: metaDiariaLlamadas > 0 ? Math.round((totalLlamadas / metaDiariaLlamadas) * 100) : 0,
        pctCartas:   metaDiariaCartas   > 0 ? Math.round((totalCartas   / metaDiariaCartas)   * 100) : 0,
        pctAfiliaciones: metaDiariaAfiliaciones > 0 ? Math.round((totalAfiliaciones / metaDiariaAfiliaciones) * 100) : 0,
      };
    });

    // Afiliaciones del día importadas cuyo nombre no calzó con NINGÚN asesor de
    // NINGUNA sede (ni por CAP ni por gestión real): quedan huérfanas, se listan
    // para poder corregir el nombre en el Excel o en el CAP.
    this.afiliacionesSinMatch = [];
    if (claveFechaSel) {
      for (const [nombre, porDia] of this.afiliacionesData) {
        const n = porDia[claveFechaSel] || 0;
        if (n > 0 && !cubiertosGlobal.has(nombre)) {
          this.afiliacionesSinMatch.push({ nombre, cantidad: n });
        }
      }
      this.afiliacionesSinMatch.sort((a, b) => b.cantidad - a.cantidad);
    }

    this.construirResumen();
  }

  /** Agrupa las sedes por zona (CENTRO/NORTE/SUR) y prepara los valores para la escala de color. */

  private construirResumen() {
    const grupos: ZonaGrupo[] = [];

    for (const zona of this.ordenZonas) {
      const sedes = this.sedesBloques
        .filter(b => b.zona === zona)
        .sort((a, b) => this.ordenSedes.indexOf(a.key) - this.ordenSedes.indexOf(b.key));
      if (!sedes.length) continue;

      const llamadas           = sedes.reduce((s, b) => s + b.totalLlamadas, 0);
      const cartas             = sedes.reduce((s, b) => s + b.totalCartas, 0);
      const metaDiariaLlamadas = sedes.reduce((s, b) => s + b.metaDiariaLlamadas, 0);
      const metaDiariaCartas   = sedes.reduce((s, b) => s + b.metaDiariaCartas, 0);
      const metaDiariaAfiliaciones = sedes.reduce((s, b) => s + b.metaDiariaAfiliaciones, 0);
      const gestiones          = sedes.reduce((s, b) => s + b.totalGestiones, 0);
      const afiliaciones       = sedes.reduce((s, b) => s + b.totalAfiliaciones, 0);

      grupos.push({
        zona, sedes, llamadas, cartas, gestiones, afiliaciones,
        metaDiariaLlamadas, metaDiariaCartas, metaDiariaAfiliaciones,
        pctLlamadas: metaDiariaLlamadas > 0 ? Math.round((llamadas / metaDiariaLlamadas) * 100) : 0,
        pctCartas:   metaDiariaCartas   > 0 ? Math.round((cartas   / metaDiariaCartas)   * 100) : 0,
        pctAfiliaciones: metaDiariaAfiliaciones > 0 ? Math.round((afiliaciones / metaDiariaAfiliaciones) * 100) : 0,
      });
    }
    this.resumenGrupos = grupos;

    // Total general
    const llamadas           = this.sedesBloques.reduce((s, b) => s + b.totalLlamadas, 0);
    const cartas             = this.sedesBloques.reduce((s, b) => s + b.totalCartas, 0);
    const metaDiariaLlamadas = this.sedesBloques.reduce((s, b) => s + b.metaDiariaLlamadas, 0);
    const metaDiariaCartas   = this.sedesBloques.reduce((s, b) => s + b.metaDiariaCartas, 0);
    const metaDiariaAfiliaciones = this.sedesBloques.reduce((s, b) => s + b.metaDiariaAfiliaciones, 0);
    const gestiones          = this.sedesBloques.reduce((s, b) => s + b.totalGestiones, 0);
    const afiliaciones       = this.sedesBloques.reduce((s, b) => s + b.totalAfiliaciones, 0);
    this.resumenTotalGen = {
      llamadas, cartas, gestiones, afiliaciones, metaDiariaLlamadas, metaDiariaCartas, metaDiariaAfiliaciones,
      pctLlamadas: metaDiariaLlamadas > 0 ? Math.round((llamadas / metaDiariaLlamadas) * 100) : 0,
      pctCartas:   metaDiariaCartas   > 0 ? Math.round((cartas   / metaDiariaCartas)   * 100) : 0,
      pctAfiliaciones: metaDiariaAfiliaciones > 0 ? Math.round((afiliaciones / metaDiariaAfiliaciones) * 100) : 0,
    };

    // Rangos para la escala de 3 colores (solo sobre las filas de sede)
    this.valoresPctLlamadas = this.sedesBloques.map(b => b.pctLlamadas);
    this.valoresPctCartas   = this.sedesBloques.map(b => b.pctCartas);
  }

  toggleResumen() {
    this.resumenVisible = !this.resumenVisible;
  }

  // ── Escala de 3 colores (Excel): rojo (mín) → amarillo (percentil 50) → verde (máx) ──
  // A partir del 100% de cumplimiento, siempre verde (meta lograda), sin importar la
  // posición relativa dentro del rango de esa fecha.
  private readonly VERDE_META = [61, 155, 65];
  colorLlamadas(valor: number): string { return valor >= 100 ? this.rgbStr(this.VERDE_META) : this.rgbStr(this.escalaRGB(valor, this.valoresPctLlamadas)); }
  colorCartas(valor: number): string   { return valor >= 100 ? this.rgbStr(this.VERDE_META) : this.rgbStr(this.escalaRGB(valor, this.valoresPctCartas)); }
  textoLlamadas(valor: number): string { return valor >= 100 ? this.textoSobre(this.VERDE_META) : this.textoSobre(this.escalaRGB(valor, this.valoresPctLlamadas)); }
  textoCartas(valor: number): string   { return valor >= 100 ? this.textoSobre(this.VERDE_META) : this.textoSobre(this.escalaRGB(valor, this.valoresPctCartas)); }

  // Heatmap del "Detalle por sede" de Evolución (Rango): mismo criterio de 3 colores,
  // pero sobre los valores de esa métrica (no un %). Las celdas en 0 quedan sin color.
  colorHeat(valor: number, piv: EvoPivot): string {
    return valor > 0 ? this.rgbStr(this.escalaRGB(valor, piv.valoresConDato)) : '';
  }
  textoHeat(valor: number, piv: EvoPivot): string {
    return valor > 0 ? this.textoSobre(this.escalaRGB(valor, piv.valoresConDato)) : '';
  }

  private escalaRGB(valor: number, valores: number[]): number[] {
    const ROJO     = [248, 105, 107];
    const AMARILLO = [255, 235, 132];
    const VERDE    = [99, 190, 123];
    if (!valores.length) return AMARILLO;

    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const mid = this.mediana(valores);
    if (max === min) return AMARILLO;

    if (valor <= mid) {
      const t = mid > min ? (valor - min) / (mid - min) : 1;
      return this.lerp(ROJO, AMARILLO, t);
    }
    const t = max > mid ? (valor - mid) / (max - mid) : 0;
    return this.lerp(AMARILLO, VERDE, t);
  }

  private mediana(valores: number[]): number {
    const orden = [...valores].sort((a, b) => a - b);
    const n = orden.length;
    const m = Math.floor(n / 2);
    return n % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2;
  }

  private lerp(a: number[], b: number[], t: number): number[] {
    const c = Math.max(0, Math.min(1, t));
    return [
      Math.round(a[0] + (b[0] - a[0]) * c),
      Math.round(a[1] + (b[1] - a[1]) * c),
      Math.round(a[2] + (b[2] - a[2]) * c),
    ];
  }

  private rgbStr(c: number[]): string { return `rgb(${c[0]}, ${c[1]}, ${c[2]})`; }

  /** Texto oscuro/claro según luminancia del fondo, para que siempre se lea. */
  private textoSobre(c: number[]): string {
    const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return lum > 150 ? '#1F2A1A' : '#FFFFFF';
  }

  toggleSede(bloque: SedeBloque) {
    bloque.expandida = !bloque.expandida;
  }

  colorPct(pct: number): string {
    return pct >= 85 ? '#3D9B2F' : pct >= 50 ? '#F07420' : '#DC2626';
  }

  getNombreCorto(nombreCompleto: string): string {
    const partes = (nombreCompleto || '').trim().split(' ');
    return partes[0] ? partes[0].charAt(0) + partes[0].slice(1).toLowerCase() : nombreCompleto;
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color           = '#FFFFFF';
      e.cellElement.style.fontWeight      = '700';
      e.cellElement.style.fontSize        = '11px';
      e.cellElement.style.textAlign       = 'center';
    }
    if (e.rowType === 'data') {
      if (e.column.dataField === 'porcentaje') {
        const v = e.value || 0;
        e.cellElement.style.fontWeight = '700';
        e.cellElement.style.color = v >= 0.85 ? '#3D9B2F' : v >= 0.5 ? '#F07420' : '#DC2626';
      }
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.fontWeight = '700';
      e.cellElement.style.backgroundColor = '#F0F6FF';
    }
  }

  // ── Helpers de clasificación ──
  private esLlamada(r: any): boolean {
    return this.sedeConfig.normalizar(r['TIPO DE GESTION']).includes('llamada');
  }
  private esCarta(r: any): boolean {
    return this.sedeConfig.normalizar(r['TIPO DE GESTION']).includes('carta');
  }
  private esContacto(r: any): boolean {
    return this.sedeConfig.normalizar(r['RESULTADO DE GESTION']) === 'contacto';
  }
  private esNoContacto(r: any): boolean {
    return this.sedeConfig.normalizar(r['RESULTADO DE GESTION']) === 'nocontacto';
  }

  private esMismaFecha(marca: string, fecha: Date): boolean {
    if (!marca || !marca.includes('/')) return false;
    const [d, m, a] = marca.split(' ')[0].split('/');
    return +d === fecha.getDate() && +m === (fecha.getMonth() + 1) && +a === fecha.getFullYear();
  }

  /** Normaliza un nombre para comparar (minúsculas, sin tildes, espacios colapsados). */
  private normNombre(s: any): string {
    return (s ?? '').toString().toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AFILIACIONES — se importan de un Excel y se guardan en el navegador (localStorage).
  // Cruce por nombre del vendedor ("ASESOR DE VENTA") y conteo por día ("FECHO
  // REGISTRO"): cada fila = 1 afiliación; se muestran según la fecha seleccionada.
  // ──────────────────────────────────────────────────────────────────────────
  private cargarAfiliacionesLocal(): void {
    try {
      const raw = localStorage.getItem(this.AFI_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.afiliacionesData = new Map(Object.entries(data.porNombre || {}).map(([k, v]) => [k, v as Record<string, number>]));
      this.afiliacionesInfo = { archivo: data.archivo || '', fecha: data.fecha || '', total: data.total || 0, sinFecha: data.sinFecha || 0 };
      this.afiliacionesDetalleIncorrectas = data.detalleIncorrectas || [];
      this.afiliacionesSinColumnas = data.sinColumnas || { direccion: true, telefono: true };
      this.afiliacionesSedePorNombre = new Map(Object.entries(data.sedePorNombre || {}));
      this.recomputarAfiliacionesIncorrectasMes();
    } catch { /* localStorage corrupto: se ignora */ }
  }

  /** Importa el Excel de afiliaciones (cuenta por "ASESOR DE VENTA" y "FECHO REGISTRO"). */
  onImportarAfiliaciones(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.afiliacionesError = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        if (!filas.length) throw new Error('El archivo no tiene filas.');

        const headers = Object.keys(filas[0]);
        // Columna del asesor: "ASESOR DE VENTA".
        const colAsesor = headers.find(h => this.normNombre(h) === this.normNombre('ASESOR DE VENTA'))
          ?? headers.find(h => this.normNombre(h).includes('asesor'));
        if (!colAsesor) throw new Error('No se encontró la columna "ASESOR DE VENTA" en el Excel.');
        // Columna de fecha: "FECHO REGISTRO".
        const colFecha = headers.find(h => this.normNombre(h) === this.normNombre('FECHO REGISTRO'))
          ?? headers.find(h => this.normNombre(h).includes('fecho') || this.normNombre(h).includes('fecha'));
        if (!colFecha) throw new Error('No se encontró la columna de fecha ("FECHO REGISTRO") para contar por día.');
        // Columnas de DIRECCIÓN y TELÉFONO: opcionales — si no están, simplemente no se
        // puede validar la calidad de la afiliación (el conteo por sede/día sigue igual).
        const colDireccion = headers.find(h => this.normNombre(h) === this.normNombre('DIRECCIÓN'))
          ?? headers.find(h => this.normNombre(h).includes('direccion'));
        const colTelefono = headers.find(h => this.normNombre(h) === this.normNombre('TELEFONO'))
          ?? headers.find(h => this.normNombre(h).includes('telefono') || this.normNombre(h).includes('celular'));
        this.afiliacionesSinColumnas = { direccion: !colDireccion, telefono: !colTelefono };
        // Columna "SEDE": si el propio Excel la trae (como en este caso), es más
        // confiable que cruzar el nombre del asesor contra el roster del CAP.
        const colSede = headers.find(h => this.normNombre(h) === this.normNombre('SEDE'));

        // Roster CAP (vendedor normalizado → sede), de respaldo solo si el Excel NO
        // trae su propia columna SEDE, para agrupar el detalle de incorrectas.
        const sedePorAsesor = colSede ? null : this.construirMapaSedeAsesor();

        const porNombre: Record<string, Record<string, number>> = {};
        const detalleIncorrectas: AfiliacionIncorrecta[] = [];
        // Sede de cada asesor según el propio Excel (columna SEDE) — se guarda para
        // que el recuento del export use la MISMA fuente que el detalle de incorrectas.
        const sedePorNombreArchivo = new Map<string, { key: string; nombre: string }>();
        let total = 0, sinFecha = 0;
        for (const r of filas) {
          const nombreCrudo = (r[colAsesor] ?? '').toString().trim();
          const nombre = this.normNombre(nombreCrudo);
          if (!nombre) continue;
          const clave = this.claveFecha(r[colFecha]);
          if (!clave) { sinFecha++; continue; }   // sin fecha válida → no se puede atribuir a un día
          total++;
          (porNombre[nombre] ??= {});
          porNombre[nombre][clave] = (porNombre[nombre][clave] || 0) + 1;

          let sedeKey = 'sin-sede', sedeNombre = 'SIN SEDE (nombre no reconocido)';
          if (colSede) {
            const crudo = (r[colSede] ?? '').toString().trim();
            if (crudo) {
              sedeKey = this.sedeConfig.normalizar(crudo);
              sedeNombre = this.sedeConfig.getConfig(sedeKey)?.nombre ?? crudo.toUpperCase();
            }
          } else {
            const sede = sedePorAsesor!.get(nombre);
            if (sede) { sedeKey = sede.key; sedeNombre = sede.nombre; }
          }
          if (sedeKey !== 'sin-sede') sedePorNombreArchivo.set(nombre, { key: sedeKey, nombre: sedeNombre });

          if (colDireccion || colTelefono) {
            const direccion = (r[colDireccion ?? ''] ?? '').toString().trim();
            const telefono = (r[colTelefono ?? ''] ?? '').toString().trim();
            const motivos = [
              ...(colDireccion ? this.validarDireccion(direccion) : []),
              ...(colTelefono ? this.validarTelefono(telefono) : []),
            ];
            if (motivos.length) {
              detalleIncorrectas.push({
                sedeKey, sede: sedeNombre,
                asesor: nombreCrudo, fecha: clave, direccion, telefono, motivos,
              });
            }
          }
        }

        this.afiliacionesData = new Map(Object.entries(porNombre));
        this.afiliacionesInfo = { archivo: file.name, fecha: new Date().toLocaleString('es-PE'), total, sinFecha };
        this.afiliacionesDetalleIncorrectas = detalleIncorrectas;
        this.afiliacionesSedePorNombre = sedePorNombreArchivo;
        this.recomputarAfiliacionesIncorrectasMes();
        localStorage.setItem(this.AFI_KEY, JSON.stringify({
          ...this.afiliacionesInfo, porNombre, detalleIncorrectas, sinColumnas: this.afiliacionesSinColumnas,
          sedePorNombre: Object.fromEntries(sedePorNombreArchivo),
        }));

        if (this.listData.length) this.calcular();   // refresca las tablas con las afiliaciones
      } catch (err: any) {
        this.afiliacionesError = err?.message ?? 'No se pudo leer el Excel.';
      }
      input.value = '';
    };
    reader.onerror = () => { this.afiliacionesError = 'Error al leer el archivo.'; input.value = ''; };
    reader.readAsArrayBuffer(file);
  }

  /** Convierte un valor de fecha (Date, serial Excel, dd/mm/yyyy o ISO) a 'YYYY-MM-DD'. */
  private claveFecha(v: any): string {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) return this.ymd(v);
    if (typeof v === 'number') {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000)); // serial Excel → UTC
      if (isNaN(d.getTime())) return '';
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);   // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                  // yyyy-mm-dd
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : this.ymd(d);
  }
  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Borra las afiliaciones guardadas en el navegador. */
  limpiarAfiliaciones(): void {
    this.afiliacionesData.clear();
    this.afiliacionesInfo = null;
    this.afiliacionesError = '';
    this.afiliacionesDetalleIncorrectas = [];
    this.afiliacionesDetalleIncorrectasMes = [];
    this.afiliacionesSinColumnas = { direccion: true, telefono: true };
    this.afiliacionesSedePorNombre.clear();
    localStorage.removeItem(this.AFI_KEY);
    if (this.listData.length) this.calcular();
  }

  /** Vendedor normalizado → sede, a partir del roster ACTIVO del CAP (todas las
   *  sedes del ámbito). Usado para agrupar por sede el detalle de afiliaciones
   *  incorrectas del Excel importado. */
  private construirMapaSedeAsesor(): Map<string, { key: string; nombre: string }> {
    const mapa = new Map<string, { key: string; nombre: string }>();
    for (const [key, lista] of this.capPorSede) {
      const sede = this.sedesObjetivo.find(s => s.key === key);
      for (const v of lista) mapa.set(this.normNombre(v), { key, nombre: sede?.nombre ?? key });
    }
    return mapa;
  }

  /** Valida la DIRECCIÓN de una afiliación: vacía, o sin ninguna letra (indicio de
   *  que en realidad se puso un número de teléfono en ese campo). */
  private validarDireccion(direccion: string): string[] {
    const s = (direccion ?? '').toString().trim();
    if (!s) return ['Dirección vacía'];
    const motivos: string[] = [];
    if (!/[a-zA-Z]/.test(s)) motivos.push('Dirección sin texto (parece un número de teléfono)');
    else if (s.length < 5) motivos.push('Dirección muy corta/sospechosa');
    return motivos;
  }

  /** Valida el TELÉFONO de una afiliación: vacío, con letras, sin 9 dígitos, o un
   *  número evidentemente falso (todo el mismo dígito, o secuencial). */
  private validarTelefono(telefono: string): string[] {
    const s = (telefono ?? '').toString().trim();
    if (!s) return ['Teléfono vacío'];
    const limpio = s.replace(/[\s\-().]/g, '').replace(/^\+?51/, '');
    if (/[^0-9]/.test(limpio)) return ['Teléfono con letras u otros caracteres'];
    if (limpio.length !== 9) return [`Teléfono no tiene 9 dígitos (tiene ${limpio.length})`];
    if (/^(\d)\1{8}$/.test(limpio)) return ['Teléfono inválido (dígito repetido, ej. 999999999)'];
    if (limpio === '123456789' || limpio === '987654321') return ['Teléfono inválido (número secuencial)'];
    return [];
  }

  /** Export a Excel: recuento de afiliaciones por sede + detalle de las que tienen
   *  DIRECCIÓN/TELÉFONO inválido, agrupadas por sede — ambas hojas, del MES
   *  completo de la fecha elegida en el formulario (igual que lo que se ve en
   *  pantalla, no solo el día puntual). */
  async exportarAfiliacionesExcel(): Promise<void> {
    const fecha = (this.formCtrl?.value?.fechaGestion as Date) || new Date();
    const mesLabel = fecha.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    const prefijoMes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const resumen = this.afiliacionesResumenMes;
    const incorrectasMes = this.afiliacionesDetalleIncorrectasMes;

    const wb = new Workbook();

    const wsResumen = wb.addWorksheet('Recuento por Sede');
    wsResumen.addRow([`AFILIACIONES — ${mesLabel.toUpperCase()}  |  ${this.afiliacionesInfo?.archivo ?? ''}`]);
    wsResumen.addRow([]);
    wsResumen.addRow(['SEDE', 'TOTAL AFILIACIONES', 'INCORRECTAS (DIRECCIÓN/TELÉFONO)', '% INCORRECTAS']);
    for (const s of resumen.porSede) {
      wsResumen.addRow([s.sede, s.total, s.incorrectas, s.pct + '%']);
    }
    wsResumen.addRow([]);
    wsResumen.addRow(['TOTAL', resumen.totalGeneral, resumen.incorrectasGeneral, resumen.pctGeneral + '%']);
    const headerResumen = wsResumen.getRow(3);
    headerResumen.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } };
    });
    wsResumen.columns.forEach(col => { col.width = 30; });

    const wsDetalle = wb.addWorksheet('Detalle Incorrectas');
    if (this.afiliacionesSinColumnas.direccion && this.afiliacionesSinColumnas.telefono) {
      wsDetalle.addRow(['El Excel importado no tenía columnas de DIRECCIÓN ni TELÉFONO — no se pudo validar.']);
    } else {
      wsDetalle.addRow(['SEDE', 'ASESOR', 'FECHA', 'DIRECCIÓN', 'TELÉFONO', 'MOTIVO']);
      const detalleOrdenado = [...incorrectasMes].sort((a, b) => a.sede.localeCompare(b.sede));
      for (const d of detalleOrdenado) {
        wsDetalle.addRow([d.sede, d.asesor, d.fecha, d.direccion, d.telefono, d.motivos.join(' · ')]);
      }
      const headerDetalle = wsDetalle.getRow(1);
      headerDetalle.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } };
      });
      wsDetalle.views = [{ state: 'frozen', ySplit: 1 }];
      wsDetalle.columns.forEach((col, i) => { col.width = i === 0 || i === 1 ? 28 : i === 5 ? 45 : 18; });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    FileSaver.saveAs(blob, `Afiliaciones_${prefijoMes}.xlsx`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EVOLUCIÓN POR RANGO — combo (Llamadas barras + Cartas/Afiliaciones líneas).
  // Ámbito según el perfil del usuario: Global, por zona o por sede.
  // ──────────────────────────────────────────────────────────────────────────
  private capitalizar(z: string): string { return z.charAt(0) + z.slice(1).toLowerCase(); }

  private construirEvoScope(): void {
    const opts: { value: string; label: string }[] = [];
    const sedes = this.sedesObjetivo;
    const zonas = Array.from(new Set(sedes.map(s => this.sedeConfig.getConfig(s.key)?.zona ?? '')))
      .filter(z => z)
      .sort((a, b) => this.ordenZonas.indexOf(a) - this.ordenZonas.indexOf(b));

    if (sedes.length > 1) opts.push({ value: 'GLOBAL', label: 'Global (todas)' });
    if (zonas.length > 1) for (const z of zonas) opts.push({ value: 'ZONA:' + z, label: 'Zona ' + this.capitalizar(z) });
    for (const s of sedes) opts.push({ value: 'SEDE:' + s.key, label: s.nombre });

    this.evoScopeOptions = opts;
    this.evoForm.patchValue({ scope: opts[0]?.value ?? '' }, { emitEvent: false });
  }

  toggleEvo(): void {
    this.evoVisible = !this.evoVisible;
    if (this.evoVisible && !this.evoDatos.length) this.cargarEvolucion();
  }

  async cargarEvolucion(): Promise<void> {
    const desde = this.evoForm.value.desde as Date;
    const hasta = this.evoForm.value.hasta as Date;
    const scope = (this.evoForm.value.scope as string) || 'GLOBAL';
    if (!desde || !hasta) return;
    this.evoLoading = true;
    this.evoError = '';
    try {
      // Sedes del ámbito elegido + título.
      let sedesScope = this.sedesObjetivo;
      if (scope.startsWith('ZONA:')) {
        const z = scope.slice(5);
        sedesScope = this.sedesObjetivo.filter(s => (this.sedeConfig.getConfig(s.key)?.zona ?? '') === z);
        this.evoTitulo = 'Zona ' + this.capitalizar(z);
      } else if (scope.startsWith('SEDE:')) {
        const k = scope.slice(5);
        sedesScope = this.sedesObjetivo.filter(s => s.key === k);
        this.evoTitulo = sedesScope[0]?.nombre ?? 'Sede';
      } else {
        this.evoTitulo = 'Global';
      }

      // Set de sedes del ámbito (normalizadas) para clasificar cada fila del sheet.
      const valorSet = new Set(sedesScope.map(s =>
        this.sedeConfig.normalizar(this.sedeConfig.getConfig(s.key)?.valorSede ?? s.nombre)));

      const desdeK = this.ymd(desde), hastaK = this.ymd(hasta);
      // La evolución se calcula en SQL (agregado por día+sede) en vez de traer una fila
      // por gestión: con "todo el año" son cientos de miles de filas, y traerlas crudas al
      // navegador para contarlas ahí ya tumbó el backend por heap OOM. El endpoint
      // /gestion/evolucion hace el conteo en la BD y manda un puñado de filas.
      const { porDia: porDiaSede, asesores } = await lastValueFrom(
        this.sheetsService.getGestionSedesEvolucion({ desde, hasta }));

      // Llamadas / cartas por día (agregado ya viene por día+sede; se suma lo que cae en el ámbito).
      // También se guarda por sede (porDiaPorSede) para la tabla de detalle por sede.
      const porDia = new Map<string, { ll: number; ca: number }>();
      const porDiaPorSede = new Map<string, Map<string, { ll: number; ca: number }>>();
      for (const r of (porDiaSede ?? [])) {
        if (!valorSet.has(this.sedeConfig.normalizar(r.sede))) continue;
        if (r.dia < desdeK || r.dia > hastaK) continue;
        if (!porDia.has(r.dia)) porDia.set(r.dia, { ll: 0, ca: 0 });
        const acc = porDia.get(r.dia)!;
        acc.ll += r.llamadas || 0;
        acc.ca += r.cartas || 0;

        const sedeMatch = sedesScope.find(s => this.sedeConfig.mismaSede(r.sede, this.sedeConfig.getConfig(s.key)?.valorSede ?? s.nombre));
        if (sedeMatch) {
          let m = porDiaPorSede.get(sedeMatch.key); if (!m) { m = new Map(); porDiaPorSede.set(sedeMatch.key, m); }
          const accS = m.get(r.dia) ?? { ll: 0, ca: 0 };
          accS.ll += r.llamadas || 0; accS.ca += r.cartas || 0;
          m.set(r.dia, accS);
        }
      }

      // Afiliaciones por día del ámbito (roster del CAP × afiliaciones importadas).
      // Igual que en la vista diaria: se agregan también las asesoras con gestión
      // real en el rango que ya no figuran ACTIVAS en el CAP de hoy, para no perder
      // sus afiliaciones del histórico. `asesores` ya viene como (sede, asesor) distintos
      // del rango, no una fila por gestión.
      const afilDia = new Map<string, number>();
      const afilPorSede = new Map<string, Map<string, number>>();
      const cubiertosEvo = new Set<string>();   // para detectar afiliaciones huérfanas del rango
      for (const s of sedesScope) {
        const cfg = this.sedeConfig.getConfig(s.key);
        const valorSedeS = cfg?.valorSede ?? s.nombre;
        const rosterBase = this.capPorSede.get(s.key)?.length ? this.capPorSede.get(s.key)! : (cfg?.asesores ?? []);
        const cubiertosS = new Set(rosterBase.map(a => this.normNombre(a)));
        const extraS: string[] = [];
        for (const a of (asesores ?? [])) {
          if (!this.sedeConfig.mismaSede(a.sede, valorSedeS)) continue;
          const crudo = (a.asesor ?? '').toString().trim();
          if (!crudo) continue;
          const n = this.normNombre(crudo);
          if (cubiertosS.has(n)) continue;
          cubiertosS.add(n);
          extraS.push(crudo);
        }
        const roster = [...rosterBase, ...extraS];
        roster.forEach(a => cubiertosEvo.add(this.normNombre(a)));
        const afilS = new Map<string, number>();
        for (const asesor of roster) {
          const m = this.afiliacionesData.get(this.normNombre(asesor));
          if (!m) continue;
          for (const [dia, n] of Object.entries(m)) {
            if (dia < desdeK || dia > hastaK) continue;
            afilDia.set(dia, (afilDia.get(dia) ?? 0) + (n as number));
            afilS.set(dia, (afilS.get(dia) ?? 0) + (n as number));
          }
        }
        afilPorSede.set(s.key, afilS);
      }

      // Afiliaciones importadas del rango cuyo nombre no calzó con NINGÚN asesor de
      // NINGUNA sede del ámbito (ni CAP ni gestión real en el rango): quedan fuera del
      // gráfico/tabla sin que se note — se listan para poder corregir el nombre.
      this.evoAfiliacionesSinMatch = [];
      for (const [nombre, porDia] of this.afiliacionesData) {
        let total = 0;
        for (const [dia, n] of Object.entries(porDia)) {
          if (dia < desdeK || dia > hastaK) continue;
          total += (n as number);
        }
        if (total > 0 && !cubiertosEvo.has(nombre)) this.evoAfiliacionesSinMatch.push({ nombre, cantidad: total });
      }
      this.evoAfiliacionesSinMatch.sort((a, b) => b.cantidad - a.cantidad);

      const agrupacion = (this.evoForm.value.agrupacion as string) || 'dia';
      this.evoDatos = this.construirPuntosEvo(porDia, afilDia, desde, hasta, agrupacion);

      // Detalle por sede (tabla pivote): solo tiene sentido con más de 1 sede en el ámbito.
      if (sedesScope.length > 1) {
        const porSede = sedesScope.map(s => ({
          sedeKey: s.key, sede: s.nombre,
          puntos: this.construirPuntosEvo(porDiaPorSede.get(s.key) ?? new Map(), afilPorSede.get(s.key) ?? new Map(), desde, hasta, agrupacion),
        })).filter(f => f.puntos.some(p => p.llamadas > 0 || p.cartas > 0 || p.afiliaciones > 0));

        const metricas: { key: 'llamadas' | 'cartas' | 'afiliaciones'; label: string; color: string }[] = [
          { key: 'llamadas', label: 'Llamadas', color: '#C0632A' },
          { key: 'cartas', label: 'Cartas', color: '#4E8A83' },
          { key: 'afiliaciones', label: 'Afiliaciones', color: '#1F3B6E' },
        ];
        this.evoPivots = metricas.map(met => {
          const filas: EvoPivotFila[] = porSede.map(f => {
            const valores = f.puntos.map(p => p[met.key]);
            return { sedeKey: f.sedeKey, sede: f.sede, valores, total: valores.reduce((a, b) => a + b, 0) };
          }).sort((a, b) => b.total - a.total);
          const nCols = this.evoDatos.length;
          const totales = Array.from({ length: nCols }, (_, i) => filas.reduce((s, f) => s + (f.valores[i] || 0), 0));
          // Valores CON dato (>0) para la escala de color (heatmap rojo→amarillo→verde).
          const valoresConDato = filas.flatMap(f => f.valores).filter(v => v > 0);
          return { metrica: met.key, label: met.label, color: met.color, filas, totales, totalGeneral: totales.reduce((a, b) => a + b, 0), valoresConDato };
        });
      } else {
        this.evoPivots = [];
      }
    } catch (e: any) {
      console.error('Error al cargar evolución:', e);
      this.evoDatos = [];
      this.evoPivots = [];
      this.evoAfiliacionesSinMatch = [];
      // Mensaje visible (antes se tragaba el error → parecía que "no cargaba").
      const status = e?.status ? ` (HTTP ${e.status})` : '';
      const msg = e?.message || e?.statusText || 'error desconocido';
      this.evoError = `No se pudo cargar la evolución${status}: ${msg}. Reintenta o reduce el rango de fechas.`;
    } finally {
      this.evoLoading = false;
    }
  }

  /** Arma los puntos de la evolución (uno por día o por mes, según `agrupacion`) a partir
   *  de los mapas ya agregados por período. Se reutiliza tanto para el total del ámbito
   *  como para cada sede del detalle (misma lógica, distinto mapa de entrada). */
  private construirPuntosEvo(
    porDiaMap: Map<string, { ll: number; ca: number }>,
    afilMap: Map<string, number>,
    desde: Date, hasta: Date, agrupacion: string,
  ): EvoPunto[] {
    const datos: EvoPunto[] = [];
    if (agrupacion === 'mes') {
      const d = new Date(desde.getFullYear(), desde.getMonth(), 1);
      const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
      let guard = 0;
      while (d <= fin && guard < 120) {
        const anio = d.getFullYear(), mes = d.getMonth();
        const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
        let ll = 0, ca = 0, afi = 0;
        porDiaMap.forEach((v, k) => { if (k.startsWith(prefijo)) { ll += v.ll; ca += v.ca; } });
        afilMap.forEach((v, k) => { if (k.startsWith(prefijo)) afi += v; });
        datos.push({ fecha: `${this.MESES_CORTOS[mes]} ${anio}`, llamadas: ll, cartas: ca, afiliaciones: afi });
        d.setMonth(d.getMonth() + 1); guard++;
      }
    } else {
      const d = new Date(desde); d.setHours(0, 0, 0, 0);
      const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
      let guard = 0;
      while (d <= fin && guard < 366) {
        const k = this.ymd(d);
        const acc = porDiaMap.get(k);
        datos.push({
          fecha: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
          llamadas: acc?.ll ?? 0, cartas: acc?.ca ?? 0, afiliaciones: afilMap.get(k) ?? 0,
        });
        d.setDate(d.getDate() + 1); guard++;
      }
    }
    return datos;
  }

  /** 'dd/mm/yyyy HH:mm:ss' → 'YYYY-MM-DD'. */
  private diaDeMarca(m: any): string {
    const p = (m ?? '').toString().trim().split(' ')[0].split('/');   // dd/mm/yyyy
    if (p.length !== 3) return '';
    return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
}
