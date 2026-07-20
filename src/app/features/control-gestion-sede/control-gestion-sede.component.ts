import { Component, OnInit, OnDestroy } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import * as XLSX from 'xlsx';

interface AsesorRow {
  asesor: string;
  supervisor: string;   // supervisor del CAP (para agrupar el detalle por sede)
  llamadaContacto: number;
  llamadaNoContacto: number;
  cartaContacto: number;
  cartaNoContacto: number;
  totalContacto: number;
  total: number;
  porcentaje: number;
  afiliaciones: number;   // del Excel importado (cruce por nombre)
}

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
  pctLlamadas: number;   // % cumplimiento llamadas vs meta diaria (0-100+)
  pctCartas: number;     // % cumplimiento cartas   vs meta diaria (0-100+)
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
  pctLlamadas: number;
  pctCartas: number;
}

@Component({
  selector: 'app-control-gestion-sede',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './control-gestion-sede.component.html',
  styleUrl: './control-gestion-sede.component.css'
})
export class ControlGestionSedeComponent implements OnInit, OnDestroy {

  formCtrl: UntypedFormGroup;
  isLoading = false;
  resumenVisible = true;

  sedesBloques: SedeBloque[] = [];

  // ── Resumen agrupado por zona ──
  resumenGrupos: ZonaGrupo[] = [];
  resumenTotalGen = { llamadas: 0, cartas: 0, gestiones: 0, afiliaciones: 0, metaDiariaLlamadas: 0, metaDiariaCartas: 0, pctLlamadas: 0, pctCartas: 0 };

  // ── Afiliaciones (se importan de un Excel y se guardan en el navegador) ──
  private afiliacionesMap = new Map<string, number>();   // normNombre → nº afiliaciones
  afiliacionesInfo: { archivo: string; fecha: string; total: number } | null = null;
  afiliacionesError = '';
  private readonly AFI_KEY = 'cgs_afiliaciones_v1';
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

  private listData: any[] = [];
  private sedesObjetivo: { key: string; nombre: string }[] = [];
  // Roster de vendedores ACTIVOS por sede, tomado del CAP (nombres correctos).
  private capPorSede = new Map<string, string[]>();
  // Mapa vendedor(UPPER) → supervisor por sede (del CAP), para agrupar el detalle.
  private supPorSede = new Map<string, Map<string, string>>();

  private intervaloCincoMin: any = null;

  constructor(
    private fb: UntypedFormBuilder,
    private sheetsService: SheetsService,
    private auth: AuthService,
    private sedeConfig: SedeConfigService,
    private cap: CapSedesService,
  ) {
    this.formCtrl = this.fb.group({ fechaGestion: [new Date()] });
  }

  async ngOnInit() {
    this.cargarAfiliacionesLocal();   // afiliaciones guardadas en el navegador (si hay)
    const u = this.auth.getUsuario();
    const esGlobal = !u || u.rol === 'admin' || u.sede.toLowerCase() === 'todas';

    if (esGlobal) {
      // Orden por zona (CENTRO → NORTE → SUR) para que las tarjetas de detalle
      // coincidan con el resumen agrupado.
      this.sedesObjetivo = this.sedeConfig.getSedesParaCombo()
        .sort((a, b) => this.ordenSedes.indexOf(a.key) - this.ordenSedes.indexOf(b.key));
    } else {
      const cfg = this.sedeConfig.getConfig(u.sede);
      this.sedesObjetivo = cfg
        ? [{ key: this.sedeConfig.normalizar(u.sede), nombre: cfg.nombre }]
        : [];
    }

    // Mostrar headers de inmediato (skeleton) para que no se vea vacío al cargar
    this.inicializarBloquesSkeleton();

    // Carga los datos y renderiza YA (con la lista estática como fallback).
    await this.cargarDatos();
    this.intervaloCincoMin = setInterval(() => this.cargarDatos(), 5 * 60 * 1000);

    // El CAP se carga en segundo plano; al llegar, recalcula con los nombres correctos.
    this.cargarRosterCap();
  }

