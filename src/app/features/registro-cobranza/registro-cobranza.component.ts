import { Component, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { RegistroGestionService } from '../../services/registro-gestion.service';

// Listas del formulario de Gestión de Cobranzas (en MAYÚSCULAS).
const ESTADOS_CONTACTO = ['CONTACTO', 'CONTACTO CON TERCERO', 'NO CONTACTO'];
const MOTIVOS_NO_PAGO = ['FALTA DE LIQUIDEZ', 'OLVIDO', 'DISCONFORMIDAD', 'DESEMPLEO'];
const RESULTADOS = ['COMPROMISO DE PAGO', 'NEGATIVA DE PAGO', 'YA PAGÓ'];

/**
 * Registro Gestión Cobranza. Sigue el patrón de los demás registros del proyecto
 * (modelo + getters condicionales, validación en rojo nativa de DevExtreme con
 * `intento`/`isValid` + pista del primer faltante, botón verde). Bloques:
 *   A) Datos del cliente (prefill de la cartera/BD a futuro).
 *   B) Tipificación del contacto.
 *   C) Resolución y compromiso — SOLO si el estado es "CONTACTO".
 * Ramas por estado: CONTACTO → motivo de no pago + resolución; CONTACTO CON TERCERO
 * → quién respondió + comentario; NO CONTACTO → sin más.
 */
@Component({
  selector: 'app-registro-cobranza',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './registro-cobranza.component.html',
  styleUrl: './registro-cobranza.component.css',
})
export class RegistroCobranzaComponent {
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private api = inject(RegistroGestionService);

  readonly estadosContacto = ESTADOS_CONTACTO;
  readonly motivosNoPago = MOTIVOS_NO_PAGO;
  readonly resultados = RESULTADOS;

  guardando = false;
  guardado = false;
  intento = false;   // tras la 1ª interacción se pintan en rojo los campos inválidos

  c = this.vacio();

  private vacio() {
    return {
      // Bloque A — identificación (a futuro se autocompletan desde la cartera por DNI)
      dni_cliente: '', nombre_cliente: '', celular: '', monto_adeudado: null as number | null,
      // Bloque B — tipificación del contacto
      estado_contacto: '', motivo_no_pago: '',
      // Rama CONTACTO CON TERCERO
      quien_respondio: '', comentario_tercero: '',
      // Bloque C — resolución y compromiso (solo CONTACTO)
      resultado_gestion: '', fecha_compromiso: null as Date | null, monto_pagar: null as number | null,
      observaciones: '',
    };
  }

  // ── Visibilidad condicional según el estado del contacto ──
  get esContacto(): boolean { return this.c.estado_contacto === 'CONTACTO'; }
  get esTercero(): boolean { return this.c.estado_contacto === 'CONTACTO CON TERCERO'; }
  get esCompromiso(): boolean { return this.c.resultado_gestion === 'COMPROMISO DE PAGO'; }

  soloNumeros(campo: 'dni_cliente' | 'celular', max: number): void {
    this.c[campo] = (this.c[campo] ?? '').toString().replace(/\D/g, '').slice(0, max);
    this.intento = true;
  }
  touched(): void { this.intento = true; }

  // ── Validez por campo (para marcar en rojo el que falte) ──
  get invDni(): boolean { return !/^\d{8}$/.test(this.c.dni_cliente || ''); }
  get invCelular(): boolean { return !!this.c.celular && !/^\d{9}$/.test(this.c.celular); }
  get invEstado(): boolean { return !this.c.estado_contacto; }
  get invMotivoNoPago(): boolean { return this.esContacto && !this.c.motivo_no_pago; }
  get invResultado(): boolean { return this.esContacto && !this.c.resultado_gestion; }
  get invFechaComp(): boolean { return this.esContacto && this.esCompromiso && !this.c.fecha_compromiso; }
  get invMontoPagar(): boolean { return this.esContacto && this.esCompromiso && !(this.c.monto_pagar && this.c.monto_pagar > 0); }
  get invQuienRespondio(): boolean { return this.esTercero && !this.c.quien_respondio.trim(); }

  get valido(): boolean {
    return !this.invDni && !this.invCelular && !this.invEstado && !this.invMotivoNoPago
      && !this.invResultado && !this.invFechaComp && !this.invMontoPagar && !this.invQuienRespondio;
  }
  /** Primer campo pendiente (pista junto al botón deshabilitado). */
  get primerError(): string {
    if (this.invDni) return 'El DNI debe tener 8 dígitos.';
    if (this.invCelular) return 'El celular debe tener 9 dígitos.';
    if (this.invEstado) return 'Selecciona el estado de contacto.';
    if (this.invQuienRespondio) return 'Indica quién respondió.';
    if (this.invMotivoNoPago) return 'Indica el motivo de no pago.';
    if (this.invResultado) return 'Selecciona el resultado de gestión.';
    if (this.invFechaComp) return 'Indica la fecha de compromiso.';
    if (this.invMontoPagar) return 'Indica el monto a pagar.';
    return '';
  }

  private fmtFecha(v: Date | null): string {
    if (!v) return '';
    const d = new Date(v);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  guardar(): void {
    this.intento = true;
    if (!this.valido || this.guardando) return;
    this.guardando = true;
    const payload = {
      registrado_por: (this.auth.getUsuario()?.nombre || '').toString(),
      dni_cliente: this.c.dni_cliente.trim(),
      nombre_cliente: this.c.nombre_cliente.trim(),
      celular: this.c.celular,
      monto_adeudado: this.c.monto_adeudado ?? 0,
      estado_contacto: this.c.estado_contacto,
      // Solo los campos de la rama que corresponde al estado.
      motivo_no_pago: this.esContacto ? this.c.motivo_no_pago : '',
      quien_respondio: this.esTercero ? this.c.quien_respondio.trim() : '',
      comentario_tercero: this.esTercero ? this.c.comentario_tercero.trim() : '',
      resultado_gestion: this.esContacto ? this.c.resultado_gestion : '',
      fecha_compromiso: this.esContacto && this.esCompromiso ? this.fmtFecha(this.c.fecha_compromiso) : '',
      monto_pagar: this.esContacto && this.esCompromiso ? (this.c.monto_pagar ?? 0) : 0,
      observaciones: this.c.observaciones,
    };
    this.api.registrarCobranza(payload).subscribe({
      next: () => { this.guardando = false; this.guardado = true; this.toast('✔ Gestión de cobranza registrada.'); },
      error: () => { this.guardando = false; this.toast('❌ No se pudo registrar. Revisa tu conexión e intenta de nuevo.', true); },
    });
  }

  registrarOtra(): void {
    // Conserva el DNI/cliente por si registra otra gestión del mismo caso; limpia el resto.
    const { dni_cliente, nombre_cliente, celular, monto_adeudado } = this.c;
    this.c = this.vacio();
    Object.assign(this.c, { dni_cliente, nombre_cliente, celular, monto_adeudado });
    this.guardado = false; this.intento = false;
  }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: error ? 5000 : 3000, horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}