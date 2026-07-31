import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { GestionKommoService, GestionKommo } from '../../services/gestion-kommo.service';
import { ASESORES_CALL } from '../../shared/asesores';
import { canalDeUsuario, Canal } from '../../shared/canal-usuario';

// Modelo del formulario (todos string para el binding de DevExtreme).
interface FormKommo {
  canal: string; tienda: string; estado_gestion: string; resultado_gestion: string; market_place: string;
  tipo_cliente: string; dni_cliente: string; celular_gestionado: string; nombre_cliente: string;
  asesor: string; sede: string; fecha_lead_asignado: string;
  motivo_no_contacto: string; producto_interes: string; motivo_interes: string;
  fecha_interes_agend: string; hora_interes_agend: string; comentario_agend: string;
  motivo_agendamiento: string; motivo_no_atendible: string; comentario_na: string;
  motivo_no_interes: string; comentario_adicional: string;
  motivo_no_cierre: string; comentario_venta_no_concretada: string;
}
function blankForm(canal: Canal): FormKommo {
  return {
    canal, tienda: canal, estado_gestion: '', resultado_gestion: '', market_place: 'NO',
    tipo_cliente: '', dni_cliente: '', celular_gestionado: '', nombre_cliente: '', asesor: '', sede: '', fecha_lead_asignado: '',
    motivo_no_contacto: '', producto_interes: '', motivo_interes: '', fecha_interes_agend: '', hora_interes_agend: '', comentario_agend: '',
    motivo_agendamiento: '', motivo_no_atendible: '', comentario_na: '', motivo_no_interes: '', comentario_adicional: '',
    motivo_no_cierre: '', comentario_venta_no_concretada: '',
  };
}

// Asesores Realzza (mismo listado que Ventas Campo / Registro Supervisor).
const ASESORES_REALZZA = [
  'ACOSTA JIMENEZ MARIELA NATALY', 'PEREZ TINEO MARICIELO TATIANA', 'RIVAS PURISACA KAREN YUDITH',
  'BERNAL BAZAN BRENDA NICOLL', 'MIÑOPE GONZALES ANYELA ESTHEFANY', 'MONTALVO LUYO ERNESTO ADOLFO',
  'SANTAMARIA GUZMAN MERLY BRIGHITE', 'UCHOFEN VIGO FELICITA', 'BUSTAMANTE CHALAN ANA RUT',
  'GUILLEN MACKUADO AURORA FERNANDA', 'LLONTOP DAVILA DENNIS CHRISTIAN',
];

/**
 * Registro de Gestión KOMMO (Leoncito + Realzza) → escribe directo a la BD
 * (tabla gestion_kommo), reemplazando el Google Form. El canal disponible se
 * limita según el rol: Call registra Leoncito, Realzza registra Realzza, admin
 * puede ambos. Para VER/EDITAR los registros está el módulo Gestión Kommo.
 */
@Component({
  selector: 'app-registro-kommo',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './registro-kommo.component.html',
  styleUrl: './registro-kommo.component.css',
})
export class RegistroKommoComponent implements OnInit {
  private auth = inject(AuthService);
  private srv = inject(GestionKommoService);
  private snack = inject(MatSnackBar);

