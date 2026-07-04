import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { RegistroGestionService, GestionPayload } from '../../services/registro-gestion.service';

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

type Paso =
  | 'dni' | 'sede' | 'asesor' | 'tipo' | 'resultado'
  | 'motivoContacto' | 'motivoNoContacto' | 'formulario' | 'detalle' | 'resumen';

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

  sedes: { key: string; nombre: string }[] = [];
  asesores: string[] = [];
  cargandoAsesores = false;

  modelo: Modelo = this.modeloVacio();
  pasoIndex = 0;
  guardando = false;
  guardado = false;
  error = '';
  sedeFija = false;   // true cuando la sede sale del login (no se pregunta)

  ngOnInit(): void {
    this.sedes = this.sedeCfg.getSedesParaCombo().sort((a, b) => a.nombre.localeCompare(b.nombre));
    this.cap.cargar();
    // La sede sale del login: si el usuario tiene una sede concreta, se fija y se
    // ocultan el paso de sede (va directo a los asesores de esa sede).
    const u = this.auth.getUsuario();
    const key = this.sedeCfg.normalizar(u?.sede ?? '');
    if (key && key !== 'todas' && this.sedes.some(s => s.key === key)) {
      this.sedeFija = true;
      this.seleccionarSede(this.sedes.find(x => x.key === key)!);
    }
  }

  // ── Flujo de pasos (dinámico según respuestas) ──
  get pasos(): Paso[] {
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

  registrarOtra(): void {
    const sede = this.modelo.sede, sedeKey = this.modelo.sedeKey;
    this.modelo = this.modeloVacio();
    // Conserva la sede (y sus asesores ya cargados); un registro nuevo arranca desde el DNI.
    this.modelo.sede = sede; this.modelo.sedeKey = sedeKey;
    this.pasoIndex = 0;   // siempre vuelve al DNI (cliente nuevo)
    this.guardado = false;
    this.error = '';
  }

  private modeloVacio(): Modelo {
    return {
      dni_cliente: '', sede: '', sedeKey: '', asesor: '', tipo_gestion: '', resultado: '',
      motivo_contacto: '', motivo_no_contacto: '', fecha_compromiso: '', valor_venta: '',
      producto_interes: '', detalle_contacto: '', celular_actualizado: '',
    };
  }
}
