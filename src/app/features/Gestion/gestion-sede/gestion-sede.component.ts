import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../../services/service-google.service';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DxDataGridComponent } from 'devextreme-angular';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { AuthService } from '../../../services/auth.service';
import { SedeConfigService } from '../../../services/sede-config.service';

import { LoadingOverlayComponent } from '../../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-gestion-sede',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './gestion-sede.component.html',
  styleUrl: './gestion-sede.component.css'
})
export class GestionSedeComponent implements OnInit {
  protected service      = inject(SheetsService);
  protected excelService = inject(ExcelExportService);
  protected auth         = inject(AuthService);
  protected sedeConfig   = inject(SedeConfigService);

  formGestion: UntypedFormGroup;
  dataFiltrada: any[] = [];
  listData:     any[] = [];

  protected showFilterRow = true;
  protected currentFilter = 'auto';

  isLoading = false;

  // Combos
  sedesDisponibles: { key: string; nombre: string }[] = [];
  asesores: string[] = [];
  bloquearSede = false;   // true para jefes de tienda (1 sola sede)

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      sede:        [''],
      asesor:      [''],
      fechaInicio: [null],
      fechaFin:    [null],
    });
  }

  async ngOnInit() {
    // Determinar sedes disponibles según el usuario
    const u = this.auth.getUsuario();
    const esGlobal = !u || u.rol === 'admin' || ['todas', 'call'].includes(u.sede.toLowerCase());

    if (esGlobal) {
      this.sedesDisponibles = this.sedeConfig.getSedesParaCombo();
    } else {
      const cfg = this.sedeConfig.getConfig(u.sede);
      this.sedesDisponibles = cfg
        ? [{ key: this.sedeConfig.normalizar(u.sede), nombre: cfg.nombre }]
        : [];
      this.bloquearSede = true;
    }

    // Sede inicial = primera disponible
    const sedeInicial = this.sedesDisponibles[0]?.key ?? '';
    this.formGestion.patchValue({ sede: sedeInicial });
    this.actualizarComboAsesores(sedeInicial);

    await this.cargarData();
  }

  private async cargarData(): Promise<void> {
    this.isLoading = true;
    try {
      // Fuente única = BD (tabla gestion), ya mapeada a la forma del sheet (+ id + ASESOR).
      this.listData = await lastValueFrom(this.service.getGestionSedesDB());
      this.aplicarFiltros();
    } catch (e) {
      console.error('Error al cargar datos de sedes:', e);
      this.listData = [];
      this.dataFiltrada = [];
    } finally {
      this.isLoading = false;
    }
  }

  // ── Editar / eliminar registros del grid (persisten en la BD) ──
  onRowUpdated(e: any): void {
    const id = e?.key ?? e?.data?.id;
    if (!id) return;
    this.service.updateGestionSede(id, e.data).subscribe({
      // Sincroniza el arreglo maestro para que el cambio no se pierda al re-filtrar.
      next: () => {
        const i = this.listData.findIndex(r => String(r.id) === String(id));
        if (i >= 0) this.listData[i] = { ...this.listData[i], ...e.data };
      },
      error: () => { alert('No se pudo guardar el cambio; se recargará la información.'); this.cargarData(); },
    });
  }
  onRowRemoved(e: any): void {
    const id = e?.key ?? e?.data?.id;
    if (!id) return;
    this.service.deleteGestionSede(id).subscribe({
      // Quita la fila también de `listData` (el grid solo mutó la vista `dataFiltrada`).
      // Sin esto la fila reaparecía al re-filtrar/Actualizar aunque ya estaba borrada en BD.
      next: () => { this.listData = this.listData.filter(r => String(r.id) !== String(id)); },
      error: () => { alert('No se pudo eliminar; se recargará la información.'); this.cargarData(); },
    });
  }

  aplicarFiltros(): void {
    const { sede, asesor, fechaInicio, fechaFin } = this.formGestion.value;
    let filtrados = [...this.listData];

    // 1) Por sede
    if (sede) {
      const cfg = this.sedeConfig.getConfig(sede);
      if (cfg) {
        filtrados = filtrados.filter(r => this.sedeConfig.mismaSede(r['TIENDA SEDE'], cfg.valorSede));
      }
    }

    // 2) Por rango de fechas (opcional)
    if (fechaInicio && fechaFin) {
      const desde = new Date(fechaInicio); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(fechaFin);    hasta.setHours(23, 59, 59, 999);
      filtrados = filtrados.filter(r => {
        const f = this.parseMarcaTemporal(r['Marca temporal']);
        return f ? f >= desde && f <= hasta : false;
      });
    }

    // 3) Por asesor (opcional)
    if (asesor) {
      filtrados = filtrados.filter(r =>
        (r['ASESOR'] || '').toString().trim().toUpperCase() === asesor.trim().toUpperCase()
      );
    }

    this.dataFiltrada = filtrados;
  }

  onSedeChanged(event: any): void {
    const sede = event.value;
    this.actualizarComboAsesores(sede);
    this.formGestion.patchValue({ asesor: '' });
    this.aplicarFiltros();
  }

  onAsesorChanged(event: any): void {
    this.formGestion.patchValue({ asesor: event.value });
    this.aplicarFiltros();
  }

  filtrarPorFecha(): void {
    this.aplicarFiltros();
  }

  private actualizarComboAsesores(sedeKey: string): void {
    const cfg = this.sedeConfig.getConfig(sedeKey);
    this.asesores = cfg ? cfg.asesores : [];
  }

  exportar(): void {
    if (this.dataGrid) this.excelService.exportarDesdeGrid('gestion-sedes', this.dataGrid);
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
