import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { RegistroGestionService, GestionPayload, GestionRealzzaPayload, GestionCallPayload } from '../../services/registro-gestion.service';

// ── Catálogos (fáciles de editar) ──────────────────────────────────────────────
const TIPOS_GESTION = ['ENTREGA DE CARTA', 'LLAMADA TELEFONICA'];

const MOTIVOS_CONTACTO_FORM = [
  'compromiso de compra', 'Cotización en seguimiento/mas adelante',
  'Visitara tienda', 'Se programo visita a domicilio',
];
const MOTIVOS_CONTACTO_DETALLE = [
  'Atención al cliente', 'Precio elevado', 'cambio de domicilio', 'Servicio tecnico',
  'Sin trabajo-Sin liquidez', 'Notificacion con familiar', 'Fuera de zona',
  'No aplica por políticas de crédito', 'Ya compro en el mes',
];
const MOTIVOS_CONTACTO_FIN = ['Venta cerrada', 'fallecido', 'No desea -sin razón'];
const MOTIVOS_CONTACTO = [
  'Venta cerrada', ...MOTIVOS_CONTACTO_FORM, ...MOTIVOS_CONTACTO_DETALLE, 'fallecido', 'No desea -sin razón',
];

const MOTIVOS_NO_CONTACTO = [
  'No contesta-Se mensajeo wsp', 'Numero equivocado', 'Carta bajo puerta',
  'Celular suspendido-no existe', 'Celular apagado-Se mensajeo wsp',
];

const PRODUCTOS = [
  'REFRIGERADORA', 'COCINA', 'LAVADORA', 'CONGELADORA', 'TELEVISOR', 'EQUIPO SONIDO',
  'LAPTOP', 'IMPRESORA', 'TELEFONO CELULAR', 'MOTOCICLETA', 'MOTOTAXI', 'JUEGO MUEBLES',
  'JUEGO COMEDOR', 'MELAMINA', 'CAMA', 'COLCHON', 'CAMA + COLCHON', 'PEQUEÑOS ARTEFACTOS',
  'MOTO', 'MOTO CARGUERA',
];

// ── Catálogos Realzza (del formulario de campo) ──────────────────────────────
const RZ_TIPO_BASE = ['BBDD', 'KOMMO', 'TIENDA', 'REFERIDOS', 'BRILLA', 'BBDD KOMMO', 'RECURRENTES NO ASIGNADOS', 'MARKET PLACE', 'EFECTIVA', 'REDES SSENDA'];
const RZ_MEDIO = ['WHATSAPP', 'LLAMADA', 'MENSAJE DE TEXTO'];
const RZ_RESULTADO = ['INTERESADO', 'NO INTERESADO', 'NO ATENDIBLE', 'TERCERO RELACIONADO', 'ENVIARÁ CATÁLOGO'];
const RZ_PRODUCTOS = ['REFRIGERADORA', 'COCINA', 'LAVADORA', 'CONGELADORA', 'TELEVISOR', 'EQUIPO SONIDO', 'LAPTOP', 'IMPRESORA', 'TELEFONO CELULAR', 'MOTOCICLETA', 'MOTOTAXI', 'MOTO CARGUERA', 'MOTO ELECTRICA', 'JUEGO MUEBLES', 'JUEGO COMEDOR', 'MELANIMA', 'CAMA', 'COLCHON', 'CAMA + COLCHON', 'PEQUEÑOS ARTEFACTOS'];
const RZ_MOTIVO_INTERES = ['VENTA DERIVADA PARA CIERRE A SEDE', 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)', 'VENTA NO CONCRETADA'];
const RZ_MOTIVO_AGENDAMIENTO = ['VISITARÁ TIENDA', 'ENVIARÁ CATALOGO', 'INTERÉS A FUTURO'];
const RZ_MOTIVO_NO_CIERRE = ['MUY CARO', 'FALTA DE STOCK O DISPONIBILIDAD DE PRODUCTO', 'DESISTIO DE LA COMPRA (CAMBIO DE OPINION EL TITULAR)', 'NO CALIFICA (PROBLEMAS CREDITICIOS O REQUISITOS)', 'INCONTACTABLE POSTERIOR AL INTERES (DEJO DE CONTESTAR)', 'FALTA DE INICIAL'];
const RZ_MOTIVO_NO_INTERES = ['ATENCIÓN POST VENTA', 'SERVICIO TÉCNICO NO ATENDIDO', 'YA COMPRÓ EN EL MES', 'PRECIO ALTO', 'NO EXPLICA - SIN RAZON', 'CORTA LLAMADA', 'FUERA DE ZONA'];
const RZ_MOTIVO_NO_ATENDIBLE = ['CAMBIO DE ZONA/DOMICILIO DE ATENCIÓN', 'MUERTE', 'RECHAZADO CRÉDITOS'];
const RZ_MOTIVOS_TERCERO = ['LE DEJARÁ MENSAJE - VOLVER A LLAMAR', 'SE OBTUVO NÚMERO DE TITULAR', 'NO DA INFORMACIÓN - NEGATIVA'];
const RZ_MOTIVO_NO_CONTACTO = ['NO CONTESTA', 'NÚMERO EQUIVOCADO', 'CELULAR SUPENDIDO - NO EXISTE', 'CELULAR APAGADO'];
// Motivos de tercero relacionado que llevan a agendar re-llamada (sección 10).
const RZ_TERCERO_CON_AGENDA = ['LE DEJARÁ MENSAJE - VOLVER A LLAMAR', 'SE OBTUVO NÚMERO DE TITULAR'];

