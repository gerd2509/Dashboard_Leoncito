import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { nombresRealzza } from '../../shared/asesores';

type TipoGestion = 'BD' | 'KOMMO' | 'MARKET PLACE';
interface Registro {
  asesor: string; corto: string; ymd: string; diaLabel: string; hora: number; tod: number; hhmm: string;
  tipo: TipoGestion; dni: string; estado: string;
}
interface FilaAsesor {
  asesor: string; corto: string;
  porHora: Record<number, number>;
  total: number; primera: string; ultima: string;
  enBreak: number; fueraHorario: number; horasActivas: number;
}

/**
 * Mapa de actividad horaria de las asesoras Realzza: cruza Gestión Realzza (/campo)
 * y KOMMO (Realzza) por ASESOR REALZZA + Marca temporal. Cada registro se etiqueta
 * por tipo (BD = gestión Realzza, KOMMO, MARKET PLACE). Heatmap asesora×hora, combo
 * por asesor, popup de detalle con la hora, y análisis individual.
 */
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-actividad-realzza',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './actividad-realzza.component.html',
  styleUrl: './actividad-realzza.component.css',
})
export class ActividadRealzzaComponent implements OnInit {
  private sheets = inject(SheetsService);
  private fb = inject(UntypedFormBuilder);

  private readonly CORTOS: Record<string, string> = {
    'MONTALVO LUYO ERNESTO ADOLFO': 'ERNESTO', 'PEREZ TINEO MARICIELO TATIANA': 'TATIANA',
    'RIVAS PURISACA KAREN YUDITH': 'YUDITH', 'ACOSTA JIMENEZ MARIELA NATALY': 'NATALY',
    'BERNAL BAZAN BRENDA NICOLL': 'BRENDA', 'SERNAQUE DAVILA JUAN ALBERTO': 'JUAN',
    'CARRANZA ALARCON TREYCI JOHANA': 'TREYCI', 'SANDOVAL OTINIANO JUANA DEL PILAR': 'JUANA',
    'SANTAMARIA GUZMAN MERLY BRIGHITE': 'MERLY', 'MIÑOPE GONZALES ANYELA ESTHEFANY': 'ANYELA',
    'SAMAME HUAMAN ARIADNE': 'ARIADNE', 'UCHOFEN VIGO FELICITA': 'FELICITA',
    'BUSTAMANTE CHALAN ANA RUT': 'ANA RUT', 'LLONTOP DAVILA DENNIS CHRISTIAN': 'DENNIS',
    'GUILLEN MACKUADO AURORA FERNANDA': 'AURORA',
  };
  private corto(nom: string): string { return this.CORTOS[nom] || (nom || '').split(' ')[0]; }

  /** Normaliza un nombre (mayúsculas, sin tildes ni ñ, espacios colapsados). */
  private normNom(s: string): string {
    return (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/Ñ/g, 'N').replace(/\s+/g, ' ').trim();
  }
  /** NO son asesoras Realzza (supervisión) → se excluyen del mapa de actividad. */
  private readonly EXCLUIDOS = new Set<string>(
    ['CARMONA CASTAÑEDA JOSE MANUEL'].map(n => this.normNom(n)));

  readonly HORAS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  readonly BREAK = new Set([13, 14]);
  hoyMax = new Date();

  form!: UntypedFormGroup;
  cargando = false;
  yaCargo = false;

  private registrosAll: Registro[] = [];
  asesorOptions: { value: string; text: string }[] = [];
  selectedAsesor = '';   // '' = todas

  filas: FilaAsesor[] = [];
  maxCelda = 1;
  porHora: { hora: string; count: number; break: boolean }[] = [];

  // KPIs
  totalReg = 0; asesorasActivas = 0; horaPico = '—'; primeraGlobal = '—'; pctHorario = 0;

  // Análisis individual (cuando hay un asesor seleccionado)
  analisis: {
    inicioTipico: string; horaPico: string; diasActivos: number; promDia: number;
    porTipo: { tipo: string; n: number; pct: number }[];
  } | null = null;

  // Popup de detalle
  popupVisible = false;
  popupTitulo = '';
  popupRegistros: Registro[] = [];

  ngOnInit(): void {
    const hoy = new Date();
    this.form = this.fb.group({ desde: [hoy], hasta: [hoy] });
    this.cargar();
  }

  cargar(): void {
    const desde = this.form.value.desde as Date;
    const hasta = this.form.value.hasta as Date;
    if (!desde || !hasta) return;
    this.cargando = true;
    const rango = { desde, hasta };
    forkJoin({
      gestion: this.sheets.getSheetDataCampoRango(rango),
      kommo: this.sheets.getSheetKOMMORango(rango),
    }).subscribe({
      next: ({ gestion, kommo }) => {
        this.construir(gestion || [], kommo || [], desde, hasta);
        this.aplicarVista();
        this.cargando = false; this.yaCargo = true;
      },
      error: () => { this.cargando = false; this.yaCargo = true; },
    });
  }

