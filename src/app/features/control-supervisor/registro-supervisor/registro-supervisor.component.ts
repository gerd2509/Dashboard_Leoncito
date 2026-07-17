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
  // En Gestión solo aplican estos tipos de base.
  readonly tiposBase = ['BBDD', 'KOMMO', 'BBDD KOMMO', "MARKET PLACE"];
  readonly estados = ['CONTACTO', 'NO CONTACTO'];
  readonly estadosLead = ['LEAD RESPONDIDO', 'CLIENTE SOLO DIO DNI', 'CLIENTE AÚN NO RESPONDE', 'OTRO'];

  // Subtipo dentro de la pestaña Market Place.
  mpSubtipo: 'MARKET PLACE' | 'KOMMO PLATAFORMA' = 'MARKET PLACE';
  setMpSubtipo(v: 'MARKET PLACE' | 'KOMMO PLATAFORMA'): void { this.mpSubtipo = v; }
  readonly margenMp = MARGEN_MP_DIAS;

  guardando = false;
  tipo: 'GESTION' | 'MARKET_PLACE' = 'GESTION';
  readonly hoy = new Date();

  // Modelo de control de GESTIÓN.
  g = { asesor: '', tipo_base: '', dni_cliente: '', celular: '', estado_gestion: '', comentario: '' };

  // Modelo de control de MARKET PLACE / KOMMO PLATAFORMA.
  mp: {
    asesor: string; fechaPub: Date | null; sinPub: boolean; sePublico: boolean;
    cliente: string; estadoLead: string; comentario: string; fotos: string[];
  } = {
    asesor: '', fechaPub: null, sinPub: false, sePublico: false,
    cliente: '', estadoLead: '', comentario: '', fotos: [],
  };

  // Tamaño máximo total de las fotos (aprox., para no exceder el límite del backend).
  readonly MAX_FOTOS_MB = 9;
  procesandoFotos = false;

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

  // ── Fotos (pruebas) ──────────────────────────────────────────────────────────
  // Tamaño aproximado (MB) de todas las fotos ya comprimidas.
  get fotosMb(): number {
    const bytes = this.mp.fotos.reduce((s, d) => s + d.length * 0.75, 0);
    return Math.round((bytes / (1024 * 1024)) * 10) / 10;
  }

  async onFotosSeleccionadas(event: any): Promise<void> {
    const files: FileList = event.target?.files;
    if (!files || !files.length) return;
    this.procesandoFotos = true;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) { this.toast(`"${f.name}" no es una imagen.`, true); continue; }
      try {
        const dataUri = await this.comprimirImagen(f);
        this.mp.fotos.push(dataUri);
      } catch {
        this.toast(`No se pudo procesar "${f.name}".`, true);
      }
    }
    this.procesandoFotos = false;
    if (this.fotosMb > this.MAX_FOTOS_MB) {
      this.toast(`Las fotos superan ${this.MAX_FOTOS_MB} MB (llevas ${this.fotosMb} MB). Quita algunas antes de registrar.`, true);
    }
    if (event.target) event.target.value = '';
  }

  quitarFoto(i: number): void { this.mp.fotos.splice(i, 1); }

  // Redimensiona a máx 1000px y comprime a JPEG (~0.6) → data-URI base64.
  private comprimirImagen(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject();
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject();
        img.onload = () => {
          const MAX = 1000;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  private get errores(): string[] {
    const e: string[] = [];
    if (this.tipo === 'GESTION') {
      if (!this.g.asesor) e.push('Selecciona el asesor.');
      if (!/^\d{8}$/.test(this.g.dni_cliente || '')) e.push('El DNI debe tener 8 dígitos.');
      if (this.g.celular && !/^\d{9}$/.test(this.g.celular)) e.push('El celular debe tener 9 dígitos.');
      if (!this.g.estado_gestion) e.push('Selecciona el estado de gestión.');
    } else if (this.mpSubtipo === 'KOMMO PLATAFORMA') {
      if (!this.mp.asesor) e.push('Selecciona el asesor.');
      if (!this.mp.estadoLead) e.push('Selecciona el estado del lead.');
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
    if (this.tipo === 'MARKET_PLACE' && this.fotosMb > this.MAX_FOTOS_MB) {
      this.toast(`Las fotos pesan ${this.fotosMb} MB (máx ${this.MAX_FOTOS_MB} MB). Quita algunas.`, true);
      return;
    }
    this.guardando = true;

    let payload: ControlSupervisorPayload;
    if (this.tipo === 'GESTION') {
      payload = { tipo_control: 'GESTION', registrado_por: this.supervisor, ...this.g };
    } else if (this.mpSubtipo === 'KOMMO PLATAFORMA') {
      payload = {
        tipo_control: 'MARKET_PLACE',
        mp_subtipo: 'KOMMO PLATAFORMA',
        registrado_por: this.supervisor,
        asesor: this.mp.asesor,
        cliente: this.mp.cliente,
        estado_lead: this.mp.estadoLead,
        comentario: this.mp.comentario,
        fotos: this.mp.fotos,
      };
    } else {
      payload = {
        tipo_control: 'MARKET_PLACE',
        mp_subtipo: 'MARKET PLACE',
        registrado_por: this.supervisor,
        asesor: this.mp.asesor,
        fecha_publicacion: this.mp.sinPub ? '' : this.fechaDMY(this.mp.fechaPub),
        estado_mp: this.estadoMp,
        comentario: this.mp.comentario,
        fotos: this.mp.fotos,
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
      this.mp = { asesor: this.mp.asesor, fechaPub: null, sinPub: false, sePublico: false, cliente: '', estadoLead: '', comentario: '', fotos: [] };
    }
  }

  private fechaDMY(d: Date | null): string {
    if (!d) return '';
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  /** Toast de confirmación / error (arriba a la derecha), como en el resto de la app. */
  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: error ? 5000 : 3500,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}
