import { Component, inject, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../services/auth.service';
import { ControlSupervisorService, ControlSupervisorPayload } from '../../../services/control-supervisor.service';
import { SheetsService } from '../../../services/service-google.service';

/** Una gestión (Realzza o KOMMO) que el supervisor puede seleccionar para controlar. */
interface GestionRapida {
  key: string;           // clave única para el grid: dni|asesor
  asesor: string;
  dni: string;
  celular: string;
  tipoBase: string;      // Realzza: 'TIPO DE BASE' de la fila · KOMMO: fijo 'KOMMO'
  estadoAsesor: string;  // estado que registró el asesor (referencia)
  hora: string;          // HH:mm de la gestión
  fuente: 'REALZZA' | 'KOMMO';
  controlada: boolean;   // ya tiene un control del supervisor ese día
}

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
  'BUSTAMANTE CHALAN ANA RUT',
  'GUILLEN MACKUADO AURORA FERNANDA',
  'LLONTOP DAVILA DENNIS CHRISTIAN',
  'PEREZ TINEO WILLIAM HUMBERTO',
  'ORUE LIZARRAGA JESUS AUGUSTO LIZANDRO',
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
export class RegistroSupervisorComponent implements OnInit {
  private auth = inject(AuthService);
  private srv = inject(ControlSupervisorService);
  private snack = inject(MatSnackBar);
  private sheets = inject(SheetsService);

  readonly asesores = ASESORES_REALZZA;
  // En Gestión solo aplican estos tipos de base.
  readonly tiposBase = ['BBDD', 'KOMMO', 'BBDD KOMMO', "MARKET PLACE"];
  readonly estados = ['CONTACTO', 'NO CONTACTO'];
  readonly estadosLead = ['LEAD RESPONDIDO', 'CLIENTE SOLO DIO DNI', 'CLIENTE AÚN NO RESPONDE', 'OTRO'];

  // Subtipo dentro de la pestaña Market Place.
  mpSubtipo: 'MARKET PLACE PLATAFORMA' | 'KOMMO PLATAFORMA' = 'MARKET PLACE PLATAFORMA';
  setMpSubtipo(v: 'MARKET PLACE PLATAFORMA' | 'KOMMO PLATAFORMA'): void {
    this.mpSubtipo = v; this.intento = false; this.seleccion = null;
    if (this.usandoRapido) this.cargarListaRapida();
  }
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

  // ── Modo SELECCIÓN RÁPIDA (Gestión Realzza / KOMMO plataforma) ────────────────
  // El supervisor elige una gestión ya registrada por el asesor y solo marca si
  // contestó + comentario, en vez de teclear DNI/celular a mano.
  modoRapido = true;
  gestFecha: Date = new Date();
  listaCargando = false;
  ocultarControladas = true;
  filtroAsesorLista = '';
  gestionesRapidas: GestionRapida[] = [];
  seleccion: GestionRapida | null = null;

  /** El modo rápido solo aplica a Gestión Realzza y a KOMMO plataforma. */
  get aplicaRapido(): boolean {
    return this.tipo === 'GESTION' || (this.tipo === 'MARKET_PLACE' && this.mpSubtipo === 'KOMMO PLATAFORMA');
  }
  /** ¿Se está mostrando la UI de selección rápida? (modo activo + aplica al tab). */
  get usandoRapido(): boolean { return this.modoRapido && this.aplicaRapido; }

  get supervisor(): string { return this.auth.getUsuario()?.nombre ?? ''; }

  ngOnInit(): void { if (this.usandoRapido) this.cargarListaRapida(); }

  setModo(rapido: boolean): void {
    this.modoRapido = rapido;
    this.seleccion = null;
    this.intento = false;
    if (this.usandoRapido) this.cargarListaRapida();
  }

  setTipo(t: 'GESTION' | 'MARKET_PLACE'): void {
    this.tipo = t; this.intento = false; this.seleccion = null;
    if (this.usandoRapido) this.cargarListaRapida();
  }

  // ── Carga de la lista seleccionable ──────────────────────────────────────────
  cambioFechaLista(): void { if (this.usandoRapido) this.cargarListaRapida(); }

  cargarListaRapida(): void {
    const esKommo = this.tipo !== 'GESTION';   // en modo rápido, MARKET_PLACE ⇒ KOMMO plataforma
    const dia = this.gestFecha || new Date();
    const rango = { desde: dia, hasta: dia };
    this.listaCargando = true;
    this.seleccion = null;
    forkJoin({
      ges: esKommo ? this.sheets.getSheetKOMMORango(rango) : this.sheets.getSheetDataCampoRango(rango),
      ctrl: this.srv.listar(rango),
    }).subscribe({
      next: ({ ges, ctrl }) => {
        const controladas = new Set(
          (ctrl || []).map(c => `${this.soloDig(c.dni_cliente)}|${this.norm(c.asesor)}`)
        );
        const vistos = new Set<string>();
        const rows: GestionRapida[] = [];
        (ges || []).forEach(g => {
          const r = this.normalizarGestion(g, esKommo);
          if (!r) return;
          const clave = `${r.dni}|${this.norm(r.asesor)}`;
          if (vistos.has(clave)) return;       // 1 control por cliente+asesor/día
          vistos.add(clave);
          r.controlada = controladas.has(clave);
          rows.push(r);
        });
        this.gestionesRapidas = rows;
        this.asesoresEnLista = Array.from(new Set(rows.map(r => r.asesor).filter(Boolean))).sort();
        if (this.filtroAsesorLista && !this.asesoresEnLista.includes(this.filtroAsesorLista)) this.filtroAsesorLista = '';
        this.aplicarFiltro();
        this.listaCargando = false;
      },
      error: () => {
        this.gestionesRapidas = [];
        this.asesoresEnLista = [];
        this.aplicarFiltro();
        this.listaCargando = false;
        this.toast('No se pudieron cargar las gestiones del día.', true);
      },
    });
  }

  private normalizarGestion(g: any, esKommo: boolean): GestionRapida | null {
    const asesor = (g['ASESOR REALZZA'] || '').toString().trim();
    if (!asesor) return null;
    const dni = this.soloDig(esKommo ? g['DNI CLIENTE REALZZA'] : g['DNI CLIENTE']);
    if (!dni) return null;
    if (esKommo) {
      const mp = (g['MARKET PLACE R'] || '').toString().trim().toUpperCase();
      if (mp === 'SI' || mp === 'SÍ') return null;   // solo KOMMO (Market Place se excluye)
    }
    return {
      key: `${dni}|${this.norm(asesor)}`,
      asesor,
      dni,
      celular: this.soloDig(esKommo ? g['CELULAR GESTIONADO REALZZA'] : g['CELULAR GESTIONADO']),
      tipoBase: esKommo ? 'KOMMO' : ((g['TIPO DE BASE'] || '').toString().trim()),
      estadoAsesor: ((esKommo ? g['ESTADO DE GESTIÓN REALZZA'] : g['ESTADO DE GESTIÓN']) || '').toString().trim(),
      hora: this.horaDe(g['Marca temporal']),
      fuente: esKommo ? 'KOMMO' : 'REALZZA',
      controlada: false,
    };
  }

  // Materializados (NO getters): un getter devolvería un array nuevo en cada ciclo
  // de detección → la grilla resetearía su dataSource sin parar (filas en esqueleto)
  // y el combo perdería la selección. Se recalculan solo al cambiar el filtro/datos.
  asesoresEnLista: string[] = [];
  listaFiltrada: GestionRapida[] = [];
  pendientesCount = 0;

  /** Recalcula la lista visible y contadores según los filtros actuales. */
  aplicarFiltro(): void {
    let l = this.gestionesRapidas;
    if (this.filtroAsesorLista) l = l.filter(r => r.asesor === this.filtroAsesorLista);
    if (this.ocultarControladas) l = l.filter(r => !r.controlada);
    this.listaFiltrada = l;
    this.pendientesCount = this.gestionesRapidas.filter(r => !r.controlada).length;
  }

  seleccionar(row: GestionRapida | null): void {
    this.seleccion = row;
    this.intento = false;
    if (!row) return;
    // En modo rápido siempre se registra como control de GESTIÓN (cruza por DNI):
    // Realzza usa su tipo de base; KOMMO se registra con tipo_base 'KOMMO'.
    this.g.asesor = row.asesor;
    this.g.tipo_base = row.tipoBase;
    this.g.dni_cliente = row.dni;
    this.g.celular = row.celular;
    this.g.estado_gestion = '';
    this.g.comentario = '';
  }

  /** Salta a una gestión pendiente al azar (para ir controlando al azar). */
  siguienteAlAzar(): void {
    const pend = this.listaFiltrada.filter(r => !r.controlada);
    if (!pend.length) { this.toast('No quedan gestiones pendientes con el filtro actual.'); return; }
    this.seleccionar(pend[Math.floor(Math.random() * pend.length)]);
  }

  private soloDig(v: any): string { return (v ?? '').toString().replace(/\D/g, '').replace(/^0+/, ''); }
  private norm(v: any): string { return (v ?? '').toString().trim().toUpperCase(); }
  private horaDe(marca: any): string {
    const s = (marca ?? '').toString().trim();
    const m = s.match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
  }

  soloNumeros(campo: 'dni_cliente' | 'celular', max: number): void {
    this.g[campo] = (this.g[campo] ?? '').toString().replace(/\D/g, '').slice(0, max);
    this.intento = true;
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
    // Modo selección rápida: basta con elegir una gestión + marcar si contestó.
    if (this.usandoRapido) {
      if (!this.seleccion) e.push('Selecciona una gestión de la lista.');
      if (!this.g.estado_gestion) e.push('Marca si contestó (Contacto / No contacto).');
      return e;
    }
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
  get primerError(): string { return this.errores[0] || ''; }

  // ── Marcado en rojo del campo inválido (tras la 1ª interacción) ──
  intento = false;
  touched(): void { this.intento = true; }
  get invGAsesor(): boolean { return !this.g.asesor; }
  get invGDni(): boolean { return !/^\d{8}$/.test(this.g.dni_cliente || ''); }
  get invGCel(): boolean { return !!this.g.celular && !/^\d{9}$/.test(this.g.celular); }
  get invGEstado(): boolean { return !this.g.estado_gestion; }
  get invMpAsesor(): boolean { return !this.mp.asesor; }
  get invMpFecha(): boolean { return !this.mp.sinPub && !this.mp.fechaPub; }
  get invMpEstadoLead(): boolean { return !this.mp.estadoLead; }

  registrar(): void {
    const errs = this.errores;
    if (errs.length) { this.toast(errs[0], true); return; }
    if (this.tipo === 'MARKET_PLACE' && this.fotosMb > this.MAX_FOTOS_MB) {
      this.toast(`Las fotos pesan ${this.fotosMb} MB (máx ${this.MAX_FOTOS_MB} MB). Quita algunas.`, true);
      return;
    }
    this.guardando = true;

    let payload: ControlSupervisorPayload;
    if (this.usandoRapido) {
      // Selección rápida ⇒ control de GESTIÓN con los datos de la fila elegida.
      // (KOMMO se registra con tipo_base 'KOMMO' para que cruce contra la gestión Kommo.)
      payload = { tipo_control: 'GESTION', registrado_por: this.supervisor, ...this.g };
    } else if (this.tipo === 'GESTION') {
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
        mp_subtipo: 'MARKET PLACE PLATAFORMA',
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
    if (this.usandoRapido) {
      // Marca la gestión recién controlada y salta a la siguiente pendiente.
      if (this.seleccion) {
        const sel = this.seleccion;
        const row = this.gestionesRapidas.find(r => r.dni === sel.dni && this.norm(r.asesor) === this.norm(sel.asesor));
        if (row) row.controlada = true;
      }
      this.aplicarFiltro();
      this.g = { asesor: '', tipo_base: '', dni_cliente: '', celular: '', estado_gestion: '', comentario: '' };
      this.seleccion = null;
      this.intento = false;
      return;
    }
    if (this.tipo === 'GESTION') {
      this.g = { asesor: this.g.asesor, tipo_base: this.g.tipo_base, dni_cliente: '', celular: '', estado_gestion: '', comentario: '' };
    } else {
      this.mp = { asesor: this.mp.asesor, fechaPub: null, sinPub: false, sePublico: false, cliente: '', estadoLead: '', comentario: '', fotos: [] };
    }
    this.intento = false;
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
