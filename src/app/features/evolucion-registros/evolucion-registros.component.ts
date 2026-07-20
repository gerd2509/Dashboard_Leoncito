import { Component, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';

interface SerieSede {
  key: string;       // valueField del punto (clave de sede)
  nombre: string;    // nombre de la serie (leyenda)
  color: string;     // color fijo de la sede
}

interface SedeCall {
  key: string;
  nombre: string;
  col: string;       // columna del asesor en el sheet: 'ASESOR <SEDE>'
}

/**
 * Evolución de Registros — tendencia (gráfico de líneas) de las gestiones reales
 * (1 por DNI) por día, en un rango de fechas. Global (todas las sedes Call) por
 * defecto, con selector para ver una sede en concreto. Mismos datos que
 * Control Call Sedes (sheet de gestión de sedes).
 */
@Component({
  selector: 'app-evolucion-registros',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './evolucion-registros.component.html',
  styleUrl: './evolucion-registros.component.css',
})
export class EvolucionRegistrosComponent implements OnInit {
  formCtrl: UntypedFormGroup;
  isLoading = false;

  sedeOptions: { value: string; label: string }[] = [];
  puntos: any[] = [];               // formato ancho: { fecha, <sedeKey>: n, ... } por día
  seriesActivas: SerieSede[] = [];  // una serie (línea) por sede a dibujar
  multiSerie = false;   // true = una línea por sede (Global); false = una sola línea
  tituloSerie = 'Global';
  popupVisible = false; // gráfico ampliado en popup
  totalRango = 0;
  promedioDia = 0;
  maxDia = 0;

  private listData: any[] = [];
  private sedesCall: SedeCall[] = [];

  // Color FIJO por sede (mismo color en Global y al verla individualmente).
  private readonly PALETA = ['#1A5FAD', '#E65100', '#2E7D32', '#6A1B9A', '#C62828', '#00838F', '#F9A825', '#5D4037'];
  private coloresSede = new Map<string, string>();   // sedeKey → color

  constructor(
    private fb: UntypedFormBuilder,
    private sheets: SheetsService,
    private auth: AuthService,
    private sedeCfg: SedeConfigService,
  ) {
    const hoy = new Date();
    const desde = new Date(); desde.setDate(hoy.getDate() - 6);   // últimos 7 días
    this.formCtrl = this.fb.group({ desde: [desde], hasta: [hoy], sede: ['GLOBAL'] });
  }

  async ngOnInit(): Promise<void> {
    const u = this.auth.getUsuario();
    const esGlobal = !u || u.rol === 'admin' || (u.sede || '').toLowerCase() === 'todas';

    const todas: SedeCall[] = this.sedeCfg.getSedesCall().map(s => {
      const cfg = this.sedeCfg.getConfig(s.key);
      const valorSede = cfg?.valorSede ?? s.nombre;
      return { key: s.key, nombre: s.nombre, col: `ASESOR ${valorSede.toUpperCase()}` };
    });
    // Color fijo por sede (por su orden en la lista completa → mismo color siempre).
    todas.forEach((s, i) => this.coloresSede.set(s.key, this.PALETA[i % this.PALETA.length]));

    if (esGlobal) {
      this.sedesCall = todas;
      this.sedeOptions = [{ value: 'GLOBAL', label: 'Global (todas)' }, ...todas.map(s => ({ value: s.key, label: s.nombre }))];
      this.formCtrl.patchValue({ sede: 'GLOBAL' }, { emitEvent: false });
    } else {
      const key = this.sedeCfg.normalizar(u!.sede);
      this.sedesCall = todas.filter(s => s.key === key);
      this.sedeOptions = this.sedesCall.map(s => ({ value: s.key, label: s.nombre }));
      this.formCtrl.patchValue({ sede: this.sedeOptions[0]?.value ?? key }, { emitEvent: false });
    }

    await this.cargarDatos();
  }

  async cargarDatos(): Promise<void> {
    this.isLoading = true;
    try {
      this.listData = await lastValueFrom(this.sheets.getSheetDataFerre());
      this.calcular();
    } catch (e) {
      console.error('Error al cargar datos de gestión:', e);
      this.listData = [];
      this.puntos = [];
    } finally {
      this.isLoading = false;
    }
  }

  /** Recalcula con el rango/sede actuales (sin volver a pedir el sheet). */
  actualizar(): void {
    this.calcular();
  }

  private calcular(): void {
    const desde = this.formCtrl.value.desde as Date;
    const hasta = this.formCtrl.value.hasta as Date;
    const sedeSel = this.formCtrl.value.sede as string;
    if (!desde || !hasta) { this.puntos = []; return; }

    const desdeK = this.ymd(desde);
    const hastaK = this.ymd(hasta);

    // Sedes en alcance: todas (Global) o solo la elegida.
    const scope = sedeSel === 'GLOBAL' ? this.sedesCall : this.sedesCall.filter(s => s.key === sedeSel);
    this.tituloSerie = sedeSel === 'GLOBAL'
      ? 'Global — una línea por sede'
      : (this.sedesCall.find(s => s.key === sedeSel)?.nombre ?? 'Sede');

    // Días del rango (para rellenar con 0 los días sin registros).
    const dias: string[] = [];
    const d = new Date(desde); d.setHours(0, 0, 0, 0);
    const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
    let guard = 0;
    while (d <= fin && guard < 366) { dias.push(this.ymd(d)); d.setDate(d.getDate() + 1); guard++; }
    const etiqueta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;   // 'YYYY-MM-DD' → 'dd/MM'

    // sedeKey → (día → Set<DNI>) y unión global (día → Set<DNI>) para los KPIs.
    const porSede = new Map<string, Map<string, Set<string>>>();
    const global = new Map<string, Set<string>>();
    this.listData.forEach((r, i) => {
      const dia = this.diaKey(r['Marca temporal']);
      if (!dia || dia < desdeK || dia > hastaK) return;
      const dni = this.soloDigitos(r['DNI CLIENTE']);
      const clave = dni ? `dni:${dni}` : `row:${i}`;   // sin DNI → cuenta individual
      for (const s of scope) {
        if ((r[s.col] ?? '').toString().trim() === '') continue;   // la fila no es de esta sede
        if (!porSede.has(s.key)) porSede.set(s.key, new Map());
        const m = porSede.get(s.key)!;
        if (!m.has(dia)) m.set(dia, new Set());
        m.get(dia)!.add(clave);
        if (!global.has(dia)) global.set(dia, new Set());
        global.get(dia)!.add(clave);
      }
    });

    // Series a dibujar: Global = una por sede con datos; sede concreta = esa sola.
    // Cada sede con su color fijo (mismo en Global y en individual).
    const sedesConDatos = scope.filter(s => {
      const m = porSede.get(s.key);
      return m && [...m.values()].some(set => set.size > 0);
    });
    const series = sedeSel === 'GLOBAL' ? sedesConDatos : scope;
    this.seriesActivas = series.map(s => ({
      key: s.key, nombre: s.nombre, color: this.coloresSede.get(s.key) ?? '#1A5FAD',
    }));
    this.multiSerie = sedeSel === 'GLOBAL' && series.length > 1;

    // Puntos en formato ancho: una fila por día con un valor por cada serie/sede.
    this.puntos = dias.map(k => {
      const row: any = { fecha: etiqueta(k) };
      for (const s of series) row[s.key] = porSede.get(s.key)?.get(k)?.size ?? 0;
      return row;
    });

    // KPIs: siempre la TOTALIDAD del alcance (unión de DNIs por día).
    let total = 0, max = 0;
    for (const k of dias) { const n = global.get(k)?.size ?? 0; total += n; max = Math.max(max, n); }
    this.totalRango = total;
    this.maxDia = max;
    this.promedioDia = dias.length ? Math.round(total / dias.length) : 0;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private ymd(d: Date): string {
    return `${d.getFullYear()}-${this.p2(d.getMonth() + 1)}-${this.p2(d.getDate())}`;
  }
  private p2(n: number): string { return String(n).padStart(2, '0'); }

  /** 'Marca temporal' (dd/mm/yyyy [hh:mm...]) → 'YYYY-MM-DD'. */
  private diaKey(marca: any): string {
    const s = (marca ?? '').toString().trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return '';
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  private soloDigitos(v: any): string {
    return (v === null || v === undefined ? '' : String(v)).replace(/\D/g, '');
  }
}
