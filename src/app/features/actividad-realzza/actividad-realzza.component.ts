import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { nombresRealzza } from '../../shared/asesores';

interface FilaAsesor {
  asesor: string;
  porHora: Record<number, number>;   // hora (9..19) → nº de registros
  total: number;
  primera: string;                   // 'HH:MM' del primer registro
  ultima: string;                    // 'HH:MM' del último
  enBreak: number;                   // registros en 13:00–15:00
  fueraHorario: number;              // antes de 9:00 o 20:00 en adelante
  horasActivas: number;              // horas laborables con ≥1 registro (de 9)
}

/**
 * Mapa de actividad horaria de las asesoras Realzza: cruza las hojas de Gestión
 * Realzza (/campo) y KOMMO (columnas Realzza) por ASESOR REALZZA + Marca temporal,
 * y arma un heatmap asesora × hora para ver desde qué hora registran, sus huecos y
 * si respetan el horario (9:00–20:00, break 13:00–15:00).
 */
@Component({
  selector: 'app-actividad-realzza',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './actividad-realzza.component.html',
  styleUrl: './actividad-realzza.component.css',
})
export class ActividadRealzzaComponent implements OnInit {
  private sheets = inject(SheetsService);
  private fb = inject(UntypedFormBuilder);

  readonly HORAS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  readonly BREAK = new Set([13, 14]);   // 13:00–15:00
  hoyMax = new Date();

  form!: UntypedFormGroup;
  cargando = false;
  yaCargo = false;

  filas: FilaAsesor[] = [];
  maxCelda = 1;
  porHora: { hora: string; count: number; break: boolean }[] = [];

  // KPIs
  totalReg = 0;
  asesorasActivas = 0;
  horaPico = '—';
  primeraGlobal = '—';
  pctHorario = 0;

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
        this.procesar([...(gestion || []), ...(kommo || [])], desde, hasta);
        this.cargando = false; this.yaCargo = true;
      },
      error: () => { this.cargando = false; this.yaCargo = true; },
    });
  }

  private procesar(rows: any[], desde: Date, hasta: Date): void {
    const d0 = this.ymd(desde), d1 = this.ymd(hasta);
    const map = new Map<string, { hora: number; tod: number; hhmm: string }[]>();

    for (const r of rows) {
      const asesor = (r['ASESOR REALZZA'] ?? '').toString().trim().toUpperCase();
      if (!asesor) continue;   // solo filas Realzza
      const p = this.parseMarca((r['Marca temporal'] ?? '').toString());
      if (!p || p.ymd < d0 || p.ymd > d1) continue;
      if (!map.has(asesor)) map.set(asesor, []);
      map.get(asesor)!.push({ hora: p.hora, tod: p.hora * 60 + p.min, hhmm: p.hhmm });
    }

    // Base: asesoras registradas (aunque no tengan registros) + las que aparezcan.
    const base = new Set<string>(nombresRealzza().map(n => n.toUpperCase().trim()));
    for (const k of map.keys()) base.add(k);

    let max = 1, total = 0, fueraTot = 0;
    const porHoraTot: Record<number, number> = {};

    this.filas = Array.from(base).map(asesor => {
      const regs = map.get(asesor) || [];
      const porHora: Record<number, number> = {};
      let enBreak = 0, fuera = 0;
      for (const g of regs) {
        porHora[g.hora] = (porHora[g.hora] || 0) + 1;
        if (this.BREAK.has(g.hora)) enBreak++;
        if (g.hora < 9 || g.hora >= 20) fuera++;
        if (g.hora >= 9 && g.hora <= 19) porHoraTot[g.hora] = (porHoraTot[g.hora] || 0) + 1;
      }
      for (const h of this.HORAS) max = Math.max(max, porHora[h] || 0);
      total += regs.length; fueraTot += fuera;
      const ord = regs.slice().sort((a, b) => a.tod - b.tod);
      const horasActivas = this.HORAS.filter(h => !this.BREAK.has(h) && (porHora[h] || 0) > 0).length;
      return {
        asesor, porHora, total: regs.length,
        primera: ord[0]?.hhmm || '', ultima: ord[ord.length - 1]?.hhmm || '',
        enBreak, fueraHorario: fuera, horasActivas,
      };
    }).sort((a, b) => b.total - a.total || a.asesor.localeCompare(b.asesor));

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
  }

  // 'dd/mm/yyyy hh:mm:ss' → { ymd, hora, min, hhmm }
  private parseMarca(s: string): { ymd: string; hora: number; min: number; hhmm: string } | null {
    if (!s || !s.includes('/')) return null;
    const [fecha, hms] = s.split(' ');
    const [d, m, y] = fecha.split('/');
    if (!d || !m || !y) return null;
    const [hh, mm] = (hms || '0:0').split(':');
    const hora = +hh || 0, min = +mm || 0;
    return {
      ymd: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
      hora, min, hhmm: `${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
    };
  }
  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  esBreak(h: number): boolean { return this.BREAK.has(h); }

  /** Color de celda del heatmap por intensidad (más registros = más oscuro). */
  celColor(count: number): string {
    if (!count) return 'transparent';
    const t = Math.min(1, count / this.maxCelda);
    return `rgba(26,95,173,${(0.16 + 0.84 * t).toFixed(2)})`;
  }
  celTextColor(count: number): string {
    return count && count / this.maxCelda > 0.5 ? '#fff' : '#1E3A5F';
  }

  hoy(): void { const h = new Date(); this.form.patchValue({ desde: h, hasta: h }); this.cargar(); }
  barColor = (info: any) => ({ color: info.data?.break ? '#F9A825' : '#1A5FAD' });
}
