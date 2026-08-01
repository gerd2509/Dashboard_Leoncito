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
  fecha_interes_deriv: string; hora_interes_deriv: string; comentario_deriv: string;
  motivo_agendamiento: string; motivo_no_atendible: string; comentario_na: string;
  motivo_no_interes: string; comentario_adicional: string;
  motivo_no_cierre: string; comentario_venta_no_concretada: string;
}
function blankForm(canal: Canal): FormKommo {
  return {
    canal, tienda: canal, estado_gestion: '', resultado_gestion: '', market_place: 'NO',
    tipo_cliente: '', dni_cliente: '', celular_gestionado: '', nombre_cliente: '', asesor: '', sede: '', fecha_lead_asignado: '',
    motivo_no_contacto: '', producto_interes: '', motivo_interes: '', fecha_interes_agend: '', hora_interes_agend: '', comentario_agend: '',
    fecha_interes_deriv: '', hora_interes_deriv: '', comentario_deriv: '',
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
  readonly resultados = ['INTERESADO', 'NO INTERESADO', 'NO ATENDIBLE', 'ENVIARÁ CATALOGO'];
  readonly tiposCliente = ['NUEVO', 'DORMIDO', 'VIGENTE', 'NO VIGENTE', 'AFILIACIONES', 'REENGANCHE'];
  readonly siNo = ['SI', 'NO'];
  readonly productos = ['REFRIGERADORA', 'VISICOOLER', 'COCINA', 'LAVADORA', 'CONGELADORA', 'TELEVISOR',
    'EQUIPO SONIDO', 'LAPTOP', 'IMPRESORA', 'TELEFONO CELULAR', 'MOTOCICLETA', 'MOTOTAXI', 'JUEGO MUEBLES',
    'JUEGO COMEDOR', 'MELANIMA', 'CAMA', 'COLCHON', 'CAMA + COLCHON', 'PEQUEÑOS ARTEFACTOS', 'MOTO CARGUERA'];
  // MOTIVO INTERÉS ramifica: agendamiento / derivación / venta no concretada.
  readonly motivosInteres = ['VISITARÁ TIENDA', 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)',
    'VENTA DERIVADA PARA CIERRE A SEDE', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO', 'VENTA NO CONCRETADA'];
  readonly motivosAgend = ['VISITARÁ TIENDA', 'ENVIARÁ CATALOGO', 'INTERÉS A FUTURO'];
  readonly motivosNoInteres = ['ATENCIÓN POST VENTA', 'SERVICIO TÉCNICO NO ATENDIDO', 'YA COMPRÓ EN EL MES',
    'PRECIO ALTO', 'NO EXPLICA - SIN RAZON', 'CORTA LLAMADA', 'FUERA DE ZONA'];
  readonly motivosNoAtendible = ['CON AFECTACION', 'RECHAZADO CRÉDITOS', 'FUERA DE ZONA'];
  readonly motivosNoContacto = ['NO CONTESTA', 'NÚMERO EQUIVOCADO', 'CELULAR SUPENDIDO - NO EXISTE', 'CELULAR APAGADO'];
  readonly motivosNoCierre = ['MUY CARO', 'FALTA DE STOCK O DISPONIBILIDAD DE PRODUCTO',
    'DESISTIO DE LA COMPRA (CAMBIO DE OPINION EL TITULAR)', 'NO CALIFICA (PROBLEMAS CREDITICIOS O REQUISITOS)',
    'INCONTACTABLE POSTERIOR AL INTERES (DEJO DE CONTESTAR)', 'FALTA DE INICIAL'];
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

  // Pickers de fecha/hora (dx-date-box trabaja con Date; se convierten a string al registrar).
  fechaLead: Date | null = null;
  fechaAgend: Date | null = null; horaAgend: Date | null = null;
  fechaDeriv: Date | null = null; horaDeriv: Date | null = null;

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

  private resetForm(): void {
    this.f = blankForm(this.canal);
    this.fechaLead = this.fechaAgend = this.horaAgend = this.fechaDeriv = this.horaDeriv = null;
  }

  private fmtFecha(d: Date | null): string {
    return d ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}` : '';
  }
  private fmtHora(d: Date | null): string {
    return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
  }

  soloNumeros(campo: 'dni_cliente' | 'celular_gestionado', max: number): void {
    this.f[campo] = (this.f[campo] ?? '').toString().replace(/\D/g, '').slice(0, max);
  }

  // ── Visibilidad de campos según el flujo del form KOMMO ──
  get esContacto(): boolean { return this.f.estado_gestion === 'CONTACTO'; }
  get esNoContacto(): boolean { return this.f.estado_gestion === 'NO CONTACTO'; }
  get esInteresado(): boolean { return this.esContacto && this.f.resultado_gestion === 'INTERESADO'; }
  get esNoAtendible(): boolean { return this.esContacto && this.f.resultado_gestion === 'NO ATENDIBLE'; }
  get esNoInteresado(): boolean { return this.esContacto && this.f.resultado_gestion === 'NO INTERESADO'; }
  // INTERESADO → MOTIVO INTERÉS ramifica: agendamiento / derivación / venta no concretada.
  get muestraAgend(): boolean {
    return this.esInteresado && ['VISITARÁ TIENDA', 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)'].includes(this.f.motivo_interes);
  }
  get muestraDeriv(): boolean {
    return this.esInteresado && ['VENTA DERIVADA PARA CIERRE A SEDE', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO'].includes(this.f.motivo_interes);
  }
  get muestraNoCierre(): boolean {
    return this.esInteresado && this.f.motivo_interes === 'VENTA NO CONCRETADA';
  }

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
    // Fecha/hora de los pickers → strings del form (d/m/aaaa · HH:mm).
    this.f.fecha_lead_asignado = this.fmtFecha(this.fechaLead);
    this.f.fecha_interes_agend = this.fmtFecha(this.fechaAgend);
    this.f.hora_interes_agend = this.fmtHora(this.horaAgend);
    this.f.fecha_interes_deriv = this.fmtFecha(this.fechaDeriv);
    this.f.hora_interes_deriv = this.fmtHora(this.horaDeriv);
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
