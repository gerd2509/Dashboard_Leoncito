import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { custom } from 'devextreme/ui/dialog';
import { lastValueFrom } from 'rxjs';
import { ControlSupervisorService, ControlSupervisor } from '../../services/control-supervisor.service';
import { SheetsService } from '../../services/service-google.service';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';

// Resultado del cruce control-supervisor ↔ gestión del asesor.
type Resultado = 'COINCIDE' | 'DISCREPANCIA' | 'SIN GESTIÓN';

interface CitaControl {
  id: number;
  tipo: 'GESTION' | 'MARKET_PLACE';
  color: string;          // id del recurso para colorear (resultado o estado MP)
  text: string;
  startDate: Date;
  endDate: Date;
  asesor: string;
  comentario: string;
  // Gestión:
  resultado?: Resultado;
  tipoBase?: string;
  dni?: string;
  celular?: string;
  estadoSup?: string;      // estado que puso el supervisor
  estadoAsesor?: string;   // estado en la ÚLTIMA gestión del asesor (o '—')
  asesorGestion?: string;  // asesor que figura en la gestión encontrada
  fechaGestion?: string;   // fecha de la última gestión hallada (o '')
  fuenteGestion?: string;  // "Gestión Realzza" | "Gestión Kommo (Realzza)"
  avisoTipo?: string;      // aviso si la clasificación kommo/market place no calza
  avisoCelular?: string;   // aviso si el celular registrado difiere del de la gestión
  // Market Place / Kommo Plataforma:
  mpSubtipo?: string;      // MARKET PLACE | KOMMO PLATAFORMA
  estadoMp?: string;       // AL DÍA / DESACTUALIZADO / ACTUALIZADO (market place)
  fechaPublicacion?: string;
  diasSinPublicar?: number | null;
  cliente?: string;        // nombre del cliente (kommo plataforma)
  estadoLead?: string;     // LEAD RESPONDIDO / ... (kommo plataforma)
  fotos?: string[];        // pruebas (imágenes base64)
}

// ── Estructuras del reporte del supervisor ──────────────────────────────────
interface FilaTipoRep { tipoBase: string; total: number; coincide: number; discrepancia: number; sinGestion: number; obs: number; }
interface FilaAsesorRep {
  asesor: string; total: number; coincide: number; discrepancia: number; sinGestion: number; obs: number;
  efectividad: number; tipos: FilaTipoRep[];
}
interface FilaDiscRep {
  fecha: string; asesor: string; tipoBase: string; dni: string; celular: string;
  estadoSup: string; estadoAsesor: string; resultado: string; motivo: string;
}
interface FilaDetRep {
  fecha: string; asesor: string; tipo: string; tipoBase: string; ref: string;
  estadoSup: string; estadoAsesor: string; resultado: string; obs: string; comentario: string;
}
// Market Place Plataforma por asesor (con cada cuánto actualiza sus publicaciones).
interface FilaMpRep {
  asesor: string; total: number; alDia: number; actualizado: number; desactualizado: number;
  promDias: number | null; maxDias: number | null;
}
// Kommo Plataforma por asesor (si responden o no los leads).
interface FilaKpRep {
  asesor: string; total: number; respondido: number; soloDni: number; noResponde: number; otro: number;
}
interface ReporteSupervisor {
  desde: string; hasta: string; asesor: string; generado: string;
  totalGestion: number; coincide: number; discrepancia: number; sinGestion: number; contactabilidad: number;
  totalMp: number; alDia: number; desactualizado: number; actualizado: number;
  porAsesor: FilaAsesorRep[];
  porAsesorMp: FilaMpRep[];
  porAsesorKp: FilaKpRep[];
  discrepancias: FilaDiscRep[];
  detalle: FilaDetRep[];
}

import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-control-supervisor',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './control-supervisor.component.html',
  styleUrl: './control-supervisor.component.css'
})
export class ControlSupervisorComponent implements OnInit {
  private srv = inject(ControlSupervisorService);
  private sheets = inject(SheetsService);
  private snack = inject(MatSnackBar);

  // Listas para el formulario de edición rápida.
  readonly asesoresLista = [
    'ACOSTA JIMENEZ MARIELA NATALY', 'PEREZ TINEO MARICIELO TATIANA', 'RIVAS PURISACA KAREN YUDITH',
    'BERNAL BAZAN BRENDA NICOLL', 'MIÑOPE GONZALES ANYELA ESTHEFANY', 'MONTALVO LUYO ERNESTO ADOLFO',
    'SANTAMARIA GUZMAN MERLY BRIGHITE', 'UCHOFEN VIGO FELICITA', 'RIQUERO ULCO CESAR JEFFERSON',
    'BUSTAMANTE CHALAN ANA RUT', 'BUSTAMANTE BANCES LUCIA NICOLL', 'LLONTOP DAVILA DENNIS CHRISTIAN',
    'PEREZ TINEO WILLIAM HUMBERTO', 'ORUE LIZARRAGA JESUS AUGUSTO LIZANDRO'
  ];
  readonly estadosGestion = ['CONTACTO', 'NO CONTACTO'];
  readonly tiposBaseLista = ['BBDD', 'KOMMO', 'BBDD KOMMO', 'MARKET PLACE'];
  readonly estadosMpLista = ['AL DÍA', 'DESACTUALIZADO', 'ACTUALIZADO'];
  readonly estadosLeadLista = ['LEAD RESPONDIDO', 'CLIENTE SOLO DIO DNI', 'CLIENTE AÚN NO RESPONDE', 'OTRO'];

  form: UntypedFormGroup;
  isLoading = false;
  error = '';

  citas: CitaControl[] = [];
  citasFiltradas: CitaControl[] = [];
  asesoresDisponibles: string[] = [];
  currentDate = new Date();

  // Vista del calendario controlada por botones propios (Día/Semana/Mes).
  vistaActual: 'day' | 'week' | 'month' = 'month';
  setVista(v: 'day' | 'week' | 'month'): void { this.vistaActual = v; }

  // KPIs de gestión.
  kTotal = 0; kCoincide = 0; kDiscrepancia = 0; kSinGestion = 0;
  // KPIs de market place.
  kMpTotal = 0; kAlDia = 0; kDesactualizado = 0; kActualizado = 0;

  // Vista: qué controles mostrar en el calendario.
  vista: 'TODO' | 'GESTION' | 'MARKET_PLACE' = 'TODO';

