import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { AuthService } from '../../../services/auth.service';
import { GestionKommoService, GestionKommo } from '../../../services/gestion-kommo.service';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { canalDeUsuario, Canal } from '../../../shared/canal-usuario';
import { DxDataGridComponent } from 'devextreme-angular/ui/data-grid';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingOverlayComponent } from '../../../shared/loading-overlay/loading-overlay.component';

/**
 * Gestión Kommo — vista de las gestiones KOMMO desde la BD (tabla gestion_kommo),
 * con EDICIÓN y eliminación. Reemplaza la lectura del Google Sheet. Acotada por
 * rol: Call ve solo Leoncito, Realzza solo Realzza, admin ve todo (con toggle).
 * El REGISTRO de nuevas gestiones está en el módulo Registro KOMMO.
 */
@Component({
  selector: 'app-gestion-kommo',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './gestion-kommo.component.html',
  styleUrl: './gestion-kommo.component.css',
})
export class GestionKommoComponent implements OnInit {
  private auth = inject(AuthService);
  private srv = inject(GestionKommoService);
  private excelService = inject(ExcelExportService);
  private snack = inject(MatSnackBar);

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  // Gating por rol.
  readonly scope = canalDeUsuario(this.auth.getUsuario());   // '' (admin) | LEONCITO | REALZZA
  get esAdmin(): boolean { return this.scope === ''; }
  filtroCanal: '' | Canal = '';

  isLoading = false;
  registros: GestionKommo[] = [];

  ngOnInit(): void {
    this.filtroCanal = this.scope || '';   // no-admin arranca fijo en su canal
    this.cargar();
  }

  private get canalEfectivo(): '' | Canal {
    return this.scope ? this.scope : this.filtroCanal;   // no-admin siempre su canal
  }

  setFiltroCanal(c: '' | Canal): void {
    if (!this.esAdmin) return;   // solo admin cambia el filtro
    this.filtroCanal = c;
    this.cargar();
  }

  cargar(): void {
    this.isLoading = true;
    const canal = this.canalEfectivo;
    this.srv.listar(canal ? { canal } : undefined).subscribe({
      next: (rows) => { this.registros = rows || []; this.isLoading = false; },
      error: () => { this.registros = []; this.isLoading = false; },
    });
  }

  onRowUpdating(e: any): void {
    const id = e.oldData?.id;
    if (!id) return;
    e.cancel = new Promise<boolean>((resolve) => {
      this.srv.actualizar(id, e.newData).subscribe({
        next: () => { this.toast('✔ Registro actualizado.'); resolve(false); },
        error: () => { this.toast('❌ No se pudo actualizar.', true); resolve(true); },
      });
    });
  }
  onRowRemoving(e: any): void {
    const id = e.data?.id;
    if (!id) return;
    e.cancel = new Promise<boolean>((resolve) => {
      this.srv.eliminar(id).subscribe({
        next: () => { this.toast('✔ Registro eliminado.'); resolve(false); },
        error: () => { this.toast('❌ No se pudo eliminar.', true); resolve(true); },
      });
    });
  }

  exportar(): void {
    if (this.dataGrid) {
      const suf = this.canalEfectivo || 'GENERAL';
      this.excelService.exportarDesdeGrid(`Gestion_Kommo_${suf}`, this.dataGrid);
    }
  }

  onCellPrepared(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
  }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: error ? 5000 : 3000,
      horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}
