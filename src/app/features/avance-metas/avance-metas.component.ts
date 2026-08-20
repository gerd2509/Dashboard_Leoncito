import { Component, inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

interface FilaGeneral {
  sede: string; sedeNorm: string; color: string;
  propio: number; aliado: number; total: number; meta: number; pct: number;
}
interface FilaMotos {
  sede: string; sedeNorm: string; color: string;
  propioOps: number; propioMonto: number; aliadoOps: number; aliadoMonto: number;
  totalOps: number; totalMonto: number; meta: number; pct: number;
}

@Component({
  selector: 'app-avance-metas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './avance-metas.component.html',
  styleUrl: './avance-metas.component.css'
})
export class AvanceMetasComponent implements OnInit {
  private ventas = inject(CargaVentasService);
  protected sedeConfig = inject(SedeConfigService);

  form: UntypedFormGroup;
  isLoading = false;

  anios = [2025, 2026];
  meses = [
    { v: 0, t: 'Todo el año' }, { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' },
    { v: 4, t: 'Abril' }, { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' },
    { v: 8, t: 'Agosto' }, { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' }, { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];

  general: FilaGeneral[] = [];
  motos: FilaMotos[] = [];
  totGen = { propio: 0, aliado: 0, total: 0, meta: 0, pct: 0 };
  totMot = { ops: 0, monto: 0, meta: 0, pct: 0 };

  private metas: Record<string, number> = {};

  private readonly coloresSede: Record<string, string> = {
    motupe: '#1565C0', olmos: '#00695C', ferrenafe: '#6A1B9A', jayanca: '#E65100',
    mochumi: '#2E7D32', morrope: '#AD1457', lambayeque: '#283593', oyotun: '#558B2F',
    cayalti: '#00838F', chongoyape: '#4E342E',
  };

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({ anio: [2026], mes: [0] });
  }

  async ngOnInit() { await this.cargar(); }

  async cargar(): Promise<void> {
    this.isLoading = true;
    try {
      const { anio, mes } = this.form.value;
      const [rows, metas] = await Promise.all([
        lastValueFrom(this.ventas.obtenerAvanceSedes(anio, mes || undefined)),
        lastValueFrom(this.ventas.obtenerMetasAvance()),
      ]);
      this.metas = metas || {};
      this.construir(rows || []);
    } catch (e) {
      console.error('Error al cargar Avance de Metas:', e);
      this.general = []; this.motos = [];
    } finally {
      this.isLoading = false;
    }
  }

  private color(norm: string): string { return this.coloresSede[norm] || '#1A5FAD'; }
  /** El campo `sede` de ventas viene como "SEDE RELENOR <NOMBRE>"; se normaliza y se le
   *  quita ese prefijo para matchear el config/color/meta (ej. → "lambayeque"). */
  private normSede(s: string): string { return this.sedeConfig.normalizar(s).replace(/^sederelenor/, ''); }

  private construir(rows: { sede: string; clase: string; es_moto: boolean; neto: number; ops: number }[]): void {
    const gen = new Map<string, FilaGeneral>();
    const mot = new Map<string, FilaMotos>();
    const nombre = (norm: string) => this.sedeConfig.getConfig(norm)?.nombre ?? norm;

    for (const r of rows) {
      const norm = this.normSede(r.sede);
      // Solo sedes físicas del config (excluye Realzza store, incautados, oficina principal, etc.).
      if (!norm || !this.sedeConfig.getConfig(norm)) continue;
      if (r.es_moto) {
        let f = mot.get(norm);
        if (!f) { f = { sede: nombre(norm), sedeNorm: norm, color: this.color(norm), propioOps: 0, propioMonto: 0, aliadoOps: 0, aliadoMonto: 0, totalOps: 0, totalMonto: 0, meta: this.metas['motos:' + norm] || 0, pct: 0 }; mot.set(norm, f); }
        if (r.clase === 'PROPIO') { f.propioOps += r.ops; f.propioMonto += r.neto; }
        else { f.aliadoOps += r.ops; f.aliadoMonto += r.neto; }
      } else {
        let f = gen.get(norm);
        if (!f) { f = { sede: nombre(norm), sedeNorm: norm, color: this.color(norm), propio: 0, aliado: 0, total: 0, meta: this.metas['general:' + norm] || 0, pct: 0 }; gen.set(norm, f); }
        if (r.clase === 'PROPIO') f.propio += r.neto; else f.aliado += r.neto;
      }
    }

    this.general = [...gen.values()].map(f => { f.total = f.propio + f.aliado; f.pct = f.meta > 0 ? Math.round((f.total / f.meta) * 100) : 0; return f; })
      .sort((a, b) => b.total - a.total);
    this.motos = [...mot.values()].map(f => { f.totalOps = f.propioOps + f.aliadoOps; f.totalMonto = f.propioMonto + f.aliadoMonto; f.pct = f.meta > 0 ? Math.round((f.totalMonto / f.meta) * 100) : 0; return f; })
      .sort((a, b) => b.totalMonto - a.totalMonto);

    this.recalcTotales();
  }

  private recalcTotales(): void {
    this.totGen = this.general.reduce((s, f) => ({ propio: s.propio + f.propio, aliado: s.aliado + f.aliado, total: s.total + f.total, meta: s.meta + f.meta, pct: 0 }), { propio: 0, aliado: 0, total: 0, meta: 0, pct: 0 });
    this.totGen.pct = this.totGen.meta > 0 ? Math.round((this.totGen.total / this.totGen.meta) * 100) : 0;
    this.totMot = this.motos.reduce((s, f) => ({ ops: s.ops + f.totalOps, monto: s.monto + f.totalMonto, meta: s.meta + f.meta, pct: 0 }), { ops: 0, monto: 0, meta: 0, pct: 0 });
    this.totMot.pct = this.totMot.meta > 0 ? Math.round((this.totMot.monto / this.totMot.meta) * 100) : 0;
  }

  // ── Edición de meta en la propia tabla ──
  onMetaGeneral(f: FilaGeneral, valor: any): void {
    f.meta = Number(valor) || 0;
    f.pct = f.meta > 0 ? Math.round((f.total / f.meta) * 100) : 0;
    this.recalcTotales();
    this.ventas.guardarMetaAvance('general:' + f.sedeNorm, f.meta).subscribe({ error: () => {} });
  }
  onMetaMotos(f: FilaMotos, valor: any): void {
    f.meta = Number(valor) || 0;
    f.pct = f.meta > 0 ? Math.round((f.totalMonto / f.meta) * 100) : 0;
    this.recalcTotales();
    this.ventas.guardarMetaAvance('motos:' + f.sedeNorm, f.meta).subscribe({ error: () => {} });
  }

  soles(n: number): string { return 'S/ ' + Math.round(n || 0).toLocaleString('es-PE'); }
  claseAvance(pct: number): string { return pct >= 100 ? 'ok' : pct >= 70 ? 'warn' : 'low'; }
}
