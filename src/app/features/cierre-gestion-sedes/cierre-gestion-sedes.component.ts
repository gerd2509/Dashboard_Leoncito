import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DxDataGridComponent } from 'devextreme-angular';
import { ExcelExportService } from '../../services/excel/excel.service';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

interface ResumenSede {
  key: string; nombre: string; color: string;
  llamadas: number; cartas: number; contacto: number; gestiones: number;
  marketplace: number; derivaciones: number;
}

@Component({
  selector: 'app-cierre-gestion-sedes',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './cierre-gestion-sedes.component.html',
  styleUrl: './cierre-gestion-sedes.component.css'
})
export class CierreGestionSedesComponent implements OnInit {
  protected service      = inject(SheetsService);
  protected excelService = inject(ExcelExportService);
  protected auth         = inject(AuthService);
  protected sedeConfig   = inject(SedeConfigService);

  form: UntypedFormGroup;
  isLoading = false;

  // Combo de sede: admin ve "Todas" + todas las sedes; usuario de sede queda fijo a la suya.
  sedesDisponibles: { key: string; nombre: string }[] = [];
  bloquearSede = false;
  esAdmin = false;

  // Datos crudos (del rango) y filtrados por sede seleccionada.
  private rawGestion:  any[] = [];
  private rawMarket:   any[] = [];
  private rawDeriv:    any[] = [];
  llamadasCartas: any[] = [];
  market:         any[] = [];
  derivaciones:   any[] = [];

  // KPIs de la sede/vista actual.
  kpi = { llamadas: 0, cartas: 0, contacto: 0, gestiones: 0, contactabilidad: 0, marketplace: 0, derivaciones: 0 };
  // Resumen por sede (solo cuando se ve "Todas").
  resumenSedes: ResumenSede[] = [];

  @ViewChild('gridLC') gridLC!: DxDataGridComponent;
  @ViewChild('gridMP') gridMP!: DxDataGridComponent;
  @ViewChild('gridDV') gridDV!: DxDataGridComponent;