// ── Catálogos Call Center (comparte varios con Realzza) ──────────────────────
const CALL_SEDES = ['Motupe', 'Olmos', 'Ferreñafe', 'Jayanca', 'Mochumi', 'Morrope', 'Lambayeque', 'Oyotun', 'Cayalti', 'Chongoyape', 'La Victoria', 'Realzza', 'KOMMO', 'MARKET PLACE'];
const CALL_TIPO_CLIENTE = ['DORMIDO', 'VIGENTE', 'NO VIGENTE', 'LOVER A', 'LOVER B', 'CANCELADO', 'REENGANCHE', 'NUEVO', 'BRILLA', 'EFECTIVA', 'SORTEO - LA VICTORIA', 'AFILIACIONES'];
const CALL_MEDIO = ['WHATSAPP', 'LLAMADA', 'MENSAJE DE TEXTO', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK'];
const CALL_PRODUCTOS = ['REFRIGERADORA', 'VISICOOLER', 'COCINA', 'LAVADORA', 'CONGELADORA', 'TELEVISOR', 'EQUIPO SONIDO', 'LAPTOP', 'IMPRESORA', 'TELEFONO CELULAR', 'MOTOCICLETA', 'MOTOTAXI', 'JUEGO MUEBLES', 'JUEGO COMEDOR', 'MELANIMA', 'CAMA', 'COLCHON', 'CAMA + COLCHON', 'PEQUEÑOS ARTEFACTOS', 'MOTO CARGUERA'];
const CALL_MOTIVO_INTERES = ['VENTA DERIVADA PARA CIERRE A SEDE', 'VISITARÁ TIENDA', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO', 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)', 'VENTA NO CONCRETADA'];
// Estos motivos de interés llevan a GESTIÓN DERIVACIÓN (fecha/hora/comentario).
const CALL_MOTIVO_DERIVACION = ['VENTA DERIVADA PARA CIERRE A SEDE', 'VISITARÁ TIENDA', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO'];

type PasoCall =
  | 'callDni' | 'callCelular' | 'callSede' | 'callKommo' | 'callTipoCliente' | 'callEstado'
  | 'callNoContacto' | 'callMedioResultado' | 'callInteres' | 'callDerivacion' | 'callAgendamiento'
  | 'callNoConcretada' | 'callNoInteres' | 'callNoAtendible' | 'callTercero' | 'callTerceroAgenda' | 'callResumen';

interface CallModelo {
  asesor: string;
  dni_cliente: string;
  celular_gestionado: string;
  sede: string;
  kommo: string;
  tipo_cliente: string;
  estado_gestion: string;
  medio_primer_contacto: string;
  resultado_gestion: string;
  producto_interes: string;
  motivo_interes: string;
  motivo_agendamiento: string;
  fecha_interes_agendamiento: string; hora_interes_agendamiento: string; comentario_agendamiento: string;
  fecha_interes_derivacion: string; hora_interes_derivacion: string; comentario_derivacion: string;
  motivo_no_interes: string; comentario_no_interes: string;
  motivo_no_atendible: string; comentario_no_atendible: string;
  motivos_tercero_relacionado: string; fecha_rellamada: string; hora_rellamada: string; numero_titular_actual: string;
  motivo_no_contacto: string;
  motivo_no_cierre: string; comentario_venta_no_concretada: string;
}

type Paso =
  | 'dni' | 'sede' | 'asesor' | 'tipo' | 'resultado'
  | 'motivoContacto' | 'motivoNoContacto' | 'formulario' | 'detalle' | 'resumen'
  // Realzza:
  | 'rzDni' | 'rzCelular' | 'rzTipoBase' | 'rzEstado' | 'rzNoContacto'
  | 'rzMedioResultado' | 'rzInteres' | 'rzDerivacion' | 'rzAgendamiento'
  | 'rzNoConcretada' | 'rzNoInteres' | 'rzNoAtendible' | 'rzTercero' | 'rzTerceroAgenda' | 'rzResumen'
  // Call Center:
  | PasoCall;

interface RzModelo {
  asesor: string;
  dni_cliente: string;
  celular_gestionado: string;
  tipo_base: string;
  estado_gestion: string;
  medio_primer_contacto: string;
  resultado_gestion: string;
  producto_interes: string;
  motivo_interes: string;
  motivo_agendamiento: string;
  fecha_interes_agendamiento: string; hora_interes_agendamiento: string; comentario_agendamiento: string;
  fecha_interes_derivacion: string; hora_interes_derivacion: string; comentario_derivacion: string;
  motivo_no_interes: string; comentario_no_interes: string;
  motivo_no_atendible: string; comentario_no_atendible: string;
  motivos_tercero_relacionado: string; fecha_rellamada: string; hora_rellamada: string; numero_titular_actual: string;
  motivo_no_contacto: string;
  motivo_no_cierre: string; comentario_venta_no_concretada: string;
}

interface Modelo {
  dni_cliente: string;
  sede: string;                // nombre de la sede
  sedeKey: string;             // clave normalizada (para el CAP)
  asesor: string;
  tipo_gestion: string;
  resultado: string;
  motivo_contacto: string;
  motivo_no_contacto: string;
  fecha_compromiso: string;
  valor_venta: string | number;   // <input type=number> enlaza como número
  producto_interes: string;
  detalle_contacto: string;
  celular_actualizado: string;
}

@Component({
  selector: 'app-registro-gestion',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './registro-gestion.component.html',
  styleUrls: ['./registro-gestion.component.css'],
})
export class RegistroGestionComponent implements OnInit {
  private auth = inject(AuthService);
  private sedeCfg = inject(SedeConfigService);
  private cap = inject(CapSedesService);
  private api = inject(RegistroGestionService);

  readonly tipos = TIPOS_GESTION;
  readonly motivosContacto = MOTIVOS_CONTACTO;
  readonly motivosNoContacto = MOTIVOS_NO_CONTACTO;
  readonly productos = PRODUCTOS;

  // Catálogos Realzza expuestos al template
  readonly rzTipoBase = RZ_TIPO_BASE;
  readonly rzMedio = RZ_MEDIO;
  readonly rzResultado = RZ_RESULTADO;
  readonly rzProductos = RZ_PRODUCTOS;
  readonly rzMotivoInteres = RZ_MOTIVO_INTERES;
  readonly rzMotivoAgendamiento = RZ_MOTIVO_AGENDAMIENTO;
  readonly rzMotivoNoCierre = RZ_MOTIVO_NO_CIERRE;
  readonly rzMotivoNoInteres = RZ_MOTIVO_NO_INTERES;
  readonly rzMotivoNoAtendible = RZ_MOTIVO_NO_ATENDIBLE;
  readonly rzMotivosTercero = RZ_MOTIVOS_TERCERO;
  readonly rzMotivoNoContacto = RZ_MOTIVO_NO_CONTACTO;

  // Catálogos Call (comparte varios con Realzza)
  readonly callSedes = CALL_SEDES;
  readonly callTipoCliente = CALL_TIPO_CLIENTE;
  readonly callMedio = CALL_MEDIO;
  readonly callResultado = RZ_RESULTADO;
  readonly callProductos = CALL_PRODUCTOS;
  readonly callMotivoInteres = CALL_MOTIVO_INTERES;
  readonly callMotivoAgendamiento = RZ_MOTIVO_AGENDAMIENTO;
  readonly callMotivoNoCierre = RZ_MOTIVO_NO_CIERRE;
  readonly callMotivoNoInteres = RZ_MOTIVO_NO_INTERES;
  readonly callMotivoNoAtendible = RZ_MOTIVO_NO_ATENDIBLE;
  readonly callMotivosTercero = RZ_MOTIVOS_TERCERO;
  readonly callMotivoNoContacto = RZ_MOTIVO_NO_CONTACTO;

  sedes: { key: string; nombre: string }[] = [];
  asesores: string[] = [];
  cargandoAsesores = false;

  // Canal del formulario según el login: 'realzza', 'call' o 'sede' (piso, el actual).
  canal: 'sede' | 'realzza' | 'call' = 'sede';

  modelo: Modelo = this.modeloVacio();
  rz: RzModelo = this.rzVacio();
  call: CallModelo = this.callVacio();
  pasoIndex = 0;
  guardando = false;
  guardado = false;
  error = '';
  sedeFija = false;   // true cuando la sede sale del login (no se pregunta)

  ngOnInit(): void {
    this.sedes = this.sedeCfg.getSedesParaCombo().sort((a, b) => a.nombre.localeCompare(b.nombre));
    const u = this.auth.getUsuario();
    const key = this.sedeCfg.normalizar(u?.sede ?? '');

    // Realzza → formulario de campo; el asesor sale del login (nombre del vendedor).
    if (key === 'realzza') {
      this.canal = 'realzza';
      this.rz.asesor = u?.nombre ?? '';
      return;
    }
    // Call Center → formulario de call; el asesor sale del login.
    if (key === 'call') {
      this.canal = 'call';
      this.call.asesor = u?.nombre ?? '';
      return;
    }

    // Piso/Sedes (comportamiento actual): asesores del CAP; sede del login si es concreta.
    this.canal = 'sede';
    this.cap.cargar();
    if (key && key !== 'todas' && this.sedes.some(s => s.key === key)) {
      this.sedeFija = true;
      this.seleccionarSede(this.sedes.find(x => x.key === key)!);
    }
  }

  // ── Flujo de pasos (dinámico según respuestas) ──
  get pasos(): Paso[] {
    if (this.canal === 'realzza') return this.pasosRealzza();
    if (this.canal === 'call') return this.pasosCall();
    // Si la sede es fija (del login) no se pregunta la sede.
    const p: Paso[] = this.sedeFija
      ? ['dni', 'asesor', 'tipo', 'resultado']
      : ['dni', 'sede', 'asesor', 'tipo', 'resultado'];
    if (this.modelo.resultado === 'CONTACTO') {
      p.push('motivoContacto');
      if (MOTIVOS_CONTACTO_FORM.includes(this.modelo.motivo_contacto)) p.push('formulario');
      else if (MOTIVOS_CONTACTO_DETALLE.includes(this.modelo.motivo_contacto)) p.push('detalle');
    } else if (this.modelo.resultado === 'NO CONTACTO') {
      p.push('motivoNoContacto');
    }
    p.push('resumen');
    return p;
  }
  get pasoActual(): Paso { return this.pasos[this.pasoIndex]; }
  get totalPasos(): number { return this.pasos.length; }
  get esUltimo(): boolean { return this.pasoIndex === this.pasos.length - 1; }

  // ── Flujo Realzza (ramificación del formulario de campo) ──
  private pasosRealzza(): Paso[] {
    const p: Paso[] = ['rzDni', 'rzCelular', 'rzTipoBase', 'rzEstado'];
    const m = this.rz;
    if (m.estado_gestion === 'NO CONTACTO') {
      p.push('rzNoContacto');
    } else if (m.estado_gestion === 'CONTACTO') {
      p.push('rzMedioResultado');
      if (m.resultado_gestion === 'INTERESADO') {
        p.push('rzInteres');
        if (m.motivo_interes === 'VENTA DERIVADA PARA CIERRE A SEDE') p.push('rzDerivacion');
        else if (m.motivo_interes === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)') p.push('rzAgendamiento');
        else if (m.motivo_interes === 'VENTA NO CONCRETADA') p.push('rzNoConcretada');
      } else if (m.resultado_gestion === 'NO INTERESADO') p.push('rzNoInteres');
      else if (m.resultado_gestion === 'NO ATENDIBLE') p.push('rzNoAtendible');
      else if (m.resultado_gestion === 'TERCERO RELACIONADO') {
        p.push('rzTercero');
        if (RZ_TERCERO_CON_AGENDA.includes(m.motivos_tercero_relacionado)) p.push('rzTerceroAgenda');
      }
      // ENVIARÁ CATÁLOGO → sin pasos extra.
    }
    p.push('rzResumen');
    return p;
  }

  // Reset en cascada al cambiar decisiones Realzza.
  onRzEstadoChange(): void {
    this.rz.medio_primer_contacto = ''; this.rz.resultado_gestion = ''; this.rz.motivo_no_contacto = '';
    this.limpiarRzContacto();
  }
  onRzResultadoChange(): void { this.limpiarRzContacto(); }
  onRzMotivoInteresChange(): void { this.limpiarRzMotivoInteres(); }
  onRzTerceroChange(): void { this.rz.fecha_rellamada = ''; this.rz.hora_rellamada = ''; this.rz.numero_titular_actual = ''; }

  private limpiarRzContacto(): void {
    this.rz.producto_interes = ''; this.rz.motivo_interes = '';
    this.rz.motivo_no_interes = ''; this.rz.comentario_no_interes = '';
    this.rz.motivo_no_atendible = ''; this.rz.comentario_no_atendible = '';
    this.rz.motivos_tercero_relacionado = '';
    this.limpiarRzMotivoInteres();
    this.onRzTerceroChange();
  }
  private limpiarRzMotivoInteres(): void {
    this.rz.motivo_agendamiento = '';
    this.rz.fecha_interes_agendamiento = ''; this.rz.hora_interes_agendamiento = ''; this.rz.comentario_agendamiento = '';
    this.rz.fecha_interes_derivacion = ''; this.rz.hora_interes_derivacion = ''; this.rz.comentario_derivacion = '';
    this.rz.motivo_no_cierre = ''; this.rz.comentario_venta_no_concretada = '';
  }

  private pasoValidoRz(): boolean {
    const m = this.rz;
    switch (this.pasoActual) {
      case 'rzDni': return /^\d{8}$/.test(m.dni_cliente);
      case 'rzCelular': return /^\d{9}$/.test(m.celular_gestionado);
      case 'rzTipoBase': return !!m.tipo_base;
      case 'rzEstado': return !!m.estado_gestion;
      case 'rzNoContacto': return !!m.motivo_no_contacto;
      case 'rzMedioResultado': return !!m.medio_primer_contacto && !!m.resultado_gestion;
      case 'rzInteres': return !!m.producto_interes && !!m.motivo_interes;
      case 'rzDerivacion': return !!m.fecha_interes_derivacion && !!m.hora_interes_derivacion && m.comentario_derivacion.trim().length > 0;
      case 'rzAgendamiento': return !!m.motivo_agendamiento && !!m.fecha_interes_agendamiento && !!m.hora_interes_agendamiento && m.comentario_agendamiento.trim().length > 0;
      case 'rzNoConcretada': return !!m.motivo_no_cierre && m.comentario_venta_no_concretada.trim().length > 0;
      case 'rzNoInteres': return !!m.motivo_no_interes && m.comentario_no_interes.trim().length > 0;
      case 'rzNoAtendible': return !!m.motivo_no_atendible && m.comentario_no_atendible.trim().length > 0;
      case 'rzTercero': return !!m.motivos_tercero_relacionado;
      case 'rzTerceroAgenda': return !!m.fecha_rellamada && !!m.hora_rellamada && /^\d{9}$/.test(m.numero_titular_actual);
      case 'rzResumen': return true;
      default: return true;
    }
  }

  rzDniInvalido(): boolean { const d = this.rz.dni_cliente ?? ''; return d.length > 0 && !/^\d{8}$/.test(d); }
  rzCelInvalido(): boolean { const c = this.rz.celular_gestionado ?? ''; return c.length > 0 && !/^\d{9}$/.test(c); }
  rzTitularInvalido(): boolean { const c = this.rz.numero_titular_actual ?? ''; return c.length > 0 && !/^\d{9}$/.test(c); }

  // ── Flujo Call Center (ramificación del formulario de call) ──
  private pasosCall(): Paso[] {
    const p: Paso[] = ['callDni', 'callCelular', 'callSede', 'callKommo', 'callTipoCliente', 'callEstado'];
    const m = this.call;
    if (m.estado_gestion === 'NO CONTACTO') {
      p.push('callNoContacto');
    } else if (m.estado_gestion === 'CONTACTO') {
      p.push('callMedioResultado');
      if (m.resultado_gestion === 'INTERESADO') {
        p.push('callInteres');
        if (CALL_MOTIVO_DERIVACION.includes(m.motivo_interes)) p.push('callDerivacion');
        else if (m.motivo_interes === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)') p.push('callAgendamiento');
        else if (m.motivo_interes === 'VENTA NO CONCRETADA') p.push('callNoConcretada');
      } else if (m.resultado_gestion === 'NO INTERESADO') p.push('callNoInteres');
      else if (m.resultado_gestion === 'NO ATENDIBLE') p.push('callNoAtendible');
      else if (m.resultado_gestion === 'TERCERO RELACIONADO') {
        p.push('callTercero');
        if (RZ_TERCERO_CON_AGENDA.includes(m.motivos_tercero_relacionado)) p.push('callTerceroAgenda');
      }
    }
    p.push('callResumen');
    return p;
  }

  onCallEstadoChange(): void {
    this.call.medio_primer_contacto = ''; this.call.resultado_gestion = ''; this.call.motivo_no_contacto = '';
    this.limpiarCallContacto();
  }
  onCallResultadoChange(): void { this.limpiarCallContacto(); }
  onCallMotivoInteresChange(): void { this.limpiarCallMotivoInteres(); }
  onCallTerceroChange(): void { this.call.fecha_rellamada = ''; this.call.hora_rellamada = ''; this.call.numero_titular_actual = ''; }

  private limpiarCallContacto(): void {
    this.call.producto_interes = ''; this.call.motivo_interes = '';
    this.call.motivo_no_interes = ''; this.call.comentario_no_interes = '';
    this.call.motivo_no_atendible = ''; this.call.comentario_no_atendible = '';
    this.call.motivos_tercero_relacionado = '';
    this.limpiarCallMotivoInteres();
    this.onCallTerceroChange();
  }
  private limpiarCallMotivoInteres(): void {
    this.call.motivo_agendamiento = '';
    this.call.fecha_interes_agendamiento = ''; this.call.hora_interes_agendamiento = ''; this.call.comentario_agendamiento = '';
    this.call.fecha_interes_derivacion = ''; this.call.hora_interes_derivacion = ''; this.call.comentario_derivacion = '';
    this.call.motivo_no_cierre = ''; this.call.comentario_venta_no_concretada = '';
  }

  private pasoValidoCall(): boolean {
    const m = this.call;
    switch (this.pasoActual) {
      case 'callDni': return /^\d{8}$/.test(m.dni_cliente);
      case 'callCelular': return /^\d{9}$/.test(m.celular_gestionado);
      case 'callSede': return !!m.sede;
      case 'callKommo': return !!m.kommo;
      case 'callTipoCliente': return !!m.tipo_cliente;
      case 'callEstado': return !!m.estado_gestion;
      case 'callNoContacto': return !!m.motivo_no_contacto;
      case 'callMedioResultado': return !!m.medio_primer_contacto && !!m.resultado_gestion;
      case 'callInteres': return !!m.producto_interes && !!m.motivo_interes;
      case 'callDerivacion': return !!m.fecha_interes_derivacion && !!m.hora_interes_derivacion && m.comentario_derivacion.trim().length > 0;
      case 'callAgendamiento': return !!m.motivo_agendamiento && !!m.fecha_interes_agendamiento && !!m.hora_interes_agendamiento && m.comentario_agendamiento.trim().length > 0;
      case 'callNoConcretada': return !!m.motivo_no_cierre && m.comentario_venta_no_concretada.trim().length > 0;
      case 'callNoInteres': return !!m.motivo_no_interes && m.comentario_no_interes.trim().length > 0;
      case 'callNoAtendible': return !!m.motivo_no_atendible && m.comentario_no_atendible.trim().length > 0;
      case 'callTercero': return !!m.motivos_tercero_relacionado;
      case 'callTerceroAgenda': return !!m.fecha_rellamada && !!m.hora_rellamada && /^\d{9}$/.test(m.numero_titular_actual);
      case 'callResumen': return true;
      default: return true;
    }
  }

  callDniInvalido(): boolean { const d = this.call.dni_cliente ?? ''; return d.length > 0 && !/^\d{8}$/.test(d); }
  callCelInvalido(): boolean { const c = this.call.celular_gestionado ?? ''; return c.length > 0 && !/^\d{9}$/.test(c); }
  callTitularInvalido(): boolean { const c = this.call.numero_titular_actual ?? ''; return c.length > 0 && !/^\d{9}$/.test(c); }

  // ── Selección de sede → cargar asesores activos del CAP ──
  async seleccionarSede(s: { key: string; nombre: string }): Promise<void> {
    this.modelo.sede = s.nombre;
    this.modelo.sedeKey = s.key;
    this.modelo.asesor = '';
    this.cargandoAsesores = true;
    try {
      this.asesores = await this.cap.vendedoresActivos(s.key);
    } finally {
      this.cargandoAsesores = false;
    }
  }

  // Reset de campos aguas abajo cuando cambia una decisión.
  onResultadoChange(): void {
    this.modelo.motivo_contacto = '';
    this.modelo.motivo_no_contacto = '';
    this.limpiarCondicionales();
  }
  onMotivoContactoChange(): void { this.limpiarCondicionales(); }
  private limpiarCondicionales(): void {
    this.modelo.fecha_compromiso = '';
    this.modelo.valor_venta = '';
    this.modelo.producto_interes = '';
    this.modelo.detalle_contacto = '';
    this.modelo.celular_actualizado = '';
  }

  // ── Sanitizado y validación ──
  /** Deja solo dígitos y recorta al máximo indicado (para DNI/celular). */
  soloNum(v: string, max: number): string {
    return (v ?? '').toString().replace(/\D/g, '').slice(0, max);
  }
  dniInvalido(): boolean {
    const d = (this.modelo.dni_cliente ?? '').toString();
    return d.length > 0 && !/^\d{8}$/.test(d);
  }
  celularInvalido(): boolean {
    const c = (this.modelo.celular_actualizado ?? '').toString();
    return c.length > 0 && !/^\d{9}$/.test(c);
  }

  pasoValido(): boolean {
    if (this.canal === 'realzza') return this.pasoValidoRz();
    if (this.canal === 'call') return this.pasoValidoCall();
    const m = this.modelo;
    switch (this.pasoActual) {
      case 'dni': return /^\d{8}$/.test((m.dni_cliente ?? '').toString());
      case 'sede': return !!m.sede;
      case 'asesor': return !!m.asesor;
      case 'tipo': return !!m.tipo_gestion;
      case 'resultado': return !!m.resultado;
      case 'motivoContacto': return !!m.motivo_contacto;
      case 'motivoNoContacto': return !!m.motivo_no_contacto;
      case 'formulario': return !!m.fecha_compromiso && `${m.valor_venta ?? ''}`.trim().length > 0 && !!m.producto_interes;
      case 'detalle': return m.detalle_contacto.trim().length > 0 && /^\d{9}$/.test((m.celular_actualizado ?? '').toString());
      case 'resumen': return true;
      default: return true;
    }
  }

  siguiente(): void {
    if (!this.pasoValido()) { this.error = 'Completa este paso para continuar.'; return; }
    this.error = '';
    if (this.pasoIndex < this.pasos.length - 1) this.pasoIndex++;
  }
  atras(): void {
    this.error = '';
    if (this.pasoIndex > 0) this.pasoIndex--;
  }

  // ── Guardar ──
  async guardar(): Promise<void> {
    if (this.canal === 'realzza') { this.guardarRealzza(); return; }
    if (this.canal === 'call') { this.guardarCall(); return; }
    this.guardando = true;
    this.error = '';
    const m = this.modelo;
    const payload: GestionPayload = {
      registrado_por: this.auth.getUsuario()?.nombre ?? '',
      dni_cliente: m.dni_cliente.trim(),
      sede: m.sede,
      asesor: m.asesor,
      tipo_gestion: m.tipo_gestion,
      resultado: m.resultado,
      motivo_contacto: m.resultado === 'CONTACTO' ? m.motivo_contacto : '',
      motivo_no_contacto: m.resultado === 'NO CONTACTO' ? m.motivo_no_contacto : '',
      fecha_compromiso: m.fecha_compromiso || '',
      valor_venta: m.valor_venta || '',
      producto_interes: m.producto_interes || '',
      detalle_contacto: m.detalle_contacto || '',
      celular_actualizado: m.celular_actualizado || '',
    };
    this.api.registrar(payload).subscribe({
      next: () => { this.guardando = false; this.guardado = true; },
      error: () => { this.guardando = false; this.error = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.'; },
    });
  }

  // Guarda la gestión Realzza (POST /gestion-realzza).
  private guardarRealzza(): void {
    this.guardando = true;
    this.error = '';
    const m = this.rz;
    const payload: GestionRealzzaPayload = {
      asesor_realzza: m.asesor,
      dni_cliente: m.dni_cliente.trim(),
      estado_gestion: m.estado_gestion,
      sede: 'REALZZA',
      tipo_base: m.tipo_base,
      celular_gestionado: m.celular_gestionado,
      medio_primer_contacto: m.medio_primer_contacto,
      resultado_gestion: m.resultado_gestion,
      producto_interes: m.producto_interes,
      motivo_interes: m.motivo_interes,
      motivo_agendamiento: m.motivo_agendamiento,
      fecha_interes_agendamiento: this.aFechaDMY(m.fecha_interes_agendamiento),
      hora_interes_agendamiento: m.hora_interes_agendamiento,
      comentario_agendamiento: m.comentario_agendamiento,
      fecha_interes_derivacion: this.aFechaDMY(m.fecha_interes_derivacion),
      hora_interes_derivacion: m.hora_interes_derivacion,
      comentario_derivacion: m.comentario_derivacion,
      motivo_no_interes: m.motivo_no_interes,
      comentario_no_interes: m.comentario_no_interes,
      motivo_no_atendible: m.motivo_no_atendible,
      comentario_no_atendible: m.comentario_no_atendible,
      motivos_tercero_relacionado: m.motivos_tercero_relacionado,
      fecha_rellamada: this.aFechaDMY(m.fecha_rellamada),
      hora_rellamada: m.hora_rellamada,
      numero_titular_actual: m.numero_titular_actual,
      motivo_no_contacto: m.motivo_no_contacto,
      motivo_no_cierre: m.motivo_no_cierre,
      comentario_venta_no_concretada: m.comentario_venta_no_concretada,
    };
    this.api.registrarRealzza(payload).subscribe({
      next: () => { this.guardando = false; this.guardado = true; },
      error: () => { this.guardando = false; this.error = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.'; },
    });
  }

  // 'yyyy-mm-dd' (input date) → 'd/m/yyyy' (formato de la hoja, que leen los otros módulos).
  private aFechaDMY(v: string): string {
    if (!v) return '';
    const [y, mo, d] = v.split('-');
    if (!y || !mo || !d) return v;
    return `${+d}/${+mo}/${y}`;
  }

  // Guarda la gestión Call Center (POST /gestion-call).
  private guardarCall(): void {
    this.guardando = true;
    this.error = '';
    const m = this.call;
    const payload: GestionCallPayload = {
      asesor_contact: m.asesor,
      dni_cliente: m.dni_cliente.trim(),
      estado_gestion: m.estado_gestion,
      sede: m.sede,
      kommo: m.kommo,
      tipo_cliente: m.tipo_cliente,
      celular_gestionado: m.celular_gestionado,
      medio_primer_contacto: m.medio_primer_contacto,
      resultado_gestion: m.resultado_gestion,
      producto_interes: m.producto_interes,
      motivo_interes: m.motivo_interes,
      motivo_agendamiento: m.motivo_agendamiento,
      fecha_interes_agendamiento: this.aFechaDMY(m.fecha_interes_agendamiento),
      hora_interes_agendamiento: m.hora_interes_agendamiento,
      comentario_agendamiento: m.comentario_agendamiento,
      fecha_interes_derivacion: this.aFechaDMY(m.fecha_interes_derivacion),
      hora_interes_derivacion: m.hora_interes_derivacion,
      comentario_derivacion: m.comentario_derivacion,
      motivo_no_interes: m.motivo_no_interes,
      comentario_no_interes: m.comentario_no_interes,
      motivo_no_atendible: m.motivo_no_atendible,
      comentario_no_atendible: m.comentario_no_atendible,
      motivos_tercero_relacionado: m.motivos_tercero_relacionado,
      fecha_rellamada: this.aFechaDMY(m.fecha_rellamada),
      hora_rellamada: m.hora_rellamada,
      numero_titular_actual: m.numero_titular_actual,
      motivo_no_contacto: m.motivo_no_contacto,
      motivo_no_cierre: m.motivo_no_cierre,
      comentario_venta_no_concretada: m.comentario_venta_no_concretada,
    };
    this.api.registrarCall(payload).subscribe({
      next: () => { this.guardando = false; this.guardado = true; },
      error: () => { this.guardando = false; this.error = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.'; },
    });
  }

  registrarOtra(): void {
    if (this.canal === 'realzza') {
      const asesor = this.rz.asesor;
      this.rz = this.rzVacio();
      this.rz.asesor = asesor;   // conserva el asesor del login
      this.pasoIndex = 0;
      this.guardado = false;
      this.error = '';
      return;
    }
    if (this.canal === 'call') {
      const asesor = this.call.asesor;
      this.call = this.callVacio();
      this.call.asesor = asesor;
      this.pasoIndex = 0;
      this.guardado = false;
      this.error = '';
      return;
    }
    const sede = this.modelo.sede, sedeKey = this.modelo.sedeKey;
    this.modelo = this.modeloVacio();
    // Conserva la sede (y sus asesores ya cargados); un registro nuevo arranca desde el DNI.
    this.modelo.sede = sede; this.modelo.sedeKey = sedeKey;
    this.pasoIndex = 0;   // siempre vuelve al DNI (cliente nuevo)
    this.guardado = false;
    this.error = '';
  }

  private rzVacio(): RzModelo {
    return {
      asesor: '', dni_cliente: '', celular_gestionado: '', tipo_base: '', estado_gestion: '',
      medio_primer_contacto: '', resultado_gestion: '', producto_interes: '', motivo_interes: '',
      motivo_agendamiento: '', fecha_interes_agendamiento: '', hora_interes_agendamiento: '', comentario_agendamiento: '',
      fecha_interes_derivacion: '', hora_interes_derivacion: '', comentario_derivacion: '',
      motivo_no_interes: '', comentario_no_interes: '', motivo_no_atendible: '', comentario_no_atendible: '',
      motivos_tercero_relacionado: '', fecha_rellamada: '', hora_rellamada: '', numero_titular_actual: '',
      motivo_no_contacto: '', motivo_no_cierre: '', comentario_venta_no_concretada: '',
    };
  }

  private callVacio(): CallModelo {
    return {
      asesor: '', dni_cliente: '', celular_gestionado: '', sede: '', kommo: '', tipo_cliente: '', estado_gestion: '',
      medio_primer_contacto: '', resultado_gestion: '', producto_interes: '', motivo_interes: '',
      motivo_agendamiento: '', fecha_interes_agendamiento: '', hora_interes_agendamiento: '', comentario_agendamiento: '',
      fecha_interes_derivacion: '', hora_interes_derivacion: '', comentario_derivacion: '',
      motivo_no_interes: '', comentario_no_interes: '', motivo_no_atendible: '', comentario_no_atendible: '',
      motivos_tercero_relacionado: '', fecha_rellamada: '', hora_rellamada: '', numero_titular_actual: '',
      motivo_no_contacto: '', motivo_no_cierre: '', comentario_venta_no_concretada: '',
    };
  }

  private modeloVacio(): Modelo {
    return {
      dni_cliente: '', sede: '', sedeKey: '', asesor: '', tipo_gestion: '', resultado: '',
      motivo_contacto: '', motivo_no_contacto: '', fecha_compromiso: '', valor_venta: '',
      producto_interes: '', detalle_contacto: '', celular_actualizado: '',
    };
  }
}
