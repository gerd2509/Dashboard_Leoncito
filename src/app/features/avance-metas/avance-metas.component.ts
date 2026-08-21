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

  // Realzza por fuente generadora (tipo_base) + sedes por fuente (derivación).
  realzza: { fuente: string; meta: number; neto: number; pct: number }[] = [];
  totRz = { meta: 0, neto: 0, pct: 0 };
  sedesFuente: { sede: string; sedeNorm: string; color: string; cuotaTotal: number; total: number; pct: number; fuentes: { fuente: string; neto: number; cuota: number; pct: number }[] }[] = [];

  // Por vendedor (nivel de madurez editable + meta + avance leoncito/aliados), por sede.
  vendedores: { sede: string; sedeNorm: string; color: string; filas: { vendedor: string; redes: number; trad: number; meta: number; leoncito: number; aliados: number; total: number; pct: number }[] }[] = [];

  private metas: Record<string, number> = {};
  private rzRows: any[] = [];                            // filas del /ventas-realzza/modulo (para vendedor CALL)
  private sedeNetoTotal: Record<string, number> = {};   // neto REAL por sede (créditos + motos, del endpoint con netting)
  private rzSinTipo = 0;                                 // neto de las NC "sin tipo" de Realzza (no se muestra, pero suma al total)
  private readonly SEDES_FUENTE = ['lambayeque', 'ferrenafe'];   // sedes con derivación/atribución
  private readonly SEDES_MOSTRAR = ['realzza', 'lambayeque', 'ferrenafe'];  // Créditos/Motos: Realzza + estas 2

  private readonly coloresSede: Record<string, string> = {
    motupe: '#1565C0', olmos: '#00695C', ferrenafe: '#6A1B9A', jayanca: '#E65100',
    mochumi: '#2E7D32', morrope: '#AD1457', lambayeque: '#283593', oyotun: '#558B2F',
    cayalti: '#00838F', chongoyape: '#4E342E', realzza: '#455A64',
  };

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({ anio: [2026], mes: [0] });
  }

  async ngOnInit() { await this.cargar(); }

  async cargar(): Promise<void> {
    this.isLoading = true;
    const { anio, mes } = this.form.value;
    // 1) Créditos + Motos por sede (endpoint con netting)
    try {
      const [rows, metas] = await Promise.all([
        lastValueFrom(this.ventas.obtenerAvanceSedes(anio, mes || undefined)),
        lastValueFrom(this.ventas.obtenerMetasAvance()),
      ]);
      this.metas = metas || {};
      this.construir(rows || []);
    } catch (e) { console.error('Error avance sedes:', e); this.general = []; this.motos = []; }
    // 2) Realzza por tipo_base (neto vs meta_tipo_base)
    try {
      const [rz, metasTb] = await Promise.all([
        lastValueFrom(this.ventas.obtenerVentasRealzzaModulo(anio)),
        lastValueFrom(this.ventas.getMetaTipoBaseAnio(anio)),
      ]);
      this.rzRows = rz || [];
      this.construirRealzza(rz || [], metasTb || [], anio, mes);
    } catch (e) { console.error('Error realzza:', e); this.realzza = []; }
    // 3) Sedes por fuente generadora (atribución por derivación; Lambayeque + Ferreñafe)
    try {
      const porSede = await Promise.all(this.SEDES_FUENTE.map(s =>
        lastValueFrom(this.ventas.listarAtribucionSede(s, anio, mes || undefined)).catch(() => [] as any[])));
      this.construirSedesFuente(porSede, anio, mes);
    } catch (e) { console.error('Error sedes fuente:', e); this.sedesFuente = []; }
    // 4) Por vendedor (Realzza / Lambayeque / Ferreñafe)
    try {
      const vr = await lastValueFrom(this.ventas.obtenerAvanceVendedor(anio, mes || undefined));
      this.construirVendedores(vr || [], anio, mes);
    } catch (e) { console.error('Error vendedores:', e); this.vendedores = []; }
    this.isLoading = false;
  }

  private filasVendedor(vm: Map<string, { leoncito: number; aliados: number }>, norm: string) {
    return [...vm.entries()].map(([vendedor, o]) => {
      const meta = this.metas['metavend:' + norm + ':' + vendedor] || 0;
      const total = o.leoncito + o.aliados;
      return {
        vendedor, redes: this.metas['madredes:' + norm + ':' + vendedor] || 0, trad: this.metas['madtrad:' + norm + ':' + vendedor] || 0,
        meta, leoncito: o.leoncito, aliados: o.aliados, total, pct: meta > 0 ? Math.round((total / meta) * 100) : 0,
      };
    }).sort((a, b) => b.total - a.total);
  }

  // Realzza: misma lógica de Ventas Realzza → CALL (tipo_base='CALL') y "SIN DERIVACIÓN" son
  // vendedores propios; el resto va al asesor. Neto con netting (bruto − NC arrastradas).
  private buildVendedoresRealzza(rows: any[], anio: number, mes: number) {
    const bruto = new Map<string, number>(), nc = new Map<string, number>();
    for (const r of rows) {
      const tb = (r.tipo_base || '').toString().trim().toUpperCase();
      const esCall = tb === 'CALL';
      const esSinDeriv = !!r.sin_derivacion && !esCall && !r.extranjero && !r.asesor_manual;
      const vend = esCall ? 'CALL' : (esSinDeriv ? 'SIN DERIVACIÓN' : (r.vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase());
      const clase = (r.entidad || '').toString().trim().toUpperCase() === 'LEONCITO' ? 'PROPIO' : 'ALIADO';
      const key = vend + '|' + clase;
      const e = (r.estado_venta || '').toString().toUpperCase();
      const monto = Number(r.monto_consolidado) || 0;
      const acv = Number(r.anio_cv), mcv = Number(r.mes_cv), aaf = Number(r.anio_af), maf = Number(r.mes_af);
      if (!/NOTA DE/.test(e) && !/INCAUTAC/.test(e)) {
        if (monto > 0 && acv === anio && (!mes || mcv === mes)) bruto.set(key, (bruto.get(key) || 0) + monto);
      } else if (/NOTA DE/.test(e)) {
        if ((acv !== aaf || mcv !== maf) && aaf === anio && (!mes || maf === mes)) nc.set(key, (nc.get(key) || 0) + monto);
      }
    }
    const vm = new Map<string, { leoncito: number; aliados: number }>();
    new Set([...bruto.keys(), ...nc.keys()]).forEach(key => {
      const [vend, clase] = key.split('|');
      const neto = Math.round((bruto.get(key) || 0) - (nc.get(key) || 0));
      if (!vm.has(vend)) vm.set(vend, { leoncito: 0, aliados: 0 });
      const o = vm.get(vend)!;
      if (clase === 'PROPIO') o.leoncito += neto; else o.aliados += neto;
    });
    const filas = this.filasVendedor(vm, 'realzza');
    return filas.length ? { sede: 'Realzza', sedeNorm: 'realzza', color: this.color('realzza'), filas } : null;
  }

  private construirVendedores(vr: { sede: string; vendedor: string; clase: string; neto: number }[], anio: number, mes: number): void {
    const out: any[] = [];
    // Realzza: por el módulo (con lógica CALL / sin derivación).
    const rzSec = this.buildVendedoresRealzza(this.rzRows, anio, mes);
    if (rzSec) out.push(rzSec);
    // Lambayeque + Ferreñafe: del endpoint /avance-vendedor (ya neto).
    const bySede = new Map<string, Map<string, { leoncito: number; aliados: number }>>();
    for (const r of vr) {
      let norm = this.normSede(r.sede);
      if (norm.includes('realzza')) continue;   // Realzza va por el módulo
      if (norm !== 'lambayeque' && norm !== 'ferrenafe') continue;
      if (!bySede.has(norm)) bySede.set(norm, new Map());
      const vm = bySede.get(norm)!;
      const v = (r.vendedor || '').trim(); if (!v) continue;
      if (!vm.has(v)) vm.set(v, { leoncito: 0, aliados: 0 });
      const o = vm.get(v)!;
      if (r.clase === 'PROPIO') o.leoncito += r.neto; else o.aliados += r.neto;
    }
    for (const norm of ['lambayeque', 'ferrenafe']) {
      const vm = bySede.get(norm); if (!vm) continue;
      const filas = this.filasVendedor(vm, norm);
      if (filas.length) out.push({ sede: this.sedeConfig.getConfig(norm)?.nombre ?? norm, sedeNorm: norm, color: this.color(norm), filas });
    }
    this.vendedores = out;
  }

  onMadurez(norm: string, fila: { vendedor: string; redes: number; trad: number }, tipo: 'redes' | 'trad', valor: any): void {
    const v = Math.max(0, Math.min(10, Number(valor) || 0));   // escala 1..10
    if (tipo === 'redes') fila.redes = v; else fila.trad = v;
    this.ventas.guardarMetaAvance((tipo === 'redes' ? 'madredes:' : 'madtrad:') + norm + ':' + fila.vendedor, v).subscribe({ error: () => {} });
  }
  onMetaVendedor(norm: string, fila: { vendedor: string; meta: number; total: number; pct: number }, valor: any): void {
    fila.meta = Number(valor) || 0;
    fila.pct = fila.meta > 0 ? Math.round((fila.total / fila.meta) * 100) : 0;
    this.ventas.guardarMetaAvance('metavend:' + norm + ':' + fila.vendedor, fila.meta).subscribe({ error: () => {} });
  }

  private esNC(e: any): boolean { return /NOTA DE/.test((e || '').toString().toUpperCase()); }
  private esINC(e: any): boolean { return /INCAUTAC/.test((e || '').toString().toUpperCase()); }

  /** Neto por clave: bruto (no NC/INC, positivo) − NC arrastradas − INC arrastradas, del año/mes. */
  private netoPorClave(rows: any[], clave: (r: any) => string, anio: number, mes: number, conInc = true): Map<string, { neto: number; ops: number }> {
    const bruto = new Map<string, { m: number; o: number }>(); const rest = new Map<string, number>();
    for (const r of rows) {
      const e = (r.estado_venta || '').toString().toUpperCase();
      const monto = Number(r.monto_consolidado) || 0;
      const k = (clave(r) || 'SIN DATO').toString().trim() || 'SIN DATO';
      const acv = Number(r.anio_cv), mcv = Number(r.mes_cv), aaf = Number(r.anio_af), maf = Number(r.mes_af);
      if (!this.esNC(e) && !this.esINC(e)) {
        if (monto > 0 && acv === anio && (!mes || mcv === mes)) { const b = bruto.get(k) || { m: 0, o: 0 }; b.m += monto; b.o += 1; bruto.set(k, b); }
      } else if (this.esNC(e) || (conInc && this.esINC(e))) {
        const arrastrada = (acv !== aaf || mcv !== maf);
        if (arrastrada && aaf === anio && (!mes || maf === mes)) rest.set(k, (rest.get(k) || 0) + monto);
      }
    }
    const out = new Map<string, { neto: number; ops: number }>();
    new Set([...bruto.keys(), ...rest.keys()]).forEach(k => {
      const b = bruto.get(k) || { m: 0, o: 0 };
      out.set(k, { neto: Math.round(b.m - (rest.get(k) || 0)), ops: b.o });
    });
    return out;
  }

  private construirRealzza(rows: any[], metasTb: any[], anio: number, mes: number): void {
    const metaMap = new Map<string, number>();
    for (const m of metasTb) {
      if (mes && Number(m.mes) !== mes) continue;
      const k = (m.tipo_base || '').toString().trim().toUpperCase();
      if (k) metaMap.set(k, (metaMap.get(k) || 0) + (Number(m.meta) || 0));
    }
    const netos = this.netoPorClave(rows, r => (r.tipo_base || 'SIN TIPO').toString().trim().toUpperCase(), anio, mes, false);
    // Las NC "sin tipo" NO se muestran pero SÍ restan del total (neto real).
    this.rzSinTipo = netos.get('SIN TIPO')?.neto || 0;
    this.realzza = [...new Set([...netos.keys(), ...metaMap.keys()])]
      .filter(k => k && k !== 'SIN TIPO')   // NC / sin tipo no se muestra
      .map(k => {
        const neto = netos.get(k)?.neto || 0;
        // Meta editable manual (metas_avance 'realzza:<tipo_base>') con default del maestro meta_tipo_base.
        const meta = this.metas['realzza:' + k] ?? metaMap.get(k) ?? 0;
        return { fuente: k, meta, neto, pct: meta > 0 ? Math.round((neto / meta) * 100) : 0 };
      }).filter(f => f.neto !== 0 || f.meta > 0).sort((a, b) => b.neto - a.neto);
    this.recalcRz();
  }

  private recalcRz(): void {
    const meta = this.realzza.reduce((s, f) => s + f.meta, 0);
    const neto = this.realzza.reduce((s, f) => s + f.neto, 0) + this.rzSinTipo;   // + NC sin tipo
    this.totRz = { meta, neto, pct: meta > 0 ? Math.round((neto / meta) * 100) : 0 };
  }
  onMetaRealzza(f: { fuente: string; meta: number; neto: number; pct: number }, valor: any): void {
    f.meta = Number(valor) || 0;
    f.pct = f.meta > 0 ? Math.round((f.neto / f.meta) * 100) : 0;
    this.recalcRz();
    this.ventas.guardarMetaAvance('realzza:' + f.fuente, f.meta).subscribe({ error: () => {} });
  }

  private construirSedesFuente(porSede: any[][], anio: number, mes: number): void {
    const out: any[] = [];
    this.SEDES_FUENTE.forEach((norm, i) => {
      // El endpoint /ventas-sedes/atribucion da la fuente resuelta en `fuente` pero el monto es
      // BRUTO (sin restar NC/incaut.). El neto REAL de la sede lo tenemos de /avance-sedes
      // (créditos + motos, con netting). Se toma ese neto como total y se ESCALA el desglose por
      // fuente proporcionalmente → el total cuadra exacto y las proporciones se conservan.
      const brutos = this.netoPorClave(porSede[i] || [], r => (r.fuente || r.atrib_fuente_sede || 'SIN FUENTE').toString().trim().toUpperCase() || 'SIN FUENTE', anio, mes);
      const fuentesBruto = [...brutos.entries()].map(([fuente, v]) => ({ fuente, bruto: v.neto })).filter(f => f.bruto > 0);
      const brutoTotal = fuentesBruto.reduce((s, f) => s + f.bruto, 0);
      const total = Math.round(this.sedeNetoTotal[norm] || 0);   // neto real (créditos + motos)
      const factor = brutoTotal > 0 ? total / brutoTotal : 0;
      // Cuota EDITABLE por cada fuente (clave 'fuente:<sede>:<fuente>'). El total de sede = suma.
      const fuentes = fuentesBruto.map(f => {
        const neto = Math.round(f.bruto * factor);
        const cuota = this.metas['fuente:' + norm + ':' + f.fuente] || 0;
        return { fuente: f.fuente, neto, cuota, pct: cuota > 0 ? Math.round((neto / cuota) * 100) : 0 };
      }).sort((a, b) => b.neto - a.neto);
      const cuotaTotal = fuentes.reduce((s, f) => s + f.cuota, 0);
      out.push({ sede: this.sedeConfig.getConfig(norm)?.nombre ?? norm, sedeNorm: norm, color: this.color(norm), cuotaTotal, total, pct: cuotaTotal > 0 ? Math.round((total / cuotaTotal) * 100) : 0, fuentes });
    });
    this.sedesFuente = out.filter(s => s.fuentes.length);
  }
  onMetaFuenteTipo(s: { sedeNorm: string; total: number; cuotaTotal: number; pct: number; fuentes: { neto: number; cuota: number; pct: number }[] }, f: { fuente: string; neto: number; cuota: number; pct: number }, valor: any): void {
    f.cuota = Number(valor) || 0;
    f.pct = f.cuota > 0 ? Math.round((f.neto / f.cuota) * 100) : 0;
    s.cuotaTotal = s.fuentes.reduce((a, x) => a + x.cuota, 0);
    s.pct = s.cuotaTotal > 0 ? Math.round((s.total / s.cuotaTotal) * 100) : 0;
    this.ventas.guardarMetaAvance('fuente:' + s.sedeNorm + ':' + f.fuente, f.cuota).subscribe({ error: () => {} });
  }

  private color(norm: string): string { return this.coloresSede[norm] || '#1A5FAD'; }
  /** El campo `sede` de ventas viene como "SEDE RELENOR <NOMBRE>"; se normaliza y se le
   *  quita ese prefijo para matchear el config/color/meta (ej. → "lambayeque"). */
  private normSede(s: string): string { return this.sedeConfig.normalizar(s).replace(/^sederelenor/, ''); }

  private construir(rows: { sede: string; clase: string; es_moto: boolean; neto: number; ops: number }[]): void {
    const gen = new Map<string, FilaGeneral>();
    const mot = new Map<string, FilaMotos>();
    const nombre = (norm: string) => norm === 'realzza' ? 'Realzza' : (this.sedeConfig.getConfig(norm)?.nombre ?? norm);
    this.sedeNetoTotal = {};

    for (const r of rows) {
      let norm = this.normSede(r.sede);
      if (norm.includes('realzza')) norm = 'realzza';   // "SEDE REALZZA STORE" → Realzza
      // Neto REAL por sede (créditos + motos) para cuadrar el cuadro de fuente.
      if (norm) this.sedeNetoTotal[norm] = (this.sedeNetoTotal[norm] || 0) + (Number(r.neto) || 0);
      // Por ahora solo Realzza, Lambayeque y Ferreñafe (SEDES_MOSTRAR).
      if (!norm || !this.SEDES_MOSTRAR.includes(norm)) continue;
      // Créditos = TODOS los productos (créditos + motos) por ENTIDAD:
      //   propio = LEONCITO ; aliado = GLOBAL GO / BRILLA / EFECTIVA / etc. (≠ LEONCITO).
      let g = gen.get(norm);
      if (!g) { g = { sede: nombre(norm), sedeNorm: norm, color: this.color(norm), propio: 0, aliado: 0, total: 0, meta: this.metas['general:' + norm] || 0, pct: 0 }; gen.set(norm, g); }
      if (r.clase === 'PROPIO') g.propio += r.neto; else g.aliado += r.neto;
      // Motos = subconjunto (solo productos moto), mismo split por entidad.
      if (r.es_moto) {
        let f = mot.get(norm);
        if (!f) { f = { sede: nombre(norm), sedeNorm: norm, color: this.color(norm), propioOps: 0, propioMonto: 0, aliadoOps: 0, aliadoMonto: 0, totalOps: 0, totalMonto: 0, meta: this.metas['motos:' + norm] || 0, pct: 0 }; mot.set(norm, f); }
        if (r.clase === 'PROPIO') { f.propioOps += r.ops; f.propioMonto += r.neto; }
        else { f.aliadoOps += r.ops; f.aliadoMonto += r.neto; }
      }
    }

    this.general = [...gen.values()].map(f => { f.total = f.propio + f.aliado; f.pct = f.meta > 0 ? Math.round((f.total / f.meta) * 100) : 0; return f; })
      .sort((a, b) => b.total - a.total);
    // Motos: la META es en # de OPERACIONES → el % avance se calcula sobre total de operaciones.
    this.motos = [...mot.values()].map(f => { f.totalOps = f.propioOps + f.aliadoOps; f.totalMonto = f.propioMonto + f.aliadoMonto; f.pct = f.meta > 0 ? Math.round((f.totalOps / f.meta) * 100) : 0; return f; })
      .sort((a, b) => b.totalMonto - a.totalMonto);

    this.recalcTotales();
  }

  private recalcTotales(): void {
    this.totGen = this.general.reduce((s, f) => ({ propio: s.propio + f.propio, aliado: s.aliado + f.aliado, total: s.total + f.total, meta: s.meta + f.meta, pct: 0 }), { propio: 0, aliado: 0, total: 0, meta: 0, pct: 0 });
    this.totGen.pct = this.totGen.meta > 0 ? Math.round((this.totGen.total / this.totGen.meta) * 100) : 0;
    this.totMot = this.motos.reduce((s, f) => ({ ops: s.ops + f.totalOps, monto: s.monto + f.totalMonto, meta: s.meta + f.meta, pct: 0 }), { ops: 0, monto: 0, meta: 0, pct: 0 });
    this.totMot.pct = this.totMot.meta > 0 ? Math.round((this.totMot.ops / this.totMot.meta) * 100) : 0;   // % sobre # operaciones
  }

  // ── Edición de meta en la propia tabla ──
  onMetaGeneral(f: FilaGeneral, valor: any): void {
    f.meta = Number(valor) || 0;
    f.pct = f.meta > 0 ? Math.round((f.total / f.meta) * 100) : 0;
    this.recalcTotales();
    this.ventas.guardarMetaAvance('general:' + f.sedeNorm, f.meta).subscribe({ error: () => {} });
  }
  onMetaMotos(f: FilaMotos, valor: any): void {
    f.meta = Number(valor) || 0;   // meta en # de operaciones
    f.pct = f.meta > 0 ? Math.round((f.totalOps / f.meta) * 100) : 0;
    this.recalcTotales();
    this.ventas.guardarMetaAvance('motos:' + f.sedeNorm, f.meta).subscribe({ error: () => {} });
  }

  soles(n: number): string { return 'S/ ' + Math.round(n || 0).toLocaleString('es-PE'); }
  claseAvance(pct: number): string { return pct >= 100 ? 'ok' : pct >= 70 ? 'warn' : 'low'; }
}