  private readonly coloresSede: Record<string, string> = {
    motupe: '#1565C0', olmos: '#00695C', ferrenafe: '#6A1B9A', jayanca: '#E65100',
    mochumi: '#2E7D32', morrope: '#AD1457', lambayeque: '#283593', oyotun: '#558B2F',
    cayalti: '#00838F', chongoyape: '#4E342E',
  };

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.form = this.fb.group({
      sede:        ['todas'],
      fechaInicio: [ini],
      fechaFin:    [hoy],
    });
  }

  async ngOnInit() {
    const u = this.auth.getUsuario();
    this.esAdmin = !u || u.rol === 'admin' || (u.sede || '').toLowerCase() === 'todas';

    if (this.esAdmin) {
      this.sedesDisponibles = [{ key: 'todas', nombre: 'Todas las sedes' }, ...this.sedeConfig.getSedesParaCombo()];
      this.form.patchValue({ sede: 'todas' });
    } else {
      const cfg = this.sedeConfig.getConfig(u!.sede);
      const key = this.sedeConfig.normalizar(u!.sede);
      this.sedesDisponibles = cfg ? [{ key, nombre: cfg.nombre }] : [];
      this.bloquearSede = true;
      this.form.patchValue({ sede: key });
    }

    await this.cargar();
  }

  // ── Título dinámico: "Cierre Gestión Sedes" / "Cierre Gestión Lambayeque" ──
  get titulo(): string {
    const sede = this.form.value.sede;
    if (!sede || sede === 'todas') return 'Cierre Gestión Sedes';
    const cfg = this.sedeConfig.getConfig(sede);
    return `Cierre Gestión ${cfg?.nombre ?? sede}`;
  }
  get colorActual(): string {
    const sede = this.form.value.sede;
    if (!sede || sede === 'todas') return '#1A5FAD';
    return this.coloresSede[this.sedeConfig.normalizar(sede)] || '#1A5FAD';
  }
  colorSede(key: string): string { return this.coloresSede[key] || '#1A5FAD'; }

  private rango() {
    const { fechaInicio, fechaFin } = this.form.value;
    return { desde: fechaInicio ? new Date(fechaInicio) : undefined, hasta: fechaFin ? new Date(fechaFin) : undefined };
  }

  async cargar(): Promise<void> {
    this.isLoading = true;
    try {
      const r = this.rango();
      const [g, m, d] = await Promise.all([
        lastValueFrom(this.service.getGestionSedesDB(r)),
        lastValueFrom(this.service.getCallSedesDB(r)),
        lastValueFrom(this.service.getDerivacionesDB(r)),
      ]);
      this.rawGestion = g || [];
      this.rawMarket  = m || [];
      this.rawDeriv   = d || [];
      this.aplicar();
    } catch (e) {
      console.error('Error al cargar Cierre Gestión Sedes:', e);
      this.rawGestion = this.rawMarket = this.rawDeriv = [];
      this.aplicar();
    } finally {
      this.isLoading = false;
    }
  }

  onSedeChanged(): void { this.aplicar(); }

  private esContacto(resultado: any): boolean {
    const r = (resultado || '').toString().toUpperCase();
    return r.includes('CONTACTO') && !r.includes('NO CONTACTO');
  }
  private esLlamada(tipo: any): boolean { return (tipo || '').toString().toUpperCase().includes('LLAMADA'); }
  private esCarta(tipo: any):   boolean { return (tipo || '').toString().toUpperCase().includes('CARTA'); }

  private aplicar(): void {
    const sedeKey = this.form.value.sede;
    const todas = !sedeKey || sedeKey === 'todas';

    const filtra = (rows: any[], campo: string) =>
      todas ? rows : rows.filter(r => this.sedeConfig.normalizar(r[campo]) === sedeKey);

    this.llamadasCartas = filtra(this.rawGestion, 'TIENDA SEDE');
    this.market         = filtra(this.rawMarket,  'SEDE');
    this.derivaciones   = filtra(this.rawDeriv,   'sede');

    // KPIs de la vista actual.
    const llam = this.llamadasCartas.filter(r => this.esLlamada(r['TIPO DE GESTION'])).length;
    const cart = this.llamadasCartas.filter(r => this.esCarta(r['TIPO DE GESTION'])).length;
    const cont = this.llamadasCartas.filter(r => this.esContacto(r['RESULTADO DE GESTION'])).length;
    const tot  = this.llamadasCartas.length;
    this.kpi = {
      llamadas: llam, cartas: cart, contacto: cont, gestiones: tot,
      contactabilidad: tot ? Math.round((cont / tot) * 100) : 0,
      marketplace: this.market.length, derivaciones: this.derivaciones.length,
    };

    // Resumen coloreado por sede (solo en la vista "Todas").
    this.resumenSedes = todas ? this.construirResumen() : [];
  }

  private construirResumen(): ResumenSede[] {
    const norm = (s: any) => this.sedeConfig.normalizar(s);
    const map = new Map<string, ResumenSede>();
    const get = (key: string): ResumenSede => {
      if (!map.has(key)) {
        const cfg = this.sedeConfig.getConfig(key);
        map.set(key, {
          key, nombre: cfg?.nombre ?? key, color: this.colorSede(key),
          llamadas: 0, cartas: 0, contacto: 0, gestiones: 0, marketplace: 0, derivaciones: 0,
        });
      }
      return map.get(key)!;
    };
    for (const r of this.rawGestion) {
      const s = get(norm(r['TIENDA SEDE'])); s.gestiones++;
      if (this.esLlamada(r['TIPO DE GESTION'])) s.llamadas++;
      if (this.esCarta(r['TIPO DE GESTION']))   s.cartas++;
      if (this.esContacto(r['RESULTADO DE GESTION'])) s.contacto++;
    }
    for (const r of this.rawMarket) get(norm(r['SEDE'])).marketplace++;
    for (const r of this.rawDeriv)  get(norm(r['sede'])).derivaciones++;
    return [...map.values()]
      .filter(s => s.key && (s.gestiones || s.marketplace || s.derivaciones))
      .sort((a, b) => (b.gestiones + b.marketplace + b.derivaciones) - (a.gestiones + a.marketplace + a.derivaciones));
  }

  contactabilidadSede(s: ResumenSede): number {
    return s.gestiones ? Math.round((s.contacto / s.gestiones) * 100) : 0;
  }

  // Al hacer clic en una tarjeta de sede del resumen → filtra a esa sede.
  verSede(key: string): void {
    this.form.patchValue({ sede: key });
    this.aplicar();
  }

  exportarLC(): void { if (this.gridLC) this.excelService.exportarDesdeGrid('llamadas-cartas', this.gridLC); }
  exportarMP(): void { if (this.gridMP) this.excelService.exportarDesdeGrid('market-place', this.gridMP); }
  exportarDV(): void { if (this.gridDV) this.excelService.exportarDesdeGrid('derivaciones', this.gridDV); }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding         = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color           = 'white';
      e.cellElement.style.textAlign       = 'center';
      e.cellElement.style.fontWeight      = 'bold';
      e.cellElement.style.whiteSpace      = 'normal';
      e.cellElement.style.height          = 'auto';
    }
  }
}
