import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AgendamientosComponent } from "../features/agendamientos/agendamientos.component";
import { GestionContactXHoraComponent } from "../features/Gestion/gestion-contact-x-hora/gestion-contact-x-hora.component";
import { CierreGestionComponent } from "../features/cierre-gestion/cierre-gestion.component";
import { VentasComponent } from "../features/ventas/ventas.component";
import { ConvertidorExcelCsvComponent } from "../features/convertidor-excel-csv/convertidor-excel-csv.component";
import { VentaXPlazoAvComponent } from "../features/venta-x-plazo-av/venta-x-plazo-av.component";
import { VentasCampoComponent } from "../features/ventas-campo/ventas-campo.component";
import { VentasSedesComponent } from "../features/ventas-sedes/ventas-sedes.component";
import { GestionCampoRealzzaComponent } from "../features/Gestion/gestion-campo-realzza/gestion-campo-realzza.component";
import { AgendamientosCampoComponent } from "../features/agendamientos/agendamientos-campo/agendamientos-campo.component";
import { AgendamientosSedesComponent } from "../features/agendamientos/agendamientos-sedes/agendamientos-sedes.component";
import { ComparativoVentasComponent } from "../features/comparativo-ventas/comparativo-ventas.component";
import { PostVentaComponent } from "../features/post-venta/post-venta.component";
import { GestionPostVentaComponent } from "../features/Gestion/gestion-post-venta/gestion-post-venta.component";
import { EvolucionTipoClienteComponent } from "../features/evolucion-tipo-cliente/evolucion-tipo-cliente.component";
import { GestionKommoComponent } from "../features/Gestion/gestion-kommo/gestion-kommo.component";
import { AgendamientosKommoComponent } from "../features/agendamientos/agendamientos-kommo/agendamientos-kommo.component";
import { ControlGestionSedeComponent } from "../features/control-gestion-sede/control-gestion-sede.component";
import { GestionSedeComponent } from "../features/Gestion/gestion-sede/gestion-sede.component";
import { GestionCallSedesComponent } from "../features/Gestion/gestion-call-sedes/gestion-call-sedes.component";
import { ControlCallSedesComponent } from "../features/control-call-sedes/control-call-sedes.component";
import { SeguridadComponent } from "../features/seguridad/seguridad.component";
import { LimpiezaBbddComponent } from "../features/limpieza-bbdd/limpieza-bbdd.component";
import { GpsRutaComponent } from "../features/gps-ruta/gps-ruta.component";
import { PizarraMetasComponent } from "../features/pizarra-metas/pizarra-metas.component";
import { AvanceCarteraComponent } from "../features/avance-cartera/avance-cartera.component";
import { EmbudosGestionComponent } from "../features/embudos-gestion/embudos-gestion.component";
import { RegistroGestionComponent } from "../features/registro-gestion/registro-gestion.component";
import { RegistroSupervisorComponent } from "../features/control-supervisor/registro-supervisor/registro-supervisor.component";
import { ControlSupervisorComponent } from "../features/control-supervisor/control-supervisor.component";
import { GestionSupervisorComponent } from "../features/control-supervisor/gestion-supervisor/gestion-supervisor.component";
import { ComparativoCarteraVentasComponent } from "../features/comparativo-cartera-ventas/comparativo-cartera-ventas.component";
import { CargaVentasComponent } from "../features/carga-ventas/carga-ventas.component";
import { AuthService } from '../services/auth.service';
import { LionIconComponent } from '../shared/lion-icon/lion-icon.component';
import { PermissionsService } from '../services/permissions.service';
import { SedeConfigService } from '../services/sede-config.service';
import { BrandService, Brand } from '../services/brand.service';

