import { Component, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../services/auth.service';
import { ControlSupervisorService, ControlSupervisorPayload } from '../../../services/control-supervisor.service';

// Asesores Realzza (mismo listado que Ventas Campo). Se guarda el NOMBRE completo.
const ASESORES_REALZZA = [
  'ACOSTA JIMENEZ MARIELA NATALY',
  'PEREZ TINEO MARICIELO TATIANA',
  'RIVAS PURISACA KAREN YUDITH',
  'BERNAL BAZAN BRENDA NICOLL',
  'MIÑOPE GONZALES ANYELA ESTHEFANY',
  'MONTALVO LUYO ERNESTO ADOLFO',
  'SANTAMARIA GUZMAN MERLY BRIGHITE',
  'UCHOFEN VIGO FELICITA',
  'RIQUERO ULCO CESAR JEFFERSON',
  'BUSTAMANTE CHALAN ANA RUT',
  'BUSTAMANTE BANCES LUCIA NICOLL',
  'LLONTOP DAVILA DENNIS CHRISTIAN',
];

const TIPO_BASE = ['BBDD', 'KOMMO', 'TIENDA', 'REFERIDOS', 'BRILLA', 'BBDD KOMMO', 'RECURRENTES NO ASIGNADOS', 'MARKET PLACE', 'EFECTIVA', 'REDES SSENDA'];

// Margen máximo (en días) para que una publicación de Market Place esté "al día".
const MARGEN_MP_DIAS = 4;

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
  readonly margenMp = MARGEN_MP_DIAS;

  guardando = false;
  tipo: 'GESTION' | 'MARKET_PLACE' = 'GESTION';
  readonly hoy = new Date();

  // Modelo de control de GESTIÓN.
  g = { asesor: '', tipo_base: '', dni_cliente: '', celular: '', estado_gestion: '', comentario: '' };

  // Modelo de control de MARKET PLACE.
  mp: { asesor: string; fechaPub: Date | null; sinPub: boolean; sePublico: boolean; comentario: string } = {
    asesor: '', fechaPub: null, sinPub: false, sePublico: false, comentario: '',
  };

  get supervisor(): string { return this.auth.getUsuario()?.nombre ?? ''; }

  setTipo(t: 'GESTION' | 'MARKET_PLACE'): void { this.tipo = t; }

  soloNumeros(campo: 'dni_cliente' | 'celular', max: number): void {
    this.g[campo] = (this.g[campo] ?? '').toString().replace(/\D/g, '').slice(0, max);
  }

  // ── Market Place: cálculo automático del estado por la regla de los 4 días ──
  get diasSinPublicar(): number | null {
    if (this.mp.sinPub) return 999;
    if (!this.mp.fechaPub) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const f = new Date(this.mp.fechaPub); f.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((hoy.getTime() - f.getTime()) / 86400000));
  }
  get estadoMp(): string {
    const d = this.diasSinPublicar;
    if (d === null) return '';
    if (d <= this.margenMp) return 'AL DÍA';
    return this.mp.sePublico ? 'ACTUALIZADO' : 'DESACTUALIZADO';
  }
  get claseMp(): string {
    const e = this.estadoMp;
    return e === 'AL DÍA' ? 'ok' : e === 'ACTUALIZADO' ? 'upd' : e === 'DESACTUALIZADO' ? 'bad' : '';
  }
  // El check "se le hizo publicar" solo aplica cuando está fuera de rango.
  get fueraDeRango(): boolean { const d = this.diasSinPublicar; return d !== null && d > this.margenMp; }

  private get errores(): string[] {
    const e: string[] = [];
    if (this.tipo === 'GESTION') {
      if (!this.g.asesor) e.push('Selecciona el asesor.');
      if (!/^\d{8}$/.test(this.g.dni_cliente || '')) e.push('El DNI debe tener 8 dígitos.');
      if (this.g.celular && !/^\d{9}$/.test(this.g.celular)) e.push('El celular debe tener 9 dígitos.');
      if (!this.g.estado_gestion) e.push('Selecciona el estado de gestión.');
    } else {
      if (!this.mp.asesor) e.push('Selecciona el asesor.');
      if (!this.mp.sinPub && !this.mp.fechaPub) e.push('Indica la fecha de la última publicación (o marca "sin publicaciones").');
    }
    return e;
  }
  get formValido(): boolean { return this.errores.length === 0; }

  registrar(): void {
    const errs = this.errores;
    if (errs.length) { this.toast(errs[0], true); return; }
    this.guardando = true;

    let payload: ControlSupervisorPayload;
    if (this.tipo === 'GESTION') {
      payload = { tipo_control: 'GESTION', registrado_por: this.supervisor, ...this.g };
    } else {
      payload = {
        tipo_control: 'MARKET_PLACE',
        registrado_por: this.supervisor,
        asesor: this.mp.asesor,
        fecha_publicacion: this.mp.sinPub ? '' : this.fechaDMY(this.mp.fechaPub),
        estado_mp: this.estadoMp,
        comentario: this.mp.comentario,
      };
    }

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

  private resetParaSiguiente(): void {
    if (this.tipo === 'GESTION') {
      this.g = { asesor: this.g.asesor, tipo_base: this.g.tipo_base, dni_cliente: '', celular: '', estado_gestion: '', comentario: '' };
    } else {
      this.mp = { asesor: this.mp.asesor, fechaPub: null, sinPub: false, sePublico: false, comentario: '' };
    }
  }

  private fechaDMY(d: Date | null): string {
    if (!d) return '';
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
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