  // Opciones (valores reales de la data KOMMO).
  readonly estados = ['CONTACTO', 'NO CONTACTO'];
  readonly resultados = ['INTERESADO', 'ENVIARÁ CATALOGO', 'NO ATENDIBLE', 'NO INTERESADO'];
  readonly tiposCliente = ['NUEVO', 'DORMIDO', 'VIGENTE', 'NO VIGENTE', 'AFILIACIONES', 'REENGANCHE'];
  readonly siNo = ['SI', 'NO'];
  readonly productos = ['MOTOCICLETA', 'MOTOTAXI', 'PEQUEÑOS ARTEFACTOS', 'TELEVISOR', 'MELANIMA', 'LAPTOP',
    'REFRIGERADORA', 'IMPRESORA', 'COCINA', 'JUEGO MUEBLES', 'LAVADORA', 'TELEFONO CELULAR', 'CONGELADORA',
    'CAMA + COLCHON', 'JUEGO COMEDOR', 'OTRO'];
  readonly motivosInteres = ['CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)', 'VISITARÁ TIENDA',
    'VENTA DERIVADA PARA CIERRE A SEDE', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO', 'VENTA NO CONCRETADA'];
  readonly motivosAgend = ['ENVIARÁ CATALOGO', 'INTERÉS A FUTURO', 'VISITARÁ TIENDA'];
  readonly motivosNoInteres = ['NO EXPLICA - SIN RAZON', 'PRECIO ALTO', 'CORTA LLAMADA', 'YA COMPRÓ EN EL MES', 'FUERA DE ZONA'];
  readonly motivosNoAtendible = ['RECHAZADO CRÉDITOS', 'FUERA DE ZONA', 'CON AFECTACION'];
  readonly motivosNoContacto = ['NO CONTESTA', 'CELULAR APAGADO', 'CELULAR SUPENDIDO - NO EXISTE', 'NÚMERO EQUIVOCADO'];
  readonly motivosNoCierre = ['NO CALIFICA (PROBLEMAS CREDITICIOS O REQUISITOS)', 'FALTA DE INICIAL',
    'INCONTACTABLE POSTERIOR AL INTERES (DEJO DE CONTESTAR)', 'MUY CARO',
    'DESISTIO DE LA COMPRA (CAMBIO DE OPINION EL TITULAR)', 'FALTA DE STOCK O DISPONIBILIDAD DE PRODUCTO'];
  readonly sedes = ['Lambayeque', 'Realzza', 'Fuera de Zona', 'Ferreñafe', 'Chongoyape', 'La Victoria',
    'Olmos', 'Jayanca', 'Cayalti', 'Motupe', 'Mochumi', 'Morrope', 'Oyotun'];

  private readonly asesoresCall = ASESORES_CALL.map(a => a.nombre).sort();
  private readonly asesoresRealzza = [...ASESORES_REALZZA].sort();
  get asesores(): string[] { return this.canal === 'REALZZA' ? this.asesoresRealzza : this.asesoresCall; }

  // Gating por rol: qué canal(es) puede registrar este usuario.
  readonly scope = canalDeUsuario(this.auth.getUsuario());   // '' (admin/ambos) | 'LEONCITO' | 'REALZZA'
  get puedeElegirCanal(): boolean { return this.scope === ''; }
  get canalesPermitidos(): Canal[] { return this.scope ? [this.scope] : ['LEONCITO', 'REALZZA']; }

  canal: Canal = 'LEONCITO';
  guardando = false;
  hoy = new Date();
  f: FormKommo = blankForm('LEONCITO');

  ngOnInit(): void {
    this.canal = this.canalesPermitidos[0];
    this.resetForm();
  }

  get registrador(): string { return this.auth.getUsuario()?.nombre ?? ''; }

  setCanal(c: Canal): void {
    if (this.canal === c || !this.canalesPermitidos.includes(c)) return;
    this.canal = c;
    this.resetForm();
  }

  private resetForm(): void { this.f = blankForm(this.canal); }

  soloNumeros(campo: 'dni_cliente' | 'celular_gestionado', max: number): void {
    this.f[campo] = (this.f[campo] ?? '').toString().replace(/\D/g, '').slice(0, max);
  }

  // ── Visibilidad de campos según el flujo (como el form) ──
  get esContacto(): boolean { return this.f.estado_gestion === 'CONTACTO'; }
  get esNoContacto(): boolean { return this.f.estado_gestion === 'NO CONTACTO'; }
  get esInteresado(): boolean { return this.esContacto && this.f.resultado_gestion === 'INTERESADO'; }
  get esEnviaraCat(): boolean { return this.esContacto && this.f.resultado_gestion === 'ENVIARÁ CATALOGO'; }
  get esNoAtendible(): boolean { return this.esContacto && this.f.resultado_gestion === 'NO ATENDIBLE'; }
  get esNoInteresado(): boolean { return this.esContacto && this.f.resultado_gestion === 'NO INTERESADO'; }
  get esRealzza(): boolean { return this.canal === 'REALZZA'; }

  private get errores(): string[] {
    const e: string[] = [];
    if (!this.f.asesor) e.push('Selecciona el asesor.');
    if (!/^\d{8}$/.test(this.f.dni_cliente || '')) e.push('El DNI debe tener 8 dígitos.');
    if (this.f.celular_gestionado && !/^\d{9}$/.test(this.f.celular_gestionado)) e.push('El celular debe tener 9 dígitos.');
    if (!this.f.estado_gestion) e.push('Selecciona el estado de gestión.');
    if (this.esContacto && !this.f.resultado_gestion) e.push('Selecciona el resultado de gestión.');
    if (this.esNoContacto && !this.f.motivo_no_contacto) e.push('Indica el motivo de no contacto.');
    return e;
  }
  get formValido(): boolean { return this.errores.length === 0; }

  registrar(): void {
    const errs = this.errores;
    if (errs.length) { this.toast(errs[0], true); return; }
    this.guardando = true;
    const payload: Partial<GestionKommo> = { ...(this.f as any), canal: this.canal, tienda: this.canal, registrado_por: this.registrador };
    this.srv.registrar(payload).subscribe({
      next: () => {
        this.guardando = false;
        this.toast('✔ Gestión registrada correctamente.');
        const asesor = this.f.asesor, sede = this.f.sede;   // conserva para el siguiente
        this.resetForm();
        this.f.asesor = asesor; this.f.sede = sede;
      },
      error: () => { this.guardando = false; this.toast('❌ No se pudo registrar (revisa el servidor).', true); },
    });
  }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: error ? 5000 : 3000,
      horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}