  /** Arma la lista de registros etiquetados por tipo, del rango. */
  private construir(gestion: any[], kommo: any[], desde: Date, hasta: Date): void {
    const d0 = this.ymd(desde), d1 = this.ymd(hasta);
    const regs: Registro[] = [];

    const push = (r: any, tipo: TipoGestion, colDni: string, colEstado: string) => {
      const asesor = (r['ASESOR REALZZA'] ?? '').toString().trim().toUpperCase();
      if (!asesor) return;
      if (this.EXCLUIDOS.has(this.normNom(asesor))) return;   // supervisora (CARMONA) fuera
      const p = this.parseMarca((r['Marca temporal'] ?? '').toString());
      if (!p || p.ymd < d0 || p.ymd > d1) return;
      regs.push({
        asesor, corto: this.corto(asesor), ymd: p.ymd, diaLabel: this.diaLabelDe(p.ymd),
        hora: p.hora, tod: p.hora * 60 + p.min, hhmm: p.hhmm,
        tipo, dni: (r[colDni] ?? '').toString().trim(), estado: (r[colEstado] ?? '').toString().trim(),
      });
    };

    // Gestión Realzza = base de datos.
    gestion.forEach(r => push(r, 'BD', 'DNI CLIENTE', 'ESTADO DE GESTIÓN'));
    // KOMMO Realzza: Market Place (SI) vs KOMMO.
    kommo.forEach(r => {
      const mp = (r['MARKET PLACE R'] ?? '').toString().toUpperCase().trim();
      const tipo: TipoGestion = (mp === 'SI' || mp === 'SÍ') ? 'MARKET PLACE' : 'KOMMO';
      push(r, tipo, 'DNI CLIENTE REALZZA', 'ESTADO DE GESTIÓN REALZZA');
    });

    this.registrosAll = regs;

    // Combo de asesores: registradas + las que aparezcan.
    const base = new Set<string>(nombresRealzza().map(n => n.toUpperCase().trim()));
    for (const r of regs) base.add(r.asesor);
    this.asesorOptions = [{ value: '', text: 'Todas las asesoras' },
      ...Array.from(base).map(a => ({ value: a, text: this.corto(a) })).sort((x, y) => x.text.localeCompare(y.text))];
  }

  /** Recalcula heatmap/KPIs/análisis según el asesor seleccionado. */
  aplicarVista(): void {
    const sel = this.selectedAsesor;
    const regs = sel ? this.registrosAll.filter(r => r.asesor === sel) : this.registrosAll;

    // Base de filas (asesoras): si hay uno seleccionado, solo ese.
    const base = new Set<string>(sel ? [sel] : [...nombresRealzza().map(n => n.toUpperCase().trim()), ...this.registrosAll.map(r => r.asesor)]);

    const porAsesor = new Map<string, Registro[]>();
    for (const r of regs) { if (!porAsesor.has(r.asesor)) porAsesor.set(r.asesor, []); porAsesor.get(r.asesor)!.push(r); }

    let max = 1, total = 0, fueraTot = 0;
    const porHoraTot: Record<number, number> = {};
    this.filas = Array.from(base).map(asesor => {
      const rs = porAsesor.get(asesor) || [];
      const porHora: Record<number, number> = {};
      let enBreak = 0, fuera = 0;
      for (const g of rs) {
        porHora[g.hora] = (porHora[g.hora] || 0) + 1;
        if (this.BREAK.has(g.hora)) enBreak++;
        if (g.hora < 9 || g.hora >= 20) fuera++;
        if (g.hora >= 9 && g.hora <= 19) porHoraTot[g.hora] = (porHoraTot[g.hora] || 0) + 1;
      }
      for (const h of this.HORAS) max = Math.max(max, porHora[h] || 0);
      total += rs.length; fueraTot += fuera;
      const ord = rs.slice().sort((a, b) => a.tod - b.tod);
      const horasActivas = this.HORAS.filter(h => !this.BREAK.has(h) && (porHora[h] || 0) > 0).length;
      return {
        asesor, corto: this.corto(asesor), porHora, total: rs.length,
        primera: ord[0]?.hhmm || '', ultima: ord[ord.length - 1]?.hhmm || '',
        enBreak, fueraHorario: fuera, horasActivas,
      };
    }).sort((a, b) => b.total - a.total || a.corto.localeCompare(b.corto));

    this.maxCelda = max;
    this.totalReg = total;
    this.asesorasActivas = this.filas.filter(f => f.total > 0).length;
    let pico = -1, picoN = -1;
    for (const h of this.HORAS) { const n = porHoraTot[h] || 0; if (n > picoN) { picoN = n; pico = h; } }
    this.horaPico = picoN > 0 ? `${pico}:00` : '—';
    const primeras = this.filas.map(f => f.primera).filter(Boolean).sort();
    this.primeraGlobal = primeras[0] || '—';
    this.pctHorario = total ? Math.round(((total - fueraTot) / total) * 100) : 0;
    this.porHora = this.HORAS.map(h => ({ hora: `${h}:00`, count: porHoraTot[h] || 0, break: this.BREAK.has(h) }));

    this.analisis = sel ? this.calcularAnalisis(regs) : null;
  }