interface SubItem { label: string; icon: string; modulo: string; }
interface MenuItem {
  icon: string;
  label: string;
  modulo?: string;
  adminOnly?: boolean;
  submenu?: SubItem[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, MatIconModule,
    LionIconComponent,
    AgendamientosComponent,
    GestionContactXHoraComponent,
    CierreGestionComponent,
    VentasComponent,
    ConvertidorExcelCsvComponent,
    VentaXPlazoAvComponent,
    VentasCampoComponent,
    VentasSedesComponent,
    GestionCampoRealzzaComponent,
    AgendamientosCampoComponent,
    ComparativoVentasComponent,
    PostVentaComponent,
    GestionPostVentaComponent,
    EvolucionTipoClienteComponent,
    GestionKommoComponent,
    AgendamientosKommoComponent,
    AgendamientosSedesComponent,
    ControlGestionSedeComponent,
    GestionSedeComponent,
    GestionCallSedesComponent,
    ControlCallSedesComponent,
    SeguridadComponent,
    LimpiezaBbddComponent,
    GpsRutaComponent,
    PizarraMetasComponent,
    AvanceCarteraComponent,
    EmbudosGestionComponent,
    RegistroGestionComponent,
    RegistroSupervisorComponent,
    ControlSupervisorComponent,
    GestionSupervisorComponent,
    ComparativoCarteraVentasComponent,
    CargaVentasComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  sidebarVisible = true;
  isMobile = false;
  moduloSeleccionado = '';
  submenuAbierto: string | null = null;
  menuItemsVisibles: MenuItem[] = [];

  // ── 🦁 Mascota Leoncito ──
  readonly frases = [
    '¡Vamos, equipo! 🦁',
    '¡A vender! 🚀',
    '¡Tú puedes! 💪',
    'Leoncito contigo 🦁',
    '¡Hoy es un gran día! ☀️',
  ];
  fraseIndex = 0;
  celebrando = false;
  private fraseTimer?: ReturnType<typeof setInterval>;
  private celebrarTimer?: ReturnType<typeof setTimeout>;

  readonly menuItems: MenuItem[] = [
    {
      icon: 'event', label: 'Agendamientos',
      submenu: [
        { label: 'CALL CENTER', icon: 'call',      modulo: 'agendamientos' },
        { label: 'REALZZA',     icon: 'storefront', modulo: 'agendamientos-campo' },
        { label: 'KOMMO',       icon: 'public',     modulo: 'agendamientos-kommo' },
        { label: 'SEDES',       icon: 'location_city', modulo: 'agendamientos-sedes' }
      ]
    },
    {
      icon: 'bar_chart', label: 'Gestión',
      submenu: [
        { label: 'CALL CENTER', icon: 'call',      modulo: 'gestion' },
        { label: 'REALZZA',     icon: 'storefront', modulo: 'gestion-campo' },
        { label: 'Post Venta',  icon: 'storefront', modulo: 'gestion-post-venta' },
        { label: 'KOMMO',       icon: 'public',        modulo: 'gestion-kommo' },
        { label: 'SEDES',       icon: 'location_city', modulo: 'gestion-sede' },
        { label: 'CALL SEDES',  icon: 'call',          modulo: 'gestion-call-sedes' },
        { label: 'SUPERVISOR',  icon: 'fact_check',    modulo: 'gestion-supervisor' }
      ]
    },
    { icon: 'done_all',    label: 'Cierre Gestión',      modulo: 'cierre' },
    {
      icon: 'shopping_cart', label: 'Ventas',
      submenu: [
        { label: 'CALL CENTER',  icon: 'call',      modulo: 'ventas' },
        { label: 'REALZZA',      icon: 'storefront', modulo: 'ventas-campo' },
        { label: 'SEDES',        icon: 'location_city', modulo: 'ventas-sedes' },
        { label: 'COMPARATIVO',  icon: 'balance',    modulo: 'ventas-comparativo' },
        { label: 'EVOLUTIVO',    icon: 'balance',    modulo: 'evolucion-tipo-cliente' }
      ]
    },
    { icon: 'storefront',  label: 'Ventas - Plazo AV',            modulo: 'ventas-plazo-av' },
    { icon: 'sync_alt',    label: 'Conversor CSV',                modulo: 'conversor-csv' },
    { icon: 'cleaning_services', label: 'Limpieza BBDD',          modulo: 'limpieza-bbdd' },
    { icon: 'route',       label: 'Optimizar Rutas GPS',          modulo: 'gps-ruta' },
    { icon: 'post_add',    label: 'Post Venta',                   modulo: 'post-venta' },
    { icon: 'location_city', label: 'Control Gestión Sede',       modulo: 'control-gestion-sede' },
    { icon: 'call',          label: 'Control Call Sedes',         modulo: 'control-call-sedes' },
    { icon: 'dashboard',     label: 'Pizarra de Metas',           modulo: 'pizarra-metas' },
    { icon: 'trending_up',   label: 'Avance de Cartera',          modulo: 'avance-cartera' },
    { icon: 'filter_alt',    label: 'Embudos de Gestión',         modulo: 'embudos-gestion' },
    { icon: 'assignment_turned_in', label: 'Registro de Gestión',  modulo: 'registro-gestion' },
    { icon: 'fact_check',           label: 'Registro Supervisor',  modulo: 'registro-supervisor' },
    { icon: 'event_available',      label: 'Control Supervisor',   modulo: 'control-supervisor' },
    { icon: 'compare_arrows',       label: 'Comparativo Cartera Ventas Piso', modulo: 'comparativo-cartera-ventas' },
    { icon: 'cloud_upload',         label: 'Carga de Ventas',      modulo: 'carga-ventas', adminOnly: true },
    { icon: 'admin_panel_settings', label: 'Seguridad',           modulo: 'seguridad', adminOnly: true },
  ];

  constructor(
    public auth: AuthService,
    private permissions: PermissionsService,
    private sedeConfig: SedeConfigService,
    private brandSvc: BrandService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.aplicarViewport();   // en celular el menú arranca cerrado (drawer)

    // Trae la matriz de permisos desde la BD (Neon) antes de armar el menú.
    await this.permissions.cargarDesdeBackend();
    this.menuItemsVisibles = this.calcularMenuVisible();

    const u = this.auth.getUsuario();
    if (u && u.rol !== 'admin') {
      for (const item of this.menuItemsVisibles) {
        if (item.submenu?.length) {
          const primer = item.submenu.find(s => s.modulo);
          if (primer) {
            this.moduloSeleccionado = primer.modulo;
            this.submenuAbierto = item.label;
            break;
          }
        } else if (item.modulo) {
          this.moduloSeleccionado = item.modulo;
          break;
        }
      }
    }

    // Frases rotativas del leoncito
    this.fraseTimer = setInterval(() => {
      this.fraseIndex = (this.fraseIndex + 1) % this.frases.length;
    }, 4500);
  }

  ngOnDestroy(): void {
    clearInterval(this.fraseTimer);
    clearTimeout(this.celebrarTimer);
  }

  /** Frase actual del leoncito. */
  get frase(): string {
    return this.frases[this.fraseIndex];
  }

  /** Inicial del usuario para el badge del leoncito (fallback: L de Leoncito). */
  get inicial(): string {
    const n = this.auth.getUsuario()?.nombre?.trim() ?? '';
    return n ? n.charAt(0).toUpperCase() : 'L';
  }

  /** Marca (Leoncito / Realzza) según la sede del usuario. */
  get brand(): Brand {
    return this.brandSvc.fromSede(this.auth.getUsuario()?.sede);
  }

  /** Dispara la animación de celebración (confeti + festejo) por un instante. */
  celebrar(): void {
    this.celebrando = true;
    clearTimeout(this.celebrarTimer);
    this.celebrarTimer = setTimeout(() => (this.celebrando = false), 1300);
  }

  private calcularMenuVisible(): MenuItem[] {
    const u = this.auth.getUsuario();
    if (!u) return [];
    if (u.rol === 'admin') return this.menuItems;

    const esGlobal = u.sede.toLowerCase() === 'todas';
    const nombreSede = esGlobal ? 'Sedes' : (this.sedeConfig.getConfig(u.sede)?.nombre ?? u.sede);
    const sedeUpper = nombreSede.toUpperCase();

    const visibles = this.menuItems
      .map(item => {
        if (item.adminOnly) return null;
        if (item.submenu) {
          const subs = item.submenu
            .filter(s => this.permissions.canAccess(s.modulo, u.rol, u.sede))
            .map(s => ({
              ...s,
              label:
                s.modulo === 'gestion-sede'        ? `PISO ${sedeUpper}` :
                s.modulo === 'gestion-call-sedes'  ? `CALL ${sedeUpper}` :
                s.modulo === 'ventas-sedes'        ? `SEDE ${sedeUpper}` :
                s.label,
            }));
          return subs.length ? { ...item, submenu: subs } : null;
        }
        if (!item.modulo || !this.permissions.canAccess(item.modulo, u.rol, u.sede)) return null;
        const label =
          item.modulo === 'control-gestion-sede' ? `Control Gestión ${nombreSede}` :
          item.modulo === 'control-call-sedes'   ? `Control Call ${nombreSede}` :
          item.label;
        return { ...item, label };
      })
      .filter((i): i is MenuItem => i !== null);

    // Orden solicitado al iniciar sesión (por perfil de sede). Los ítems no
    // listados conservan su orden original al final.
    const orden = [
      'control-gestion-sede', 'control-call-sedes', 'pizarra-metas', 'avance-cartera',
      'Gestión', 'Ventas', 'Agendamientos',
    ];
    const pos = (it: MenuItem): number => {
      const id = it.modulo ?? it.label;
      const i = orden.indexOf(id);
      return i === -1 ? orden.length + 1 : i;
    };
    return visibles.sort((a, b) => pos(a) - pos(b));
  }

  get usuario() { return this.auth.getUsuario(); }

  // Ajusta el layout a móvil (≤768px): el sidebar pasa a ser un cajón (drawer)
  // que arranca cerrado; en escritorio queda visible.
  @HostListener('window:resize')
  onResize(): void { this.aplicarViewport(); }

  private aplicarViewport(): void {
    const mobile = window.innerWidth <= 768;
    if (mobile !== this.isMobile) {
      this.isMobile = mobile;
      this.sidebarVisible = !mobile;
    }
  }

  toggleSidebar() { this.sidebarVisible = !this.sidebarVisible; }

  toggleSubmenu(label: string): void {
    const item = this.menuItemsVisibles.find(m => m.label === label);

    // Si el submenú visible tiene solo 1 ítem: seleccionarlo siempre
    // y mantener el submenú abierto (nunca cerrar con toggle)
    if (item?.submenu?.length === 1 && item.submenu[0].modulo) {
      this.moduloSeleccionado = item.submenu[0].modulo;
      this.submenuAbierto = label;
      return;
    }

    // Comportamiento normal de toggle para submenús con múltiples ítems
    this.submenuAbierto = this.submenuAbierto === label ? null : label;
  }

  selectModule(modulo?: string) {
    this.moduloSeleccionado = modulo ?? '';
    this.celebrar();
    if (this.isMobile) this.sidebarVisible = false;   // cierra el drawer al elegir
  }

  // Para ítems de nivel superior SIN submenú: además de seleccionar,
  // cierra cualquier submenú que haya quedado abierto.
  selectModuleRaiz(modulo?: string) {
    this.submenuAbierto = null;
    this.selectModule(modulo);
  }

  logout() { this.auth.logout(); }

  getTituloModulo(): string {
    const found = this.flatMenuItems(this.menuItems).find(i => i.modulo === this.moduloSeleccionado);
    return found?.label ?? 'Seleccione un módulo';
  }

  private flatMenuItems(items: MenuItem[]): Array<{ label: string; icon: string; modulo?: string }> {
    return items.flatMap(m => m.submenu ? m.submenu : [{ label: m.label, icon: m.icon, modulo: m.modulo }]);
  }
}
