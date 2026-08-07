import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { RegistroGestionService } from '../../services/registro-gestion.service';

// Listas del formulario Call Sedes / MARKET PLACE (mismas del form "ferre").
const SEDES_MP = ['Ferreñafe', 'Motupe', 'Cayalti', 'Oyotun', 'Chongoyape', 'Lambayeque', 'Olmos', 'Jayanca', 'Mochumi', 'Morrope'];
const TIPO_CLIENTE = ['DORMIDO', 'VIGENTE', 'NO VIGENTE', 'LOVER A', 'LOVER B', 'CANCELADO', 'REENGANCHE', 'NUEVO', 'BRILLA', 'EFECTIVA', 'SORTEO - LA VICTORIA', 'AFILIACIONES'];
const MEDIO = ['WHATSAPP', 'LLAMADA', 'MENSAJE DE TEXTO', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK'];
const RESULTADO = ['INTERESADO', 'NO INTERESADO', 'NO ATENDIBLE', 'TERCERO RELACIONADO', 'ENVIARÁ CATÁLOGO'];
const PRODUCTOS = ['REFRIGERADORA', 'VISICOOLER', 'COCINA', 'LAVADORA', 'CONGELADORA', 'TELEVISOR', 'EQUIPO SONIDO', 'LAPTOP', 'IMPRESORA', 'TELEFONO CELULAR', 'MOTOCICLETA', 'MOTOTAXI', 'JUEGO MUEBLES', 'JUEGO COMEDOR', 'MELANIMA', 'CAMA', 'COLCHON', 'CAMA + COLCHON', 'PEQUEÑOS ARTEFACTOS', 'MOTO CARGUERA'];
const MOTIVO_INTERES = ['VENTA DERIVADA PARA CIERRE A SEDE', 'VISITARÁ TIENDA', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO', 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)', 'VENTA NO CONCRETADA'];
const MOTIVO_NO_CONTACTO = ['NO CONTESTA', 'NÚMERO EQUIVOCADO', 'CELULAR SUPENDIDO - NO EXISTE', 'CELULAR APAGADO'];
const MOTIVO_NO_CIERRE = ['MUY CARO', 'FALTA DE STOCK O DISPONIBILIDAD DE PRODUCTO', 'DESISTIO DE LA COMPRA (CAMBIO DE OPINION EL TITULAR)', 'NO CALIFICA (PROBLEMAS CREDITICIOS O REQUISITOS)', 'INCONTACTABLE POSTERIOR AL INTERES (DEJO DE CONTESTAR)', 'FALTA DE INICIAL'];
const AGENDA = 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)';
const DERIVA = ['VENTA DERIVADA PARA CIERRE A SEDE', 'VISITARÁ TIENDA', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO'];
const VNC = 'VENTA NO CONCRETADA';

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
  readonly motivosNoContacto = MOTIVO_NO_CONTACTO;
  readonly motivosNoCierre = MOTIVO_NO_CIERRE;
  readonly estados = ['CONTACTO', 'NO CONTACTO'];

  asesorFijo = false;   // vendedor de sede → su propio nombre
  sedeFija = false;
  asesoresSede: string[] = [];
  guardando = false;
  guardado = false;
  error = '';

  m = this.vacio();

  private vacio() {
    return {
      asesor: '', sede: '', dni_cliente: '', celular_gestionado: '', tipo_cliente: '',
      estado_gestion: '', medio_primer_contacto: '', resultado_gestion: '', producto_interes: '',
      motivo_interes: '', motivo_no_contacto: '',
      fecha_agendamiento: '', hora_agendamiento: '', comentario_agendamiento: '',
      fecha_derivacion: '', hora_derivacion: '', comentario_derivacion: '',
      motivo_no_cierre: '', comentario_venta_no_concretada: '',
    };
  }

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    const rol = (u?.rol || '').toLowerCase();
    const canalU = (u?.canal || '').toLowerCase();
    // Vendedor de sede: sede + asesor fijos (del login). Admin: elige.
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
  get esAgenda(): boolean { return this.esContacto && this.m.motivo_interes === AGENDA; }
  get esDeriva(): boolean { return this.esContacto && DERIVA.includes(this.m.motivo_interes); }
  get esVnc(): boolean { return this.esContacto && this.m.motivo_interes === VNC; }

  get valido(): boolean {
    return !!this.m.asesor && !!this.m.sede && !!this.m.dni_cliente.trim() && !!this.m.estado_gestion;
  }

  guardar(): void {
    if (!this.valido || this.guardando) return;
    this.guardando = true; this.error = '';
    const payload: any = {
      registrado_por: (this.auth.getUsuario()?.nombre || '').toString(),
      asesor: this.m.asesor, sede: this.m.sede, market_place: 'SI',
      dni_cliente: this.m.dni_cliente.trim(), celular_gestionado: this.m.celular_gestionado,
      tipo_cliente: this.m.tipo_cliente, estado_gestion: this.m.estado_gestion,
      medio_primer_contacto: this.m.medio_primer_contacto, resultado_gestion: this.m.resultado_gestion,
      producto_interes: this.m.producto_interes, motivo_interes: this.esContacto ? this.m.motivo_interes : '',
      motivo_no_contacto: this.esNoContacto ? this.m.motivo_no_contacto : '',
      motivo_agendamiento: '', fecha_agendamiento: this.esAgenda ? this.m.fecha_agendamiento : '',
      hora_agendamiento: this.esAgenda ? this.m.hora_agendamiento : '', comentario_agendamiento: this.esAgenda ? this.m.comentario_agendamiento : '',
      fecha_derivacion: this.esDeriva ? this.m.fecha_derivacion : '', hora_derivacion: this.esDeriva ? this.m.hora_derivacion : '',
      comentario_derivacion: this.esDeriva ? this.m.comentario_derivacion : '',
      motivo_no_cierre: this.esVnc ? this.m.motivo_no_cierre : '', comentario_venta_no_concretada: this.esVnc ? this.m.comentario_venta_no_concretada : '',
    };
    this.api.registrarCallSede(payload).subscribe({
      next: () => { this.guardando = false; this.guardado = true; },
      error: () => { this.guardando = false; this.error = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.'; },
    });
  }

  registrarOtra(): void {
    const asesor = this.m.asesor, sede = this.m.sede;
    this.m = this.vacio();
    this.m.asesor = asesor; this.m.sede = sede;   // conserva asesor + sede
    this.guardado = false; this.error = '';
  }
}