  /** Análisis del asesor seleccionado en el periodo. */
  private calcularAnalisis(regs: Registro[]): ActividadRealzzaComponent['analisis'] {
    if (!regs.length) return { inicioTipico: '—', horaPico: '—', diasActivos: 0, promDia: 0, porTipo: [] };
    // Primera hora por día → promedio (hora de inicio típica).
    const primerasPorDia = new Map<string, number>();
    for (const r of regs) {
      const cur = primerasPorDia.get(r.ymd);
      if (cur === undefined || r.tod < cur) primerasPorDia.set(r.ymd, r.tod);
    }
    const prom = Math.round([...primerasPorDia.values()].reduce((s, v) => s + v, 0) / primerasPorDia.size);
    const inicioTipico = `${String(Math.floor(prom / 60)).padStart(2, '0')}:${String(prom % 60).padStart(2, '0')}`;
    // Hora pico.
    const porHora: Record<number, number> = {};
    for (const r of regs) porHora[r.hora] = (porHora[r.hora] || 0) + 1;
    let pico = -1, picoN = -1;
    for (const h of Object.keys(porHora)) { const n = porHora[+h]; if (n > picoN) { picoN = n; pico = +h; } }
    // Por tipo.
    const porTipoM: Record<string, number> = {};
    for (const r of regs) porTipoM[r.tipo] = (porTipoM[r.tipo] || 0) + 1;
    const porTipo = Object.entries(porTipoM).map(([tipo, n]) => ({ tipo, n, pct: Math.round((n / regs.length) * 100) }))
      .sort((a, b) => b.n - a.n);
    const diasActivos = primerasPorDia.size;
    return { inicioTipico, horaPico: `${pico}:00`, diasActivos, promDia: Math.round(regs.length / diasActivos), porTipo };
  }

  onAsesorChange(): void { this.aplicarVista(); }

  /** Popup con el detalle (hora + tipo) de un asesor, opcionalmente de una hora. */
  abrirDetalle(asesor: string, hora?: number): void {
    let regs = this.registrosAll.filter(r => r.asesor === asesor);
    if (hora !== undefined) regs = regs.filter(r => r.hora === hora);
    this.popupRegistros = regs.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.tod - b.tod);
    this.popupTitulo = this.corto(asesor) + (hora !== undefined ? ` · ${hora}:00` : '') + ` — ${regs.length} registro(s)`;
    this.popupVisible = true;
  }
  celClick(f: FilaAsesor, h: number): void { if ((f.porHora[h] || 0) > 0) this.abrirDetalle(f.asesor, h); }

  /** Muestra el label bonito del día en la cabecera de grupo (agrupamos por ymd
   *  para que el orden sea cronológico, no alfabético). */
  mostrarDia = (info: any): string => this.diaLabelDe(info?.value ?? '');

  private parseMarca(s: string): { ymd: string; hora: number; min: number; hhmm: string } | null {
    if (!s || !s.includes('/')) return null;
    const [fecha, hms] = s.split(' ');
    const [d, m, y] = fecha.split('/');
    if (!d || !m || !y) return null;
    const [hh, mm] = (hms || '0:0').split(':');
    const hora = +hh || 0, min = +mm || 0;
    return { ymd: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, hora, min, hhmm: `${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
  }
  private ymd(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  private readonly DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  private diaLabelDe(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${this.DIAS[dt.getDay()]} · ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  /** Repinta el popup al mostrarse (evita que el título salga cortado la 1ª vez). */
  popupShown(e: any): void { e.component?.repaint(); }

  esBreak(h: number): boolean { return this.BREAK.has(h); }
  // Escala de calor diferenciada: amarillo claro (poco) → naranja → rojo (mucho).
  private readonly STOPS = [[255, 241, 179], [255, 179, 71], [230, 81, 0], [183, 28, 28]];
  celColor(count: number): string {
    if (!count) return 'transparent';
    const t = Math.min(1, count / this.maxCelda);
    const n = this.STOPS.length - 1;
    const seg = Math.min(n - 1, Math.floor(t * n));
    const lt = t * n - seg;
    const a = this.STOPS[seg], b = this.STOPS[seg + 1];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * lt));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  celTextColor(count: number): string { return count && count / this.maxCelda > 0.45 ? '#fff' : '#5b3b00'; }
  hoy(): void { const h = new Date(); this.form.patchValue({ desde: h, hasta: h }); this.cargar(); }
  barColor = (info: any) => ({ color: info.data?.break ? '#F9A825' : '#1A5FAD' });
  tipoClase(t: string): string { return t === 'MARKET PLACE' ? 'mp' : t === 'KOMMO' ? 'km' : 'bd'; }
}
