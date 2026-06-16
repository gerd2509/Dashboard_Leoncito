import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../../services/service-google.service';
import { AuthService } from '../../../services/auth.service';
import { SedeConfigService } from '../../../services/sede-config.service';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DxDataGridComponent } from 'devextreme-angular';
import { ExcelExportService } from '../../../services/excel/excel.service';

@Component({
  selector: 'app-gestion-call-sedes',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-call-sedes.component.html',
  styleUrl: './gestion-call-sedes.component.css'
})
export class GestionCallSedesComponent implements OnInit {
  private service      = inject(SheetsService);
  private excelService = inject(ExcelExportService);
  private auth         = inject(AuthService);
  private sedeCfg      = inject(SedeConfigService);

  formGestion: UntypedFormGroup;
  dataFiltrada: any[] = [];
  listData:     any[] = [];

  protected showFilterRow = true;
  protected currentFilter = 'auto';

  isLoading = false;

  // ── Sede (mismo criterio que control-call-sedes: perfil del login) ──
  esAdmin = false;
  sedesDisponibles: { key: string; nombre: string }[] = [];
  sedeKey = 'ferrenafe';

  // Asesores disponibles (registrados en la data de gestión de la sede)
  asesores: string[] = [];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      sede:        ['ferrenafe'],
      asesor:      [''],
      fechaInicio: [null],
      fechaFin:    [null],
    });
  }

  async ngOnInit() {
    this.configurarSedeSegunUsuario();
    await this.cargarData();
  }

  // admin / sede 'todas' → selector; usuario de sede → fijo a su sede
  private configurarSedeSegunUsuario() {
    const u = this.auth.getUsuario();
    this.esAdmin = !u || u.rol === 'admin' || this.sedeCfg.normalizar(u.sede) === 'todas';

    if (this.esAdmin) {
      this.sedesDisponibles = this.sedeCfg.getSedesCall();
      this.sedeKey = this.sedesDisponibles[0]?.key ?? 'ferrenafe';
    } else {
      this.sedeKey = this.sedeCfg.normalizar(u!.sede);
      const cfg = this.sedeCfg.getConfig(u!.sede);
      this.sedesDisponibles = [{ key: this.sedeKey, nombre: cfg?.nombre ?? u!.sede }];
    }
    this.formGestion.patchValue({ sede: this.sedeKey }, { emitEvent: false });
  }

  get sedeNombre(): string {
    return this.sedeCfg.getConfig(this.sedeKey)?.nombre ?? this.sedeKey;
  }

  // Columna del asesor en el form por sede: 'ASESOR FERREÑAFE' / 'ASESOR MOTUPE'
  get columnaAsesor(): string {
    const cfg = this.sedeCfg.getConfig(this.sedeKey);
    return cfg ? `ASESOR ${cfg.valorSede.toUpperCase()}` : 'ASESOR';
  }

  // Filas que pertenecen a la sede seleccionada (su columna de asesor tiene valor)
  private filasDeSede(): any[] {
    const col = this.columnaAsesor;
    return this.listData.filter(r => (r[col] ?? '').toString().trim() !== '');
  }

  // Lista de asesores disponibles = distintos de la columna de asesor en la data de la sede
  private actualizarAsesoresDisponibles(): void {
    const col = this.columnaAsesor;
    this.asesores = Array.from(
      new Set(this.filasDeSede().map(r => (r[col] ?? '').toString().trim()))
    ).filter(a => a).sort();
  }

  onSedeChange(e: any) {
    const key = e?.value ?? this.formGestion.value.sede;
    if (!key || key === this.sedeKey) return;
    this.sedeKey = key;
    this.formGestion.patchValue({ asesor: '' }, { emitEvent: false });
    this.actualizarAsesoresDisponibles();
    this.aplicarFiltros();
  }

  private async cargarData(): Promise<void> {
    this.isLoading = true;
    try {
      // Formulario de gestión de sedes Call (/ferre)
      this.listData = await lastValueFrom(this.service.getSheetDataFerre());
      this.actualizarAsesoresDisponibles();
      this.aplicarFiltros();
    } catch (e) {
      console.error('Error al cargar datos de gestión de sedes:', e);
      this.listData = [];
      this.dataFiltrada = [];
      this.asesores = [];
    } finally {
      this.isLoading = false;
    }
  }

  aplicarFiltros(): void {
    const { asesor, fechaInicio, fechaFin } = this.formGestion.value;
    const col = this.columnaAsesor;

    // 0) Acotar a la sede seleccionada (columna de asesor con valor) + mapear 'asesor'
    let filtrados = this.filasDeSede().map(r => ({ ...r, asesor: (r[col] ?? '').toString().trim() }));

    // 1) Por rango de fechas (opcional)
    if (fechaInicio && fechaFin) {
      const desde = new Date(fechaInicio); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(fechaFin);    hasta.setHours(23, 59, 59, 999);
      filtrados = filtrados.filter(r => {
        const f = this.parseMarcaTemporal(r['Marca temporal']);
        return f ? f >= desde && f <= hasta : false;
      });
    }

    // 2) Por asesor (opcional)
    if (asesor) {
      filtrados = filtrados.filter(r => r.asesor.toUpperCase() === asesor.trim().toUpperCase());
    }

    this.dataFiltrada = filtrados;
  }

  onAsesorChanged(event: any): void {
    this.formGestion.patchValue({ asesor: event.value }, { emitEvent: false });
    this.aplicarFiltros();
  }

  filtrarPorFecha(): void {
    this.aplicarFiltros();
  }

  exportar(): void {
    if (this.dataGrid) this.excelService.exportarDesdeGrid(`gestion-call-${this.sedeKey}`, this.dataGrid);
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding         = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color           = 'white';
      e.cellElement.style.textAlign       = 'center';
      e.cellElement.style.fontWeight      = 'bold';
      e.cellElement.style.whiteSpace      = 'normal';
      e.cellElement.style.height          = 'auto';
      e.cellElement.style.border          = '1.5px solid black';
    }
  }

  private parseMarcaTemporal(texto: string): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
    const match = texto.match(regex);
    if (!match) return null;

    let day    = parseInt(match[1], 10);
    let month  = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    let hour   = match[4] ? parseInt(match[4], 10) : 0;
    const min  = match[5] ? parseInt(match[5], 10) : 0;
    const sec  = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7]?.toUpperCase() ?? null;

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const d = new Date(year, month, day, hour, min, sec, 0);
    return isNaN(d.getTime()) ? null : d;
  }
}
