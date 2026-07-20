import { Component, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';

interface PuntoSerie {
  dia: string;       // 'YYYY-MM-DD' (clave)
  fecha: string;     // etiqueta 'dd/MM' para el eje X
  registros: number; // gestiones reales (DNIs distintos) de ese día
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
  puntos: PuntoSerie[] = [];
  tituloSerie = 'Global';
  totalRango = 0;
  promedioDia = 0;
  maxDia = 0;

  private listData: any[] = [];
  private sedesCall: SedeCall[] = [];

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

    // Columnas de asesor a considerar: todas (global) o solo la sede elegida.
    const cols = sedeSel === 'GLOBAL'
      ? this.sedesCall.map(s => s.col)
      : this.sedesCall.filter(s => s.key === sedeSel).map(s => s.col);
    this.tituloSerie = sedeSel === 'GLOBAL'
      ? 'Global (todas las sedes)'
      : (this.sedesCall.find(s => s.key === sedeSel)?.nombre ?? 'Sede');

    // día 'YYYY-MM-DD' → conjunto de DNIs (gestiones reales = 1 por DNI).
    const porDia = new Map<string, Set<string>>();
    this.listData.forEach((r, i) => {
      if (!cols.some(c => (r[c] ?? '').toString().trim() !== '')) return;   // no es de la(s) sede(s)
      const dia = this.diaKey(r['Marca temporal']);
      if (!dia || dia < desdeK || dia > hastaK) return;
      const dni = this.soloDigitos(r['DNI CLIENTE']);
      const clave = dni ? `dni:${dni}` : `row:${i}`;   // sin DNI → cuenta individual
      if (!porDia.has(dia)) porDia.set(dia, new Set());
      porDia.get(dia)!.add(clave);
    });

    // Un punto por cada día del rango (relleno con 0 los días sin registros).
    const puntos: PuntoSerie[] = [];
    const d = new Date(desde); d.setHours(0, 0, 0, 0);
    const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
    let guard = 0;
    while (d <= fin && guard < 366) {
      const k = this.ymd(d);
      puntos.push({ dia: k, fecha: `${this.p2(d.getDate())}/${this.p2(d.getMonth() + 1)}`, registros: porDia.get(k)?.size ?? 0 });
      d.setDate(d.getDate() + 1);
      guard++;
    }

    this.puntos = puntos;
    this.totalRango = puntos.reduce((s, p) => s + p.registros, 0);
    this.maxDia = puntos.reduce((m, p) => Math.max(m, p.registros), 0);
    this.promedioDia = puntos.length ? Math.round(this.totalRango / puntos.length) : 0;
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