  // Roster de vendedores ACTIVOS por sede desde el CAP (no bloquea el render).
  private async cargarRosterCap(): Promise<void> {
    await this.cap.cargar();
    for (const s of this.sedesObjetivo) {
      this.capPorSede.set(s.key, await this.cap.vendedoresActivos(s.key));
      this.supPorSede.set(s.key, await this.cap.supervisoresPorVendedor(s.key));
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
      pctLlamadas: 0,
      pctCartas: 0,
    }));
  }

  ngOnDestroy() {
    if (this.intervaloCincoMin) clearInterval(this.intervaloCincoMin);
  }

  async cargarDatos() {
    this.isLoading = true;
    try {
      // Solo el día seleccionado (el sheet de sedes es enorme; filtrar en el backend
      // evita descargar todo el histórico y que la app se cuelgue al refrescar).
      const fecha = this.formCtrl.value.fechaGestion as Date;
      this.listData = await lastValueFrom(
        this.sheetsService.getSheetDataSedes({ desde: fecha, hasta: fecha })
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

  private calcular() {
    const fecha = this.formCtrl.value.fechaGestion as Date;
    const yaExpandida = new Set(this.sedesBloques.filter(b => b.expandida).map(b => b.key));
    const soloUna = this.sedesObjetivo.length === 1;

    // Días del mes seleccionado → meta diaria = meta mensual / días del mes
    this.diasDelMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();

    this.sedesBloques = this.sedesObjetivo.map(sede => {
      const cfg = this.sedeConfig.getConfig(sede.key);
      // Roster desde el CAP (solo ACTIVOS); si no hay CAP, cae al listado estático.
      const asesores = this.capPorSede.get(sede.key)?.length
        ? this.capPorSede.get(sede.key)!
        : (cfg?.asesores ?? []);
      const supMap = this.supPorSede.get(sede.key);
      const valorSede = cfg?.valorSede ?? sede.nombre;

      // Filtrar filas de esta sede + fecha seleccionada
      const filasSede = this.listData.filter(r =>
        this.sedeConfig.mismaSede(r['TIENDA SEDE'], valorSede) &&
        this.esMismaFecha(r['Marca temporal'], fecha)
      );

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
          supervisor: supMap?.get(asesorNombre) ?? 'SIN SUPERVISOR',
          llamadaContacto, llamadaNoContacto,
          cartaContacto, cartaNoContacto,
          totalContacto, total,
          porcentaje: total > 0 ? totalContacto / total : 0,
          afiliaciones: this.afiliacionesMap.get(objetivo) ?? 0,
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

      // Metas: mensual (config) → diaria = mensual / días del mes
      const metaLlamadasMensual = cfg?.metaLlamadasMensual ?? 0;
      const metaCartasMensual   = cfg?.metaCartasMensual ?? 0;
      const metaDiariaLlamadas  = this.diasDelMes > 0 ? Math.round(metaLlamadasMensual / this.diasDelMes) : 0;
      const metaDiariaCartas    = this.diasDelMes > 0 ? Math.round(metaCartasMensual   / this.diasDelMes) : 0;

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
        // % cumplimiento = gestiones del día / meta diaria
        pctLlamadas: metaDiariaLlamadas > 0 ? Math.round((totalLlamadas / metaDiariaLlamadas) * 100) : 0,
        pctCartas:   metaDiariaCartas   > 0 ? Math.round((totalCartas   / metaDiariaCartas)   * 100) : 0,
      };
    });

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
      const gestiones          = sedes.reduce((s, b) => s + b.totalGestiones, 0);
      const afiliaciones       = sedes.reduce((s, b) => s + b.totalAfiliaciones, 0);

      grupos.push({
        zona, sedes, llamadas, cartas, gestiones, afiliaciones, metaDiariaLlamadas, metaDiariaCartas,
        pctLlamadas: metaDiariaLlamadas > 0 ? Math.round((llamadas / metaDiariaLlamadas) * 100) : 0,
        pctCartas:   metaDiariaCartas   > 0 ? Math.round((cartas   / metaDiariaCartas)   * 100) : 0,
      });
    }
    this.resumenGrupos = grupos;

    // Total general
    const llamadas           = this.sedesBloques.reduce((s, b) => s + b.totalLlamadas, 0);
    const cartas             = this.sedesBloques.reduce((s, b) => s + b.totalCartas, 0);
    const metaDiariaLlamadas = this.sedesBloques.reduce((s, b) => s + b.metaDiariaLlamadas, 0);
    const metaDiariaCartas   = this.sedesBloques.reduce((s, b) => s + b.metaDiariaCartas, 0);
    const gestiones          = this.sedesBloques.reduce((s, b) => s + b.totalGestiones, 0);
    const afiliaciones       = this.sedesBloques.reduce((s, b) => s + b.totalAfiliaciones, 0);
    this.resumenTotalGen = {
      llamadas, cartas, gestiones, afiliaciones, metaDiariaLlamadas, metaDiariaCartas,
      pctLlamadas: metaDiariaLlamadas > 0 ? Math.round((llamadas / metaDiariaLlamadas) * 100) : 0,
      pctCartas:   metaDiariaCartas   > 0 ? Math.round((cartas   / metaDiariaCartas)   * 100) : 0,
    };

    // Rangos para la escala de 3 colores (solo sobre las filas de sede)
    this.valoresPctLlamadas = this.sedesBloques.map(b => b.pctLlamadas);
    this.valoresPctCartas   = this.sedesBloques.map(b => b.pctCartas);
  }

  toggleResumen() {
    this.resumenVisible = !this.resumenVisible;
  }

  // ── Escala de 3 colores (Excel): rojo (mín) → amarillo (percentil 50) → verde (máx) ──
  colorLlamadas(valor: number): string { return this.rgbStr(this.escalaRGB(valor, this.valoresPctLlamadas)); }
  colorCartas(valor: number): string   { return this.rgbStr(this.escalaRGB(valor, this.valoresPctCartas)); }
  textoLlamadas(valor: number): string { return this.textoSobre(this.escalaRGB(valor, this.valoresPctLlamadas)); }
  textoCartas(valor: number): string   { return this.textoSobre(this.escalaRGB(valor, this.valoresPctCartas)); }

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
  // Cruce por nombre del vendedor (columna "ASESOR DE VENTA"): cada fila = 1 afiliación.
  // ──────────────────────────────────────────────────────────────────────────
  private cargarAfiliacionesLocal(): void {
    try {
      const raw = localStorage.getItem(this.AFI_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.afiliacionesMap = new Map(Object.entries(data.conteo || {}).map(([k, v]) => [k, Number(v)]));
      this.afiliacionesInfo = { archivo: data.archivo || '', fecha: data.fecha || '', total: data.total || 0 };
    } catch { /* localStorage corrupto: se ignora */ }
  }

  /** Importa el Excel de afiliaciones (cuenta filas por "ASESOR DE VENTA"). */
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

        // Columna del asesor: "ASESOR DE VENTA" (tolera acentos/mayúsculas).
        const headers = Object.keys(filas[0]);
        const colAsesor = headers.find(h => this.normNombre(h) === this.normNombre('ASESOR DE VENTA'))
          ?? headers.find(h => this.normNombre(h).includes('asesor'));
        if (!colAsesor) throw new Error('No se encontró la columna "ASESOR DE VENTA" en el Excel.');

        const conteo: Record<string, number> = {};
        let total = 0;
        for (const r of filas) {
          const nombre = this.normNombre(r[colAsesor]);
          if (!nombre) continue;
          conteo[nombre] = (conteo[nombre] || 0) + 1;
          total++;
        }

        this.afiliacionesMap = new Map(Object.entries(conteo));
        this.afiliacionesInfo = { archivo: file.name, fecha: new Date().toLocaleString('es-PE'), total };
        localStorage.setItem(this.AFI_KEY, JSON.stringify({ ...this.afiliacionesInfo, conteo }));

        if (this.listData.length) this.calcular();   // refresca las tablas con las afiliaciones
      } catch (err: any) {
        this.afiliacionesError = err?.message ?? 'No se pudo leer el Excel.';
      }
      input.value = '';
    };
    reader.onerror = () => { this.afiliacionesError = 'Error al leer el archivo.'; input.value = ''; };
    reader.readAsArrayBuffer(file);
  }

  /** Borra las afiliaciones guardadas en el navegador. */
  limpiarAfiliaciones(): void {
    this.afiliacionesMap.clear();
    this.afiliacionesInfo = null;
    this.afiliacionesError = '';
    localStorage.removeItem(this.AFI_KEY);
    if (this.listData.length) this.calcular();
  }
}
