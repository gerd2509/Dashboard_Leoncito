import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CapSedesService, CapRow } from '../../services/cap-sedes.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

/**
 * Maestro CAP (admin): CRUD del roster de asesores por sede sobre la tabla
 * cap_asesores (BD). Los cambios se reflejan en Control Gestión/Call Sedes,
 * Pizarra de Metas y el registro de gestión de sedes (fuente = CapSedesService).
 */
@Component({
  selector: 'app-maestro-cap',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './maestro-cap.component.html',
  styleUrl: './maestro-cap.component.css',
})
export class MaestroCapComponent implements OnInit {
  private cap = inject(CapSedesService);
  private snack = inject(MatSnackBar);

  filas: CapRow[] = [];
  cargando = false;
  guardando = false;
  readonly estados = ['ACTIVO', 'RENUNCIA'];

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true;
    this.cap.listarFresco()
      .then(rows => { this.filas = rows; this.cargando = false; })
      .catch(() => { this.filas = []; this.cargando = false; this.toast('❌ No se pudo cargar el CAP.', true); });
  }

  onInsertado(e: any): void {
    this.guardando = true;
    this.cap.crear(this.payload(e.data)).subscribe({
      next: () => { this.guardando = false; this.cap.invalidar(); this.toast('✔ Asesor agregado al CAP.'); this.cargar(); },
      error: err => { this.guardando = false; this.toast('❌ ' + this.msg(err), true); this.cargar(); },
    });
  }
  onActualizado(e: any): void {
    if (!e.data?.id) { this.cargar(); return; }
    this.guardando = true;
    this.cap.actualizar(e.data.id, this.payload(e.data)).subscribe({
      next: () => { this.guardando = false; this.cap.invalidar(); this.toast('✔ Asesor actualizado.'); },
      error: err => { this.guardando = false; this.toast('❌ ' + this.msg(err), true); this.cargar(); },
    });
  }
  onEliminado(e: any): void {
    if (!e.data?.id) return;
    this.guardando = true;
    this.cap.eliminar(e.data.id).subscribe({
      next: () => { this.guardando = false; this.cap.invalidar(); this.toast('✔ Asesor eliminado del CAP.'); },
      error: err => { this.guardando = false; this.toast('❌ ' + this.msg(err), true); this.cargar(); },
    });
  }

  private payload(d: any): Partial<CapRow> {
    return {
      vendedor: (d.vendedor || '').trim(), sede: (d.sede || '').trim(),
      supervisor: (d.supervisor || '').trim(), gerente: (d.gerente || '').trim(),
      zona: (d.zona || '').trim(), canal: (d.canal || '').trim(),
      estado: (d.estado || 'ACTIVO').trim(), dni: (d.dni || '').trim(),
    };
  }
  private msg(err: any): string { return err?.error?.message || 'No se pudo guardar el cambio.'; }
  private toast(m: string, error = false): void {
    this.snack.open(m, 'OK', {
      duration: error ? 5000 : 3000, horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}
