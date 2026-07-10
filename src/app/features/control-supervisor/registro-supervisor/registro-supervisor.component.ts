import { Component, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../services/auth.service';
import { ControlSupervisorService, ControlSupervisorPayload } from '../../../services/control-supervisor.service';

// Asesores Realzza (mismo listado que Cierre de Gestión). Se guarda el NOMBRE
// completo para que el cruce con la gestión (ASESOR REALZZA) sea directo.
const ASESORES_REALZZA = [
  'MONTALVO LUYO ERNESTO ADOLFO',
  'ACOSTA JIMENEZ MARIELA NATALY',
  'PEREZ TINEO MARICIELO TATIANA',
  'RIVAS PURISACA KAREN YUDITH',
  'MIÑOPE GONZALES ANYELA ESTHEFANY',
  'UCHOFEN VIGO FELICITA',
  'SANTAMARIA GUZMAN MERLY BRIGHITE',
  'BUSTAMANTE CHALAN ANA RUT',
  'BUSTAMANTE BANCES LUCIA NICOLL',
  'LLONTOP DAVILA DENNIS CHRISTIAN',
];

const TIPO_BASE = ['BBDD', 'KOMMO', 'TIENDA', 'REFERIDOS', 'BRILLA', 'BBDD KOMMO', 'RECURRENTES NO ASIGNADOS', 'MARKET PLACE', 'EFECTIVA', 'REDES SSENDA'];

@Component({
  selector: 'app-registro-supervisor',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './registro-supervisor.component.html',
  styleUrl: './registro-supervisor.component.css'
})
export class RegistroSupervisorComponent {
  private auth = inject(AuthService);
  private srv = inject(ControlSupervisorService);
  private snack = inject(MatSnackBar);

  readonly asesores = ASESORES_REALZZA;
  readonly tiposBase = TIPO_BASE;
  readonly estados = ['CONTACTO', 'NO CONTACTO'];

  guardando = false;

  // Modelo del formulario (todos string para el binding de DevExtreme).
  m: Required<Omit<ControlSupervisorPayload, 'registrado_por'>> = {
    asesor: '',
    tipo_base: '',
    dni_cliente: '',
    celular: '',
    estado_gestion: '',
    comentario: '',
  };

  get supervisor(): string {
    return this.auth.getUsuario()?.nombre ?? '';
  }

  // Deja solo dígitos y recorta a `max` caracteres (para DNI/celular).
  soloNumeros(campo: 'dni_cliente' | 'celular', max: number): void {
    this.m[campo] = (this.m[campo] ?? '').toString().replace(/\D/g, '').slice(0, max);
  }

  private get errores(): string[] {
    const e: string[] = [];
    if (!this.m.asesor) e.push('Selecciona el asesor.');
    if (!/^\d{8}$/.test(this.m.dni_cliente || '')) e.push('El DNI debe tener 8 dígitos.');
    if (this.m.celular && !/^\d{9}$/.test(this.m.celular)) e.push('El celular debe tener 9 dígitos.');
    if (!this.m.estado_gestion) e.push('Selecciona el estado de gestión.');
    return e;
  }

  get formValido(): boolean {
    return this.errores.length === 0;
  }

  registrar(): void {
    const errs = this.errores;
    if (errs.length) { this.toast(errs[0], true); return; }
    this.guardando = true;
    const payload: ControlSupervisorPayload = {
      ...this.m,
      registrado_por: this.supervisor,
    };
    this.srv.registrar(payload).subscribe({
      next: () => {
        this.guardando = false;
        this.toast('✔ Control registrado correctamente.');
        this.resetParaSiguiente();
      },
      error: () => {
        this.guardando = false;
        this.toast('❌ No se pudo registrar (revisa la conexión al servidor).', true);
      },
    });
  }

  // Limpia DNI/celular/comentario y estado, conservando asesor + tipo base para
  // registrar varios controles seguidos del mismo asesor/base.
  private resetParaSiguiente(): void {
    this.m = {
      asesor: this.m.asesor,
      tipo_base: this.m.tipo_base,
      dni_cliente: '',
      celular: '',
      estado_gestion: '',
      comentario: '',
    };
  }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'Cerrar', {
      duration: error ? 5000 : 2800,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: error ? ['snack-error'] : ['snack-ok'],
    });
  }
}