  // Recursos de color: gestión (resultado del cruce) + market place (estado).
  readonly recursosColor = [
    { id: 'COINCIDE',      text: 'Coincide',               color: '#2E7D32' },
    { id: 'DISCREPANCIA',  text: 'Discrepancia',           color: '#c62828' },
    { id: 'SIN GESTIÓN',   text: 'Sin gestión del asesor', color: '#78909c' },
    { id: 'AL DÍA',        text: 'MP al día',              color: '#1565C0' },
    { id: 'DESACTUALIZADO',text: 'MP desactualizado',      color: '#E65100' },
    { id: 'ACTUALIZADO',   text: 'MP actualizado',         color: '#6A1B9A' },
    { id: 'LEAD RESPONDIDO',       text: 'Lead respondido',        color: '#2E7D32' },
    { id: 'CLIENTE SOLO DIO DNI',  text: 'Solo dio DNI',           color: '#E65100' },
    { id: 'CLIENTE AÚN NO RESPONDE', text: 'Aún no responde',      color: '#c62828' },
    { id: 'OTRO',          text: 'Otro (Kommo Plataforma)', color: '#546E7A' },
  ];

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.form = this.fb.group({
      fechaInicio: [primero],
      fechaFin: [hoy],
      asesor: [''],
    });
  }

  setVistaTipo(v: 'TODO' | 'GESTION' | 'MARKET_PLACE'): void {
    this.vista = v;
    this.aplicarFiltroAsesor();
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private soloDigitos(v: any): string {
    return (v ?? '').toString().replace(/\D/g, '').replace(/^0+/, '');
  }

  // "d/m/yyyy H:mm:ss" → Date (o null).
  private parseMarca(texto: any): Date | null {
    const s = (texto ?? '').toString().trim();
    if (!s) return null;
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return isNaN(d.getTime()) ? null : d;
  }

  async cargar(): Promise<void> {
    this.isLoading = true;
    this.error = '';
    try {
      const desde = new Date(this.form.value.fechaInicio); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(this.form.value.fechaFin); hasta.setHours(23, 59, 59, 999);
      // El calendario se centra en la fecha fin (para que Día/Semana caigan en datos).
      this.currentDate = new Date(this.form.value.fechaFin);

      const [controles, gestion, kommo] = await Promise.all([
        lastValueFrom(this.srv.listar({ desde, hasta })),
        lastValueFrom(this.sheets.getSheetDataCampo()),   // gestión Realzza (Google Form)
        lastValueFrom(this.sheets.getSheetKOMMO()),        // gestión Kommo (Realzza + Call)
      ]);

      // Índice de gestiones Realzza por DNI → lista de {celular, estado, asesor, fecha}
      const idxDni = new Map<string, Array<{ celular: string; estado: string; asesor: string; fecha: Date | null }>>();
      (gestion || []).forEach((g: any) => {
        const dni = this.soloDigitos(g['DNI CLIENTE']);
        if (!dni) return;
        const arr = idxDni.get(dni) || [];
        arr.push({
          celular: this.soloDigitos(g['CELULAR GESTIONADO']),
          estado: (g['ESTADO DE GESTIÓN'] || '').toString().trim().toUpperCase(),
          asesor: (g['ASESOR REALZZA'] || '').toString().trim(),
          fecha: this.parseMarca(g['Marca temporal']),
        });
        idxDni.set(dni, arr);
      });

      // Índice de gestión KOMMO (lado tienda Realzza) por DNI, con la marca MARKET PLACE R:
      //   MARKET PLACE R = NO → es KOMMO ; = SÍ → es MARKET PLACE.
      const idxKommo = new Map<string, Array<{ celular: string; estado: string; asesor: string; fecha: Date | null; mp: string }>>();
      (kommo || []).forEach((g: any) => {
        const dni = this.soloDigitos(g['DNI CLIENTE REALZZA']);
        if (!dni) return;
        const arr = idxKommo.get(dni) || [];
        arr.push({
          celular: this.soloDigitos(g['CELULAR GESTIONADO REALZZA']),
          estado: (g['ESTADO DE GESTIÓN REALZZA'] || '').toString().trim().toUpperCase(),
          asesor: (g['ASESOR REALZZA'] || '').toString().trim(),
          fecha: this.parseMarca(g['Marca temporal']),
          mp: this.siNo(g['MARKET PLACE R']),
        });
        idxKommo.set(dni, arr);
      });

      this.citas = (controles || [])
        .map(c => (c.tipo_control === 'MARKET_PLACE' ? this.armarCitaMp(c) : this.armarCita(c, idxDni, idxKommo)))
        .filter((c): c is CitaControl => c !== null);
      this.asesoresDisponibles = Array.from(new Set(this.citas.map(c => c.asesor).filter(Boolean))).sort();
      this.aplicarFiltroAsesor();
    } catch (e) {
      console.error('❌ control-supervisor:', e);
      this.error = 'No se pudieron cargar los controles (revisa la conexión al servidor).';
      this.citas = []; this.citasFiltradas = [];
      this.recalcularKpis();
    } finally {
      this.isLoading = false;
    }
  }

  // Cruza un control con la gestión del asesor (por DNI y, si hay, celular).
  // Si el tipo de base es KOMMO o MARKET PLACE, cruza con la gestión KOMMO (tienda
  // Realzza) filtrando por la columna MARKET PLACE R (NO=kommo, SÍ=market place);
  // en cualquier otro caso cruza con la gestión Realzza normal.
  private armarCita(c: ControlSupervisor, idxDni: Map<string, any[]>, idxKommo: Map<string, any[]>): CitaControl | null {
    const start = this.parseMarca(c.marca_temporal);
    if (!start) return null;
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const dni = this.soloDigitos(c.dni_cliente);
    const cel = this.soloDigitos(c.celular);
    const estadoSup = (c.estado_gestion || '').toString().trim().toUpperCase();

    // Fuente del cruce según el tipo de base registrado por el supervisor.
    const tb = (c.tipo_base || '').toString().trim().toUpperCase();
    const esMarketPlace = tb === 'MARKET PLACE';
    const esKommo = tb === 'KOMMO';
    const esKommoMp = esMarketPlace || esKommo;
    let candidatos: any[];
    let fuenteGestion: string;
    if (esKommoMp) {
      // Cruza contra TODAS las gestiones Kommo del cliente (sin filtrar por MP);
      // luego se compara el estado y se avisa si la clasificación (MARKET PLACE R)
      // de la gestión no calza con lo que registró el supervisor.
      candidatos = idxKommo.get(dni) || [];
      fuenteGestion = 'Gestión Kommo (Realzza)';
    } else {
      candidatos = idxDni.get(dni) || [];
      fuenteGestion = 'Gestión Realzza';
    }

    // SIEMPRE la ÚLTIMA gestión del cliente por DNI: la más reciente EN o ANTES de
    // la fecha del control (la que el supervisor estaba verificando); si no hay
    // ninguna anterior, la más reciente disponible. El celular NO restringe la
    // elección (para no quedarnos con un registro viejo): si difiere, se avisa aparte.
    let hit: any = null;
    if (candidatos.length) {
      const ordenado = [...candidatos].sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));
      hit = (start ? ordenado.find(x => x.fecha && x.fecha.getTime() <= start.getTime()) : null) || ordenado[0];
    }

    let resultado: Resultado;
    let estadoAsesor = '—';
    let asesorGestion = '';
    let fechaGestion = '';
    let avisoTipo = '';
    let avisoCelular = '';
    if (!hit) {
      resultado = 'SIN GESTIÓN';
    } else {
      estadoAsesor = hit.estado || '—';
      asesorGestion = hit.asesor || '';
      fechaGestion = hit.fecha ? `${String(hit.fecha.getDate()).padStart(2, '0')}/${String(hit.fecha.getMonth() + 1).padStart(2, '0')}/${hit.fecha.getFullYear()} ${this.horaDe(hit.fecha)}` : '';
      resultado = estadoAsesor === estadoSup ? 'COINCIDE' : 'DISCREPANCIA';

      // Kommo/Market Place: avisar si la clasificación de la gestión no calza.
      if (esKommoMp) {
        const gestMkt = hit.mp === 'SI';
        fuenteGestion = `Gestión Kommo (Realzza) · gestión: ${gestMkt ? 'MARKET PLACE' : 'KOMMO'}`;
        if (gestMkt !== esMarketPlace) {
          avisoTipo = `La gestión figura como ${gestMkt ? 'MARKET PLACE' : 'KOMMO'}, pero se registró como ${esMarketPlace ? 'MARKET PLACE' : 'KOMMO'}`;
        }
      }

      // Avisar si el celular registrado por el supervisor difiere del de la gestión.
      const celGest = (hit.celular || '').toString();
      if (cel && celGest && cel !== celGest) {
        avisoCelular = `El celular registrado (${c.celular}) no coincide con el de la gestión (${celGest})`;
      }
    }

    return {
      id: c.id,
      tipo: 'GESTION',
      color: resultado,
      text: `${c.dni_cliente} · ${estadoSup}`,
      startDate: start,
      endDate: end,
      resultado,
      asesor: (c.asesor || '').toString().trim(),
      tipoBase: c.tipo_base || '',
      dni: c.dni_cliente || '',
      celular: c.celular || '',
      estadoSup,
      estadoAsesor,
      asesorGestion,
      fechaGestion,
      fuenteGestion,
      avisoTipo,
      avisoCelular,
      comentario: c.comentario || '',
    };
  }

  // Normaliza SÍ/NO (sin tildes) para la columna MARKET PLACE R.
  private siNo(v: any): string {
    const s = (v ?? '').toString().trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s === 'SI' ? 'SI' : s === 'NO' ? 'NO' : s;
  }

  // Control de Market Place / Kommo Plataforma → cita coloreada por su estado.
  private armarCitaMp(c: ControlSupervisor): CitaControl | null {
    const start = this.parseMarca(c.marca_temporal);
    if (!start) return null;
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const sub = (c.mp_subtipo || 'MARKET PLACE').toString().trim().toUpperCase();
    const fotos = Array.isArray(c.fotos) ? c.fotos : [];

    if (sub === 'KOMMO PLATAFORMA') {
      const estadoLead = (c.estado_lead || '').toString().trim().toUpperCase();
      return {
        id: c.id, tipo: 'MARKET_PLACE', mpSubtipo: 'KOMMO PLATAFORMA',
        color: estadoLead || 'OTRO',
        text: `KP · ${estadoLead}`,
        startDate: start, endDate: end,
        asesor: (c.asesor || '').toString().trim(),
        tipoBase: 'KOMMO PLATAFORMA',
        comentario: c.comentario || '',
        cliente: c.cliente || '',
        estadoLead,
        fotos,
      };
    }

    const estadoMp = (c.estado_mp || '').toString().trim().toUpperCase();
    const fpub = this.parseMarca(c.fecha_publicacion);
    const dias = fpub ? Math.max(0, Math.floor((start.getTime() - fpub.getTime()) / 86400000)) : null;

    return {
      id: c.id, tipo: 'MARKET_PLACE', mpSubtipo: 'MARKET PLACE PLATAFORMA',
      color: estadoMp || 'DESACTUALIZADO',
      text: `MP · ${estadoMp}`,
      startDate: start, endDate: end,
      asesor: (c.asesor || '').toString().trim(),
      tipoBase: 'MARKET PLACE PLATAFORMA',
      comentario: c.comentario || '',
      estadoMp,
      fechaPublicacion: c.fecha_publicacion || '',
      diasSinPublicar: dias,
      fotos,
    };
  }

  aplicarFiltroAsesor(): void {
    const asesor = (this.form.value.asesor || '').toString().trim();
    this.citasFiltradas = this.citas.filter(c =>
      (!asesor || c.asesor === asesor) &&
      (this.vista === 'TODO' || c.tipo === this.vista));
    this.recalcularKpis();
  }

  private recalcularKpis(): void {
    const g = this.citasFiltradas.filter(c => c.tipo === 'GESTION');
    this.kTotal = g.length;
    this.kCoincide = g.filter(c => c.resultado === 'COINCIDE').length;
    this.kDiscrepancia = g.filter(c => c.resultado === 'DISCREPANCIA').length;
    this.kSinGestion = g.filter(c => c.resultado === 'SIN GESTIÓN').length;
    const m = this.citasFiltradas.filter(c => c.tipo === 'MARKET_PLACE');
    this.kMpTotal = m.length;
    this.kAlDia = m.filter(c => c.estadoMp === 'AL DÍA').length;
    this.kDesactualizado = m.filter(c => c.estadoMp === 'DESACTUALIZADO').length;
    this.kActualizado = m.filter(c => c.estadoMp === 'ACTUALIZADO').length;
  }

  // ── Popups de detalle (reemplazan el formulario feo por defecto) ─────────────
  detalleVisible = false;
  detalle: CitaControl | null = null;

  diaVisible = false;
  diaTitulo = '';
  diaCitas: CitaControl[] = [];
  fotoAmpliada: string | null = null;   // visor de foto a pantalla completa
  diaGrupos: {
    asesor: string; total: number; discrepancias: number; obs: number;
    tipos: { tipoBase: string; citas: CitaControl[]; total: number; discrepancias: number; obs: number }[];
  }[] = [];
  private asesorExpandido = new Set<string>();
  private tipoExpandido = new Set<string>();
  private detalleDesdeDia = false;   // true si el detalle se abrió desde la lista del día

  // Cuota diaria de supervisiones que debe ingresar el supervisor.
  readonly metaDia = 50;
  get claseMetaDia(): string {
    const n = this.diaCitas.length;
    return n >= this.metaDia ? 'meta-ok' : n >= this.metaDia * 0.6 ? 'meta-mid' : 'meta-low';
  }

  toggleAsesor(a: string): void {
    this.asesorExpandido.has(a) ? this.asesorExpandido.delete(a) : this.asesorExpandido.add(a);
  }
  estaExpandido(a: string): boolean { return this.asesorExpandido.has(a); }
  keyTipo(asesor: string, tipoBase: string): string { return asesor + '¦' + tipoBase; }
  toggleTipo(k: string): void {
    this.tipoExpandido.has(k) ? this.tipoExpandido.delete(k) : this.tipoExpandido.add(k);
  }
  estaTipoExpandido(k: string): boolean { return this.tipoExpandido.has(k); }

  // Agrupa las citas del día por asesor y, dentro, por TIPO DE BASE (doble desplegable).
  private construirGruposDia(): void {
    const porAsesor = new Map<string, CitaControl[]>();
    for (const c of this.citasDelDiaFiltradas) {
      const a = c.asesor || '—';
      if (!porAsesor.has(a)) porAsesor.set(a, []);
      porAsesor.get(a)!.push(c);
    }
    this.diaGrupos = Array.from(porAsesor.entries()).map(([asesor, citas]) => {
      const porTipo = new Map<string, CitaControl[]>();
      for (const c of citas) {
        const tb = (c.tipoBase || '—').toString().trim().toUpperCase() || '—';
        if (!porTipo.has(tb)) porTipo.set(tb, []);
        porTipo.get(tb)!.push(c);
      }
      const tipos = Array.from(porTipo.entries()).map(([tipoBase, cs]) => ({
        tipoBase, citas: cs, total: cs.length,
        discrepancias: cs.filter(x => x.resultado === 'DISCREPANCIA').length,
        obs: cs.filter(x => this.tieneAviso(x)).length,
      })).sort((a, b) => b.total - a.total || a.tipoBase.localeCompare(b.tipoBase));
      return {
        asesor, total: citas.length,
        discrepancias: citas.filter(c => c.resultado === 'DISCREPANCIA').length,
        obs: citas.filter(c => this.tieneAviso(c)).length,
        tipos,
      };
    }).sort((a, b) => b.discrepancias - a.discrepancias || b.obs - a.obs || b.total - a.total);
    // Sin filtro arrancan COLAPSADOS; con un filtro activo se despliegan todos
    // para ver directo los registros que cumplen (discrepancia / obs / sin gestión).
    const filtrando = this.filtroDia !== 'TODOS';
    this.asesorExpandido = filtrando ? new Set(this.diaGrupos.map(g => g.asesor)) : new Set();
    this.tipoExpandido = filtrando
      ? new Set(this.diaGrupos.flatMap(g => g.tipos.map(t => this.keyTipo(g.asesor, t.tipoBase))))
      : new Set();
  }

  // Anula el formulario de edición nativo de DevExtreme.
  onFormOpening(e: any): void { e.cancel = true; }

  // Click en una cita del calendario → abre el detalle (no viene de la lista del día).
  onCitaClick(e: any): void {
    e.cancel = true;
    this.detalleDesdeDia = false;
    this.abrirDetalle(e.appointmentData);
  }
  onCitaDblClick(e: any): void {
    e.cancel = true;
    this.detalleDesdeDia = false;
    this.abrirDetalle(e.appointmentData);
  }

  abrirDetalle(c: CitaControl): void {
    this.detalle = c;
    this.detalleVisible = true;
  }

  // ── Editar / eliminar rápido desde el detalle ───────────────────────────────
  editVisible = false;
  guardandoEdit = false;
  editando: any = null;

  abrirEditar(): void {
    const d = this.detalle;
    if (!d) return;
    this.editando = {
      id: d.id, tipo: d.tipo, mpSubtipo: d.mpSubtipo,
      asesor: d.asesor || '', tipo_base: d.tipoBase || '', dni_cliente: d.dni || '', celular: d.celular || '',
      estado_gestion: d.estadoSup || '', fecha_publicacion: d.fechaPublicacion || '',
      estado_mp: d.estadoMp || '', cliente: d.cliente || '', estado_lead: d.estadoLead || '',
      comentario: d.comentario || '',
    };
    this.detalleDesdeDia = false;    // al cerrar el detalle no reabrimos la lista
    this.detalleVisible = false;
    setTimeout(() => (this.editVisible = true), 120);
  }

  guardarEdicion(): void {
    const e = this.editando;
    if (!e) return;
    this.guardandoEdit = true;
    const body: any = { asesor: e.asesor, comentario: e.comentario };
    if (e.tipo === 'GESTION') {
      body.tipo_base = e.tipo_base; body.dni_cliente = e.dni_cliente;
      body.celular = e.celular; body.estado_gestion = e.estado_gestion;
    } else if (e.mpSubtipo === 'KOMMO PLATAFORMA') {
      body.cliente = e.cliente; body.estado_lead = e.estado_lead;
    } else {
      body.fecha_publicacion = e.fecha_publicacion; body.estado_mp = e.estado_mp;
    }
    this.srv.actualizar(e.id, body).subscribe({
      next: async () => {
        this.guardandoEdit = false; this.editVisible = false;
        this.toast('✔ Registro actualizado.');
        await this.cargar();
      },
      error: () => { this.guardandoEdit = false; this.toast('❌ No se pudo guardar el cambio.', true); },
    });
  }

  eliminarDetalle(): void {
    const d = this.detalle;
    if (!d) return;
    const dialog = custom({
      title: 'Eliminar registro del supervisor',
      messageHtml: '<div style="padding:10px 6px;font-size:15px;color:#1E3A5F;">¿Eliminar este registro de forma permanente?</div>',
      buttons: [
        { text: 'Cancelar', type: 'danger', stylingMode: 'contained', onClick: () => false },
        { text: 'Eliminar', type: 'success', stylingMode: 'contained', onClick: () => true },
      ],
    });
    dialog.show().then((ok: boolean) => {
      if (!ok) return;
      this.srv.eliminar(d.id).subscribe({
        next: async () => {
          this.detalleDesdeDia = false; this.detalleVisible = false;
          this.toast('✔ Registro eliminado.');
          await this.cargar();
        },
        error: () => this.toast('❌ No se pudo eliminar.', true),
      });
    });
  }

  /** Toast de confirmación / error (arriba a la derecha), como en el resto de la app. */
  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: 3500,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }

  // Al cerrar el detalle: si venía de la lista del día, se vuelve a esa lista.
  onDetalleHidden(): void {
    if (this.detalleDesdeDia) {
      this.detalleDesdeDia = false;
      setTimeout(() => (this.diaVisible = true), 140);
    }
  }

  // Click en un día → lista todos los controles de ese día.
  onCeldaClick(e: any): void {
    const fecha: Date = e?.cellData?.startDate;
    if (!fecha) return;
    // NO se cambia currentDate: hacerlo re-renderiza todo el scheduler (retardo en la
    // 1ª apertura del popup). El popup muestra el detalle del día sin navegar el calendario.
    const delDia = this.citasFiltradas.filter(c => this.mismaFecha(c.startDate, fecha));
    if (!delDia.length) return;
    this.diaCitas = [...delDia].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    this.filtroDia = 'TODOS';   // cada día abre sin filtro
    this.construirGruposDia();
    this.diaTitulo = this.fechaLarga(fecha);
    this.diaVisible = true;
  }

  // ¿La cita tiene alguna observación (celular o tipo distinto)?
  tieneAviso(c: CitaControl): boolean { return !!(c.avisoTipo || c.avisoCelular); }
  tieneFotos(c: CitaControl): boolean { return !!(c.fotos && c.fotos.length); }
  avisoTexto(c: CitaControl): string { return [c.avisoTipo, c.avisoCelular].filter(Boolean).join(' · '); }
  get diaObs(): number { return this.diaCitas.filter(c => this.tieneAviso(c)).length; }
  get diaDiscrepancias(): number { return this.diaCitas.filter(c => c.resultado === 'DISCREPANCIA').length; }
  get diaSinGestion(): number { return this.diaCitas.filter(c => c.resultado === 'SIN GESTIÓN').length; }

  // Filtro rápido dentro del popup del día (chips clicables).
  filtroDia: 'TODOS' | 'DISCREPANCIA' | 'OBS' | 'SIN_GESTION' = 'TODOS';
  toggleFiltroDia(f: 'TODOS' | 'DISCREPANCIA' | 'OBS' | 'SIN_GESTION'): void {
    this.filtroDia = (this.filtroDia === f) ? 'TODOS' : f;
    this.construirGruposDia();
  }
  private get citasDelDiaFiltradas(): CitaControl[] {
    switch (this.filtroDia) {
      case 'DISCREPANCIA': return this.diaCitas.filter(c => c.resultado === 'DISCREPANCIA');
      case 'OBS':          return this.diaCitas.filter(c => this.tieneAviso(c));
      case 'SIN_GESTION':  return this.diaCitas.filter(c => c.resultado === 'SIN GESTIÓN');
      default:             return this.diaCitas;
    }
  }

  // Desde el popup del día, abrir el detalle de una cita (al cerrar vuelve a la lista).
  verDesdeDia(c: CitaControl): void {
    this.detalleDesdeDia = true;
    this.diaVisible = false;
    setTimeout(() => this.abrirDetalle(c), 120);
  }

  private mismaFecha(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  private fechaLarga(d: Date): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} del ${d.getFullYear()}`;
  }
  // Clase CSS por color/estado (gestión y market place).
  claseColor(id: string): string {
    switch (id) {
      case 'COINCIDE': return 'ok';
      case 'DISCREPANCIA': return 'bad';
      case 'SIN GESTIÓN': return 'none';
      case 'AL DÍA': return 'mp-ok';
      case 'DESACTUALIZADO': return 'mp-bad';
      case 'ACTUALIZADO': return 'mp-upd';
      case 'LEAD RESPONDIDO': return 'ok';
      case 'CLIENTE SOLO DIO DNI': return 'mp-bad';
      case 'CLIENTE AÚN NO RESPONDE': return 'bad';
      case 'OTRO': return 'none';
      default: return 'none';
    }
  }
  horaDe(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  mpCorto(estado: string): string {
    return estado === 'AL DÍA' ? 'OK' : estado === 'ACTUALIZADO' ? 'ACT' : estado === 'DESACTUALIZADO' ? 'DESACT' : '';
  }
  // Texto del badge de resultado/estado según el tipo de cita.
  badgeDe(c: CitaControl): string {
    if (c.tipo !== 'MARKET_PLACE') return c.resultado || '';
    return c.mpSubtipo === 'KOMMO PLATAFORMA' ? (c.estadoLead || '') : (c.estadoMp || '');
  }
  esKommoPlataforma(c: CitaControl): boolean { return c.mpSubtipo === 'KOMMO PLATAFORMA'; }

  // ══════════════════════════════════════════════════════════════════════════
  //  REPORTE DEL SUPERVISOR
  //  Arma un reporte del rango cargado (respeta el filtro de asesor si hay uno):
  //  resumen, desglose por asesor → tipo de base, discrepancias con su motivo,
  //  y el detalle completo. Se ve en pantalla y se exporta a Excel o PDF.
  // ══════════════════════════════════════════════════════════════════════════
  reporteVisible = false;
  reporte: ReporteSupervisor | null = null;

  abrirReporte(): void {
    this.reporte = this.construirReporte();
    this.reporteVisible = true;
  }

  // Motivo legible de una discrepancia / observación de una gestión.
  motivo(c: CitaControl): string {
    const partes: string[] = [];
    if (c.resultado === 'DISCREPANCIA') {
      partes.push(`Supervisor marcó "${c.estadoSup || '—'}" y el asesor "${c.estadoAsesor || '—'}"`);
    } else if (c.resultado === 'SIN GESTIÓN') {
      partes.push('El asesor no registró gestión para este DNI');
    }
    if (c.avisoTipo) partes.push(c.avisoTipo);
    if (c.avisoCelular) partes.push(c.avisoCelular);
    return partes.join(' · ');
  }

  private fmtFechaHora(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${this.horaDe(d)}`;
  }
  private fmtFechaCorta(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  private construirReporte(): ReporteSupervisor {
    const asesorFiltro = (this.form.value.asesor || '').toString().trim();
    const base = this.citas.filter(c => !asesorFiltro || c.asesor === asesorFiltro);
    const gest = base.filter(c => c.tipo === 'GESTION');
    const mp = base.filter(c => c.tipo === 'MARKET_PLACE');

    const coincide = gest.filter(c => c.resultado === 'COINCIDE').length;
    const discrepancia = gest.filter(c => c.resultado === 'DISCREPANCIA').length;
    const sinGestion = gest.filter(c => c.resultado === 'SIN GESTIÓN').length;
    const conGestion = coincide + discrepancia;   // donde SÍ hubo gestión del asesor
    const contactabilidad = conGestion ? Math.round((coincide / conGestion) * 100) : 0;

    // Por asesor → tipo de base
    const porAsesorMap = new Map<string, CitaControl[]>();
    for (const c of gest) {
      const a = c.asesor || '—';
      if (!porAsesorMap.has(a)) porAsesorMap.set(a, []);
      porAsesorMap.get(a)!.push(c);
    }
    const porAsesor: FilaAsesorRep[] = Array.from(porAsesorMap.entries()).map(([asesor, cs]) => {
      const porTipo = new Map<string, CitaControl[]>();
      for (const c of cs) {
        const tb = (c.tipoBase || '—').toString().trim().toUpperCase() || '—';
        if (!porTipo.has(tb)) porTipo.set(tb, []);
        porTipo.get(tb)!.push(c);
      }
      const tipos: FilaTipoRep[] = Array.from(porTipo.entries()).map(([tipoBase, ts]) => ({
        tipoBase,
        total: ts.length,
        coincide: ts.filter(x => x.resultado === 'COINCIDE').length,
        discrepancia: ts.filter(x => x.resultado === 'DISCREPANCIA').length,
        sinGestion: ts.filter(x => x.resultado === 'SIN GESTIÓN').length,
        obs: ts.filter(x => this.tieneAviso(x)).length,
      })).sort((a, b) => b.total - a.total || a.tipoBase.localeCompare(b.tipoBase));

      const co = cs.filter(x => x.resultado === 'COINCIDE').length;
      const di = cs.filter(x => x.resultado === 'DISCREPANCIA').length;
      const conG = co + di;
      return {
        asesor,
        total: cs.length,
        coincide: co,
        discrepancia: di,
        sinGestion: cs.filter(x => x.resultado === 'SIN GESTIÓN').length,
        obs: cs.filter(x => this.tieneAviso(x)).length,
        efectividad: conG ? Math.round((co / conG) * 100) : 0,
        tipos,
      };
    }).sort((a, b) => b.discrepancia - a.discrepancia || b.total - a.total);

    // Discrepancias detalladas (incluye SIN GESTIÓN, ambas con motivo)
    const discrepancias: FilaDiscRep[] = gest
      .filter(c => c.resultado === 'DISCREPANCIA' || c.resultado === 'SIN GESTIÓN')
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map(c => ({
        fecha: this.fmtFechaHora(c.startDate),
        asesor: c.asesor || '—',
        tipoBase: c.tipoBase || '—',
        dni: c.dni || '',
        celular: c.celular || '',
        estadoSup: c.estadoSup || '—',
        estadoAsesor: c.estadoAsesor || '—',
        resultado: c.resultado || '',
        motivo: this.motivo(c),
      }));

    // Market Place Plataforma por asesor: cada cuánto actualiza sus publicaciones.
    const mpPlat = mp.filter(c => c.mpSubtipo !== 'KOMMO PLATAFORMA');
    const mpMap = new Map<string, CitaControl[]>();
    for (const c of mpPlat) { const a = c.asesor || '—'; if (!mpMap.has(a)) mpMap.set(a, []); mpMap.get(a)!.push(c); }
    const porAsesorMp: FilaMpRep[] = Array.from(mpMap.entries()).map(([asesor, cs]) => {
      const dias = cs.map(c => c.diasSinPublicar).filter((d): d is number => d != null);
      return {
        asesor, total: cs.length,
        alDia: cs.filter(c => c.estadoMp === 'AL DÍA').length,
        actualizado: cs.filter(c => c.estadoMp === 'ACTUALIZADO').length,
        desactualizado: cs.filter(c => c.estadoMp === 'DESACTUALIZADO').length,
        promDias: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null,
        maxDias: dias.length ? Math.max(...dias) : null,
      };
    }).sort((a, b) => b.desactualizado - a.desactualizado || (b.promDias ?? -1) - (a.promDias ?? -1) || b.total - a.total);

    // Kommo Plataforma por asesor: si están respondiendo o no los leads.
    const kpPlat = mp.filter(c => c.mpSubtipo === 'KOMMO PLATAFORMA');
    const kpMap = new Map<string, CitaControl[]>();
    for (const c of kpPlat) { const a = c.asesor || '—'; if (!kpMap.has(a)) kpMap.set(a, []); kpMap.get(a)!.push(c); }
    const conocidosKp = ['LEAD RESPONDIDO', 'CLIENTE SOLO DIO DNI', 'CLIENTE AÚN NO RESPONDE'];
    const porAsesorKp: FilaKpRep[] = Array.from(kpMap.entries()).map(([asesor, cs]) => ({
      asesor, total: cs.length,
      respondido: cs.filter(c => c.estadoLead === 'LEAD RESPONDIDO').length,
      soloDni: cs.filter(c => c.estadoLead === 'CLIENTE SOLO DIO DNI').length,
      noResponde: cs.filter(c => c.estadoLead === 'CLIENTE AÚN NO RESPONDE').length,
      otro: cs.filter(c => !!c.estadoLead && !conocidosKp.includes(c.estadoLead!)).length,
    })).sort((a, b) => b.noResponde - a.noResponde || b.total - a.total);

    // Detalle completo de supervisiones (gestión + market place)
    const detalle: FilaDetRep[] = [...base]
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map(c => {
        if (c.tipo === 'GESTION') {
          return {
            fecha: this.fmtFechaHora(c.startDate), asesor: c.asesor || '—', tipo: 'Gestión',
            tipoBase: c.tipoBase || '—', ref: `DNI ${c.dni || '—'}`,
            estadoSup: c.estadoSup || '—', estadoAsesor: c.estadoAsesor || '—',
            resultado: c.resultado || '', obs: this.avisoTexto(c), comentario: c.comentario || '',
          };
        }
        const esKp = c.mpSubtipo === 'KOMMO PLATAFORMA';
        return {
          fecha: this.fmtFechaHora(c.startDate), asesor: c.asesor || '—',
          tipo: esKp ? 'Kommo Plataforma' : 'Market Place',
          tipoBase: c.tipoBase || '—',
          ref: esKp ? (c.cliente || '—') : `últ. pub. ${c.fechaPublicacion || '—'}`,
          estadoSup: '—',
          estadoAsesor: esKp ? (c.estadoLead || '—') : (c.estadoMp || '—'),
          resultado: esKp ? (c.estadoLead || '') : (c.estadoMp || ''),
          obs: '', comentario: c.comentario || '',
        };
      });

    return {
      desde: this.fmtFechaCorta(new Date(this.form.value.fechaInicio)),
      hasta: this.fmtFechaCorta(new Date(this.form.value.fechaFin)),
      asesor: asesorFiltro || 'Todos los asesores',
      generado: this.fmtFechaHora(new Date()),
      totalGestion: gest.length, coincide, discrepancia, sinGestion, contactabilidad,
      totalMp: mp.length,
      alDia: mp.filter(c => c.estadoMp === 'AL DÍA').length,
      desactualizado: mp.filter(c => c.estadoMp === 'DESACTUALIZADO').length,
      actualizado: mp.filter(c => c.estadoMp === 'ACTUALIZADO').length,
      porAsesor, porAsesorMp, porAsesorKp, discrepancias, detalle,
    };
  }

  // ── Exportar a Excel (multi-hoja) ────────────────────────────────────────
  async exportarReporteExcel(): Promise<void> {
    const r = this.reporte;
    if (!r) return;
    const wb = new Workbook();
    const AZUL = 'FF1E3A5F', AZUL2 = 'FF293964';

    const encabezar = (ws: any, cols: string[], fill = AZUL) => {
      const row = ws.addRow(cols);
      row.eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0BEC5' } } };
      });
    };
    const autoAncho = (ws: any, min = 10) => {
      ws.columns.forEach((col: any) => {
        let max = min;
        col.eachCell({ includeEmpty: false }, (cell: any) => {
          const l = (cell.value ?? '').toString().length + 2;
          if (l > max) max = l;
        });
        col.width = Math.min(60, max);
      });
    };

    // 1) Resumen
    const wsR = wb.addWorksheet('Resumen');
    wsR.mergeCells('A1:B1');
    const t = wsR.getCell('A1');
    t.value = 'REPORTE DE CONTROL DEL SUPERVISOR';
    t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    t.alignment = { vertical: 'middle', horizontal: 'center' };
    wsR.getRow(1).height = 24;
    wsR.addRow([]);
    const kv = [
      ['Periodo', `${r.desde} — ${r.hasta}`],
      ['Asesor', r.asesor],
      ['Generado', r.generado],
      ['', ''],
      ['Gestiones supervisadas', r.totalGestion],
      ['Coinciden', r.coincide],
      ['Discrepancias', r.discrepancia],
      ['Sin gestión del asesor', r.sinGestion],
      ['Contactabilidad confirmada', `${r.contactabilidad}%`],
      ['', ''],
      ['Market Place / Kommo revisados', r.totalMp],
      ['Al día', r.alDia],
      ['Desactualizados', r.desactualizado],
      ['Actualizados', r.actualizado],
    ];
    kv.forEach(([k, v]) => {
      const row = wsR.addRow([k, v]);
      if (k) row.getCell(1).font = { bold: true, color: { argb: AZUL } };
    });
    autoAncho(wsR, 22);

    // 2) Por asesor (con tipo de base)
    const wsA = wb.addWorksheet('Por asesor');
    encabezar(wsA, ['Asesor', 'Tipo de base', 'Supervisados', 'Coinciden', 'Discrepancias', 'Sin gestión', 'Observaciones', 'Efectividad %']);
    r.porAsesor.forEach(a => {
      const head = wsA.addRow([a.asesor, 'TOTAL', a.total, a.coincide, a.discrepancia, a.sinGestion, a.obs, a.efectividad]);
      head.eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: AZUL } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } };
      });
      a.tipos.forEach(t2 => {
        wsA.addRow(['', t2.tipoBase, t2.total, t2.coincide, t2.discrepancia, t2.sinGestion, t2.obs, '']);
      });
    });
    autoAncho(wsA);

    // 2b) Market Place Plataforma por asesor
    if (r.porAsesorMp.length) {
      const wsMp = wb.addWorksheet('Market Place');
      encabezar(wsMp, ['Asesor', 'Revisadas', 'Al día', 'Actualizadas', 'Desactualizadas', 'Prom. días sin publicar', 'Máx. días'], 'FF6A1B9A');
      r.porAsesorMp.forEach(m => {
        wsMp.addRow([m.asesor, m.total, m.alDia, m.actualizado, m.desactualizado,
          m.promDias == null ? '—' : m.promDias, m.maxDias == null ? '—' : m.maxDias]);
      });
      autoAncho(wsMp);
    }

    // 2c) Kommo Plataforma por asesor
    if (r.porAsesorKp.length) {
      const wsKp = wb.addWorksheet('Kommo Plataforma');
      encabezar(wsKp, ['Asesor', 'Leads revisados', 'Respondidos', 'Solo dio DNI', 'Aún no responde', 'Otro'], 'FF00695C');
      r.porAsesorKp.forEach(k => {
        wsKp.addRow([k.asesor, k.total, k.respondido, k.soloDni, k.noResponde, k.otro]);
      });
      autoAncho(wsKp);
    }

    // 3) Discrepancias (con motivo)
    const wsD = wb.addWorksheet('Discrepancias');
    encabezar(wsD, ['Fecha', 'Asesor', 'Tipo base', 'DNI', 'Celular', 'Estado supervisor', 'Estado asesor', 'Resultado', 'Motivo'], 'FFC62828');
    r.discrepancias.forEach(d => {
      wsD.addRow([d.fecha, d.asesor, d.tipoBase, d.dni, d.celular, d.estadoSup, d.estadoAsesor, d.resultado, d.motivo]);
    });
    autoAncho(wsD);

    // 4) Detalle completo
    const wsT = wb.addWorksheet('Detalle');
    encabezar(wsT, ['Fecha', 'Asesor', 'Tipo', 'Tipo base', 'Referencia', 'Estado supervisor', 'Estado asesor / MP', 'Resultado', 'Observación', 'Comentario'], AZUL2);
    r.detalle.forEach(d => {
      wsT.addRow([d.fecha, d.asesor, d.tipo, d.tipoBase, d.ref, d.estadoSup, d.estadoAsesor, d.resultado, d.obs, d.comentario]);
    });
    autoAncho(wsT);

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const suf = r.asesor === 'Todos los asesores' ? 'general' : r.asesor.split(' ')[0].toLowerCase();
    FileSaver.saveAs(blob, `Reporte-Supervisor-${suf}-${r.desde.replace(/\//g, '-')}_${r.hasta.replace(/\//g, '-')}.xlsx`);
    this.toast('✔ Reporte Excel descargado.');
  }

  // ── Imprimir / Guardar como PDF (ventana limpia, sin librerías) ───────────
  imprimirReporte(): void {
    const r = this.reporte;
    if (!r) return;
    const esc = (s: any) => (s ?? '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const filasAsesor = r.porAsesor.map(a => {
      const head = `<tr class="asr"><td>${esc(a.asesor)}</td><td><b>TOTAL</b></td>` +
        `<td>${a.total}</td><td>${a.coincide}</td><td class="bad">${a.discrepancia}</td>` +
        `<td>${a.sinGestion}</td><td>${a.obs}</td><td>${a.efectividad}%</td></tr>`;
      const tipos = a.tipos.map(t => `<tr class="tip"><td></td><td>${esc(t.tipoBase)}</td>` +
        `<td>${t.total}</td><td>${t.coincide}</td><td class="bad">${t.discrepancia || ''}</td>` +
        `<td>${t.sinGestion || ''}</td><td>${t.obs || ''}</td><td></td></tr>`).join('');
      return head + tipos;
    }).join('');

    const filasMp = r.porAsesorMp.map(m => `<tr><td>${esc(m.asesor)}</td><td>${m.total}</td>` +
      `<td>${m.alDia}</td><td>${m.actualizado}</td><td class="bad">${m.desactualizado || ''}</td>` +
      `<td>${m.promDias == null ? '—' : m.promDias}</td><td>${m.maxDias == null ? '—' : m.maxDias}</td></tr>`).join('');

    const filasKp = r.porAsesorKp.map(k => `<tr><td>${esc(k.asesor)}</td><td>${k.total}</td>` +
      `<td class="ok">${k.respondido}</td><td>${k.soloDni || ''}</td>` +
      `<td class="bad">${k.noResponde || ''}</td><td>${k.otro || ''}</td></tr>`).join('');

    const secMp = r.porAsesorMp.length ? `
  <h2>Market Place Plataforma por asesor — actualización de publicaciones</h2>
  <table><thead><tr><th>Asesor</th><th>Revisadas</th><th>Al día</th><th>Actualizadas</th><th>Desactualiz.</th><th>Prom. días sin publicar</th><th>Máx. días</th></tr></thead>
  <tbody>${filasMp}</tbody></table>` : '';

    const secKp = r.porAsesorKp.length ? `
  <h2>Kommo Plataforma por asesor — respuesta a leads</h2>
  <table><thead><tr><th>Asesor</th><th>Leads</th><th>Respondidos</th><th>Solo dio DNI</th><th>Aún no responde</th><th>Otro</th></tr></thead>
  <tbody>${filasKp}</tbody></table>` : '';

    const filasDisc = r.discrepancias.length
      ? r.discrepancias.map(d => `<tr><td>${esc(d.fecha)}</td><td>${esc(d.asesor)}</td><td>${esc(d.tipoBase)}</td>` +
        `<td>${esc(d.dni)}</td><td>${esc(d.celular)}</td><td>${esc(d.estadoSup)}</td><td>${esc(d.estadoAsesor)}</td>` +
        `<td class="${d.resultado === 'DISCREPANCIA' ? 'bad' : 'none'}">${esc(d.resultado)}</td><td class="mot">${esc(d.motivo)}</td></tr>`).join('')
      : '<tr><td colspan="9" class="vacio">Sin discrepancias en el periodo 🎉</td></tr>';

    const filasDet = r.detalle.map(d => `<tr><td>${esc(d.fecha)}</td><td>${esc(d.asesor)}</td><td>${esc(d.tipo)}</td>` +
      `<td>${esc(d.tipoBase)}</td><td>${esc(d.ref)}</td><td>${esc(d.estadoSup)}</td><td>${esc(d.estadoAsesor)}</td>` +
      `<td>${esc(d.resultado)}</td><td class="mot">${esc(d.obs)}</td><td class="mot">${esc(d.comentario)}</td></tr>`).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Reporte Supervisor ${esc(r.desde)} — ${esc(r.hasta)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2a44; margin: 24px; }
  h1 { font-size: 20px; color: #1E3A5F; margin: 0 0 2px; }
  .meta { color: #5b7188; font-size: 13px; margin-bottom: 16px; }
  .meta b { color: #1E3A5F; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; }
  .kpi { flex: 1 1 120px; border-radius: 10px; padding: 10px 12px; color: #fff; }
  .kpi .v { font-size: 22px; font-weight: 800; }
  .kpi .l { font-size: 11px; opacity: .95; }
  .k-tot { background: #14315a; } .k-ok { background: #2E7D32; }
  .k-bad { background: #c62828; } .k-none { background: #78909c; } .k-pct { background: #1565C0; }
  h2 { font-size: 14px; color: #1E3A5F; border-left: 4px solid #1A5FAD; padding-left: 8px; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 8px; }
  th { background: #293964; color: #fff; padding: 6px 8px; text-align: center; font-weight: 700; }
  td { border: 1px solid #dde5f0; padding: 5px 8px; text-align: center; }
  th:first-child, td:first-child, td.mot { text-align: left; }
  tr.asr td { background: #eaf2fb; font-weight: 700; color: #14315a; }
  tr.tip td { color: #55677d; }
  td.bad { color: #c62828; font-weight: 700; }
  td.ok { color: #2E7D32; font-weight: 700; }
  td.none { color: #78909c; font-weight: 700; }
  td.mot { color: #444; }
  td.vacio { color: #2E7D32; font-style: italic; }
  .disc th { background: #b02a2a; }
  footer { margin-top: 20px; font-size: 10.5px; color: #8a9bb0; text-align: center; }
  @media print { body { margin: 10mm; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style></head><body onload="window.print()">
  <h1>Reporte de Control del Supervisor</h1>
  <div class="meta"><b>Periodo:</b> ${esc(r.desde)} — ${esc(r.hasta)} &nbsp;·&nbsp; <b>Asesor:</b> ${esc(r.asesor)} &nbsp;·&nbsp; <b>Generado:</b> ${esc(r.generado)}</div>

  <div class="kpis">
    <div class="kpi k-tot"><div class="v">${r.totalGestion}</div><div class="l">Gestiones supervisadas</div></div>
    <div class="kpi k-ok"><div class="v">${r.coincide}</div><div class="l">Coinciden</div></div>
    <div class="kpi k-bad"><div class="v">${r.discrepancia}</div><div class="l">Discrepancias</div></div>
    <div class="kpi k-none"><div class="v">${r.sinGestion}</div><div class="l">Sin gestión</div></div>
    <div class="kpi k-pct"><div class="v">${r.contactabilidad}%</div><div class="l">Contactabilidad confirmada</div></div>
  </div>

  <h2>Gestión por asesor y tipo de base</h2>
  <table><thead><tr><th>Asesor</th><th>Tipo de base</th><th>Superv.</th><th>Coinc.</th><th>Discrep.</th><th>Sin gest.</th><th>Obs.</th><th>Efect.</th></tr></thead>
  <tbody>${filasAsesor}</tbody></table>
${secMp}${secKp}
  <h2>Discrepancias detalladas y su motivo</h2>
  <table class="disc"><thead><tr><th>Fecha</th><th>Asesor</th><th>Tipo base</th><th>DNI</th><th>Celular</th><th>Estado superv.</th><th>Estado asesor</th><th>Resultado</th><th>Motivo</th></tr></thead>
  <tbody>${filasDisc}</tbody></table>

  <h2>Detalle completo de supervisiones (${r.detalle.length})</h2>
  <table><thead><tr><th>Fecha</th><th>Asesor</th><th>Tipo</th><th>Tipo base</th><th>Referencia</th><th>Est. superv.</th><th>Est. asesor / MP</th><th>Resultado</th><th>Observación</th><th>Comentario</th></tr></thead>
  <tbody>${filasDet}</tbody></table>

  <footer>Dashboard Leoncito · Control del Supervisor — documento generado automáticamente</footer>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { this.toast('Habilita las ventanas emergentes para imprimir el reporte.', true); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}
