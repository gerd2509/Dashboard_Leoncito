import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { RegistroGestionService } from '../../services/registro-gestion.service';

// Este formulario (hoja sedesDeriv) es SOLO para Lambayeque y Ferreñafe.
const SEDES_DERIV = ['Ferreñafe', 'Lambayeque'];
const FUENTES = ['BBDD', 'REFERIDOS', 'TIENDA', 'CASERIOS', 'RECURRENTES NO ASIGNADOS', 'KOMMO', 'BBDD KOMMO', 'MARKET PLACE', 'BRILLA', 'EFECTIVA', 'REDES SSENDA'];
const TIPO_CLIENTE = ['NUEVO', 'VIGENTE', 'RECURRENTE', 'DORMIDO', 'BRILLA', 'EFECTIVA'];
const MEDIO = ['WHATSAPP', 'LLAMADA', 'MENSAJE DE TEXTO', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'PRESENCIAL'];
const PRODUCTOS = ['REFRIGERADORA', 'COCINA', 'LAVADORA', 'CONGELADORA', 'TELEVISOR', 'EQUIPO SONIDO', 'LAPTOP', 'IMPRESORA', 'TELEFONO CELULAR', 'MOTOCICLETA', 'MOTOTAXI', 'JUEGO MUEBLES', 'JUEGO COMEDOR', 'CAMA', 'COLCHON', 'CAMA + COLCHON', 'PEQUEÑOS ARTEFACTOS'];

@Component({
  selector: 'app-registro-derivaciones',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './registro-derivaciones.component.html',
  styleUrl: './registro-derivaciones.component.css',
})
export class RegistroDerivacionesComponent implements OnInit {
  private auth = inject(AuthService);
  private sedeCfg = inject(SedeConfigService);
  private cap = inject(CapSedesService);
  private api = inject(RegistroGestionService);

  readonly sedes = SEDES_DERIV;
  readonly fuentes = FUENTES;
  readonly tipoCliente = TIPO_CLIENTE;
  readonly medios = MEDIO;
  readonly productos = PRODUCTOS;

  asesorFijo = false;
  sedeFija = false;
  asesoresSede: string[] = [];
  guardando = false;
  guardado = false;
  error = '';

  m = this.vacio();

  private vacio() {
    return {
      asesor: '', sede: '', dni_cliente: '', celular_gestionado: '', tipo_base: '', tipo_cliente: '',
      medio_primer_contacto: '', producto_interes: '',
      fecha_interes_derivacion: null as Date | null, hora_interes_derivacion: '', comentario_derivacion: '',
    };
  }

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    const rol = (u?.rol || '').toLowerCase();
    const canalU = (u?.canal || '').toLowerCase();
    if (rol !== 'admin' && canalU === 'sede') {
      const cfg = this.sedeCfg.getConfig(u!.sede);
      const nombre = cfg?.nombre || u!.sede;
      // Solo bloquea si su sede es una de las 2 del formulario.
      if (this.sedes.some(s => s.toUpperCase() === nombre.toUpperCase())) {
        this.asesorFijo = true; this.sedeFija = true;
        this.m.asesor = (u?.vendedor || u?.nombre || '').toString();
        this.m.sede = nombre;
      }
    }
  }

  async onSedeChange(): Promise<void> {
    if (this.asesorFijo) return;
    const key = this.sedeCfg.normalizar(this.m.sede);
    this.asesoresSede = key ? await this.cap.vendedoresActivos(key) : [];
    this.m.asesor = '';
  }

  get valido(): boolean {
    return !!this.m.asesor && !!this.m.sede && !!this.m.dni_cliente.trim();
  }

  private fmtFecha(v: any): string {
    if (!v) return '';
    const d = new Date(v);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  guardar(): void {
    if (!this.valido || this.guardando) return;
    this.guardando = true; this.error = '';
    const payload = {
      sede: this.m.sede, asesor: this.m.asesor, dni_cliente: this.m.dni_cliente.trim(),
      celular_gestionado: this.m.celular_gestionado, tipo_base: this.m.tipo_base, tipo_cliente: this.m.tipo_cliente,
      estado_gestion: 'CONTACTO', medio_primer_contacto: this.m.medio_primer_contacto,
      resultado_gestion: 'INTERESADO', producto_interes: this.m.producto_interes,
      motivo_interes: 'VENTA DERIVADA PARA CIERRE A SEDE',
      fecha_interes_derivacion: this.fmtFecha(this.m.fecha_interes_derivacion),
      hora_interes_derivacion: this.m.hora_interes_derivacion, comentario_derivacion: this.m.comentario_derivacion,
    };
    this.api.registrarDerivacion(payload).subscribe({
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
