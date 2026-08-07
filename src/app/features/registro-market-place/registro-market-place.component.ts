import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { RegistroGestionService } from '../../services/registro-gestion.service';

// Listas del formulario Call Sedes / MARKET PLACE (hoja "ferre").
const SEDES_MP = ['Ferreñafe', 'Motupe', 'Cayalti', 'Oyotun', 'Chongoyape', 'Lambayeque', 'Olmos', 'Jayanca', 'Mochumi', 'Morrope'];
const TIPO_CLIENTE = ['DORMIDO', 'VIGENTE', 'NO VIGENTE', 'LOVER A', 'LOVER B', 'CANCELADO', 'REENGANCHE', 'NUEVO', 'BRILLA', 'EFECTIVA', 'SORTEO - LA VICTORIA', 'AFILIACIONES'];
const MEDIO = ['WHATSAPP', 'LLAMADA', 'MENSAJE DE TEXTO', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK'];
const RESULTADO = ['INTERESADO', 'NO INTERESADO', 'NO ATENDIBLE', 'TERCERO RELACIONADO', 'ENVIARÁ CATÁLOGO'];
const PRODUCTOS = ['REFRIGERADORA', 'VISICOOLER', 'COCINA', 'LAVADORA', 'CONGELADORA', 'TELEVISOR', 'EQUIPO SONIDO', 'LAPTOP', 'IMPRESORA', 'TELEFONO CELULAR', 'MOTOCICLETA', 'MOTOTAXI', 'JUEGO MUEBLES', 'JUEGO COMEDOR', 'MELANIMA', 'CAMA', 'COLCHON', 'CAMA + COLCHON', 'PEQUEÑOS ARTEFACTOS', 'MOTO CARGUERA'];
const MOTIVO_INTERES = ['VENTA DERIVADA PARA CIERRE A SEDE', 'VISITARÁ TIENDA', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO', 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)', 'VENTA NO CONCRETADA'];
const MOTIVO_AGENDAMIENTO = ['VISITARÁ TIENDA', 'ENVIARÁ CATALOGO', 'INTERÉS A FUTURO'];
const MOTIVO_NO_INTERES = ['ATENCIÓN POST VENTA', 'SERVICIO TÉCNICO NO ATENDIDO', 'YA COMPRÓ EN EL MES', 'PRECIO ALTO', 'NO EXPLICA - SIN RAZON', 'CORTA LLAMADA', 'FUERA DE ZONA'];
const MOTIVO_NO_ATENDIBLE = ['CAMBIO DE ZONA/DOMICILIO DE ATENCIÓN', 'MUERTE', 'RECHAZADO CRÉDITOS'];
const MOTIVOS_TERCERO = ['LE DEJARÁ MENSAJE - VOLVER A LLAMAR', 'SE OBTUVO NÚMERO DE TITULAR', 'NO DA INFORMACIÓN - NEGATIVA'];
const MOTIVO_NO_CONTACTO = ['NO CONTESTA', 'NÚMERO EQUIVOCADO', 'CELULAR SUPENDIDO - NO EXISTE', 'CELULAR APAGADO'];
const MOTIVO_NO_CIERRE = ['MUY CARO', 'FALTA DE STOCK O DISPONIBILIDAD DE PRODUCTO', 'DESISTIO DE LA COMPRA (CAMBIO DE OPINION EL TITULAR)', 'NO CALIFICA (PROBLEMAS CREDITICIOS O REQUISITOS)', 'INCONTACTABLE POSTERIOR AL INTERES (DEJO DE CONTESTAR)', 'FALTA DE INICIAL'];
const AGENDA = 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)';
const DERIVA = ['VENTA DERIVADA PARA CIERRE A SEDE', 'VISITARÁ TIENDA', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO'];
const VNC = 'VENTA NO CONCRETADA';
// Los TERCERO que requieren re-llamada / número de titular.
const TERCERO_CON_RELLAMADA = ['LE DEJARÁ MENSAJE - VOLVER A LLAMAR', 'SE OBTUVO NÚMERO DE TITULAR'];

@Component({
  selector: 'app-registro-market-place',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './registro-market-place.component.html',
  styleUrl: './registro-market-place.component.css',
})
export class RegistroMarketPlaceComponent implements OnInit {
  private auth = inject(AuthService);
  private sedeCfg = inject(SedeConfigService);
  private cap = inject(CapSedesService);
  private api = inject(RegistroGestionService);

  readonly sedes = SEDES_MP;
  readonly tipoCliente = TIPO_CLIENTE;
  readonly medios = MEDIO;
  readonly resultados = RESULTADO;
  readonly productos = PRODUCTOS;
  readonly motivosInteres = MOTIVO_INTERES;
  readonly motivosAgendamiento = MOTIVO_AGENDAMIENTO;
  readonly motivosNoInteres = MOTIVO_NO_INTERES;
  readonly motivosNoAtendible = MOTIVO_NO_ATENDIBLE;
  readonly motivosTercero = MOTIVOS_TERCERO;
  readonly motivosNoContacto = MOTIVO_NO_CONTACTO;
  readonly motivosNoCierre = MOTIVO_NO_CIERRE;
  readonly estados = ['CONTACTO', 'NO CONTACTO'];

  asesorFijo = false;
  sedeFija = false;
  asesoresSede: string[] = [];
  guardando = false;
  guardado = false;
  error = '';

  m = this.vacio();

  private vacio() {
    return {
      asesor: '', sede: '', market_place: 'SI', dni_cliente: '', celular_gestionado: '', tipo_cliente: '',
      medio_primer_contacto: '', fecha_primer_contacto: null as Date | null, estado_gestion: '', resultado_gestion: '',
      producto_interes: '', motivo_interes: '',
      // Agendamiento
      motivo_agendamiento: '', fecha_agendamiento: null as Date | null, hora_agendamiento: '', comentario_agendamiento: '',
      // Derivación
      fecha_derivacion: null as Date | null, hora_derivacion: '', comentario_derivacion: '',
      // No interés / No atendible / Tercero
      motivo_no_interes: '', comentario_no_interes: '',
      motivo_no_atendible: '', comentario_no_atendible: '',
      motivos_tercero: '',
      // Re-llamada
      fecha_rellamada: null as Date | null, hora_rellamada: '', numero_titular: '',
      // No contacto / Venta no concretada
      motivo_no_contacto: '', motivo_no_cierre: '', comentario_venta_no_concretada: '',
    };
  }

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    const rol = (u?.rol || '').toLowerCase();
    const canalU = (u?.canal || '').toLowerCase();
    if (rol !== 'admin' && canalU === 'sede') {
      this.asesorFijo = true; this.sedeFija = true;
      this.m.asesor = (u?.vendedor || u?.nombre || '').toString();
      const cfg = this.sedeCfg.getConfig(u!.sede);
      this.m.sede = cfg?.nombre || u!.sede;
    }
  }

  async onSedeChange(): Promise<void> {
    if (this.asesorFijo) return;
    const key = this.sedeCfg.normalizar(this.m.sede);
    this.asesoresSede = key ? await this.cap.vendedoresActivos(key) : [];
    this.m.asesor = '';
  }

  get esNoContacto(): boolean { return this.m.estado_gestion === 'NO CONTACTO'; }
  get esContacto(): boolean { return this.m.estado_gestion === 'CONTACTO'; }
  get esInteresado(): boolean { return this.esContacto && this.m.resultado_gestion === 'INTERESADO'; }
  get esNoInteresado(): boolean { return this.esContacto && this.m.resultado_gestion === 'NO INTERESADO'; }
  get esNoAtendible(): boolean { return this.esContacto && this.m.resultado_gestion === 'NO ATENDIBLE'; }
  get esTercero(): boolean { return this.esContacto && this.m.resultado_gestion === 'TERCERO RELACIONADO'; }
  get esAgenda(): boolean { return this.esInteresado && this.m.motivo_interes === AGENDA; }
  get esDeriva(): boolean { return this.esInteresado && DERIVA.includes(this.m.motivo_interes); }
  get esVnc(): boolean { return this.esInteresado && this.m.motivo_interes === VNC; }
  /** Re-llamada: en NO CONTACTO o en TERCERO con motivo que lo requiere. */
  get esRellamada(): boolean {
    return this.esNoContacto || (this.esTercero && TERCERO_CON_RELLAMADA.includes(this.m.motivos_tercero));
  }

  get valido(): boolean {
    return !!this.m.asesor && !!this.m.sede && !!this.m.dni_cliente.trim() && !!this.m.estado_gestion;
  }

  private fmtFecha(v: any): string {
    if (!v) return '';
    const d = new Date(v);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  guardar(): void {
    if (!this.valido || this.guardando) return;
    this.guardando = true; this.error = '';
    const m = this.m;
    const payload: any = {
      registrado_por: (this.auth.getUsuario()?.nombre || '').toString(),
      asesor: m.asesor, sede: m.sede, market_place: 'SI',
      dni_cliente: m.dni_cliente.trim(), celular_gestionado: m.celular_gestionado, tipo_cliente: m.tipo_cliente,
      medio_primer_contacto: m.medio_primer_contacto, fecha_primer_contacto: this.fmtFecha(m.fecha_primer_contacto),
      estado_gestion: m.estado_gestion,
      resultado_gestion: this.esContacto ? m.resultado_gestion : '',
      producto_interes: this.esInteresado ? m.producto_interes : '',
      motivo_interes: this.esInteresado ? m.motivo_interes : '',
      // Agendamiento
      motivo_agendamiento: this.esAgenda ? m.motivo_agendamiento : '',
      fecha_agendamiento: this.esAgenda ? this.fmtFecha(m.fecha_agendamiento) : '',
      hora_agendamiento: this.esAgenda ? m.hora_agendamiento : '',
      comentario_agendamiento: this.esAgenda ? m.comentario_agendamiento : '',
      // Derivación
      fecha_derivacion: this.esDeriva ? this.fmtFecha(m.fecha_derivacion) : '',
      hora_derivacion: this.esDeriva ? m.hora_derivacion : '',
      comentario_derivacion: this.esDeriva ? m.comentario_derivacion : '',
      // No interés / no atendible / tercero
      motivo_no_interes: this.esNoInteresado ? m.motivo_no_interes : '',
      comentario_no_interes: this.esNoInteresado ? m.comentario_no_interes : '',
      motivo_no_atendible: this.esNoAtendible ? m.motivo_no_atendible : '',
      comentario_no_atendible: this.esNoAtendible ? m.comentario_no_atendible : '',
      motivos_tercero: this.esTercero ? m.motivos_tercero : '',
      // Re-llamada
      fecha_rellamada: this.esRellamada ? this.fmtFecha(m.fecha_rellamada) : '',
      hora_rellamada: this.esRellamada ? m.hora_rellamada : '',
      numero_titular: this.esRellamada ? m.numero_titular : '',
      // No contacto / VNC
      motivo_no_contacto: this.esNoContacto ? m.motivo_no_contacto : '',
      motivo_no_cierre: this.esVnc ? m.motivo_no_cierre : '',
      comentario_venta_no_concretada: this.esVnc ? m.comentario_venta_no_concretada : '',
    };
    this.api.registrarCallSede(payload).subscribe({
      next: () => { this.guardando = false; this.guardado = true; },
      error: () => { this.guardando = false; this.error = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.'; },
    });
  }

  registrarOtra(): void {
    const asesor = this.m.asesor, sede = this.m.sede;
    this.m = this.vacio();
    this.m.asesor = asesor; this.m.sede = sede;
    this.guardado = false; this.error = '';
  }
}
