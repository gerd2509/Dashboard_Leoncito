import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AgendamientosComponent } from "../features/agendamientos/agendamientos.component";
import { GestionContactXHoraComponent } from "../features/Gestion/gestion-contact-x-hora/gestion-contact-x-hora.component";
import { CierreGestionComponent } from "../features/cierre-gestion/cierre-gestion.component";
import { AnalisisGestionMensualComponent } from "../features/analisis-gestion-mensual/analisis-gestion-mensual.component";
import { VentasComponent } from "../features/ventas/ventas.component";
import { ProyeccionComparativoComponent } from "../features/proyeccion-comparativo/proyeccion-comparativo.component";
import { ConvertidorExcelCsvComponent } from "../features/convertidor-excel-csv/convertidor-excel-csv.component";
import { TercerosComponent } from "../features/terceros/terceros.component";
import { VentasCuotasTipoVentaComponent } from "../features/ventas-cuotas-tipo-venta/ventas-cuotas-tipo-venta.component";
import { VentasBrillaRealzzaComponent } from "../features/ventas-brilla-realzza/ventas-brilla-realzza.component";
import { VentaXPlazoAvComponent } from "../features/venta-x-plazo-av/venta-x-plazo-av.component";
import { VentasCampoComponent } from "../features/ventas-campo/ventas-campo.component";
import { ProyeccionFfvvCampoComponent } from "../features/proyeccion-ffvv-campo/proyeccion-ffvv-campo.component";
import { GestionCobranzasComponent } from "../features/gestion-cobranzas/gestion-cobranzas.component";
import { GestionCampoRealzzaComponent } from "../features/Gestion/gestion-campo-realzza/gestion-campo-realzza.component";
import { AgendamientosCampoComponent } from "../features/agendamientos/agendamientos-campo/agendamientos-campo.component";
import { ComparativoVentasComponent } from "../features/comparativo-ventas/comparativo-ventas.component";
import { PostVentaComponent } from "../features/post-venta/post-venta.component";
import { GestionPostVentaComponent } from "../features/Gestion/gestion-post-venta/gestion-post-venta.component";
import { EvolucionTipoClienteComponent } from "../features/evolucion-tipo-cliente/evolucion-tipo-cliente.component";
import { GestionKommoComponent } from "../features/Gestion/gestion-kommo/gestion-kommo.component";
import { AgendamientosKommoComponent } from "../features/agendamientos/agendamientos-kommo/agendamientos-kommo.component";
import { ControlGestionFerrenafeComponent } from "../features/control-gestion-ferrenafe/control-gestion-ferrenafe.component";
import { GestionFerrenafeComponent } from "../features/Gestion/gestion-ferrenafe/gestion-ferrenafe.component";
import { SeguridadComponent } from "../features/seguridad/seguridad.component";
import { AuthService } from '../services/auth.service';
import { PermissionsService } from '../services/permissions.service';
import { SedeConfigService } from '../services/sede-config.service';

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
    AgendamientosComponent,
    GestionContactXHoraComponent,
    CierreGestionComponent,
    AnalisisGestionMensualComponent,
    VentasComponent,
    ProyeccionComparativoComponent,
    ConvertidorExcelCsvComponent,
    TercerosComponent,
    VentasCuotasTipoVentaComponent,
    VentasBrillaRealzzaComponent,
    VentaXPlazoAvComponent,
    VentasCampoComponent,
    ProyeccionFfvvCampoComponent,
    GestionCobranzasComponent,
    GestionCampoRealzzaComponent,
    AgendamientosCampoComponent,
    ComparativoVentasComponent,
    PostVentaComponent,
    GestionPostVentaComponent,
    EvolucionTipoClienteComponent,
    GestionKommoComponent,
    AgendamientosKommoComponent,
    ControlGestionFerrenafeComponent,
    GestionFerrenafeComponent,
    SeguridadComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  sidebarVisible = true;
  moduloSeleccionado = '';
  submenuAbierto: string | null = null;
  menuItemsVisibles: MenuItem[] = [];

  readonly menuItems: MenuItem[] = [
    {
      icon: 'event', label: 'Agendamientos',
      submenu: [
        { label: 'CALL CENTER', icon: 'call',      modulo: 'agendamientos' },
        { label: 'REALZZA',     icon: 'storefront', modulo: 'agendamientos-campo' },
        { label: 'KOMMO',       icon: 'public',     modulo: 'agendamientos-kommo' }
      ]
    },
    { icon: 'people',      label: 'Terceros',          modulo: 'terceros' },
    {
      icon: 'bar_chart', label: 'Gestión',
      submenu: [
        { label: 'CALL CENTER', icon: 'call',      modulo: 'gestion' },
        { label: 'REALZZA',     icon: 'storefront', modulo: 'gestion-campo' },
        { label: 'Post Venta',  icon: 'storefront', modulo: 'gestion-post-venta' },
        { label: 'KOMMO',       icon: 'public',        modulo: 'gestion-kommo' },
        { label: 'FERREÑAFE',   icon: 'location_city', modulo: 'gestion-sede' }
      ]
    },
    { icon: 'done_all',    label: 'Cierre Gestión',      modulo: 'cierre' },
    { icon: 'analytics',   label: 'Análisis Mensual',    modulo: 'analisis' },
    {
      icon: 'shopping_cart', label: 'Ventas',
      submenu: [
        { label: 'CALL CENTER',  icon: 'call',      modulo: 'ventas' },
        { label: 'REALZZA',      icon: 'storefront', modulo: 'ventas-campo' },
        { label: 'COMPARATIVO',  icon: 'balance',    modulo: 'ventas-comparativo' },
        { label: 'EVOLUTIVO',    icon: 'balance',    modulo: 'evolucion-tipo-cliente' }
      ]
    },
    { icon: 'storefront',  label: 'Ventas Brilla Realzza',        modulo: 'ventas-brilla-realzza' },
    { icon: 'storefront',  label: 'Ventas - Cuotas - Tipo Venta', modulo: 'ventas-cuotas-tipoVenta' },
    { icon: 'storefront',  label: 'Ventas - Plazo AV',            modulo: 'ventas-plazo-av' },
    { icon: 'storefront',  label: 'Proyección Call',              modulo: 'proyeccion-comparativo' },
    { icon: 'storefront',  label: 'Proyección Campo',             modulo: 'proyeccion-comparativo-campo' },
    { icon: 'payments',    label: 'Cobranzas',                    modulo: 'cobranzas' },
    { icon: 'sync_alt',    label: 'Conversor CSV',                modulo: 'conversor-csv' },
    { icon: 'post_add',    label: 'Post Venta',                   modulo: 'post-venta' },
    { icon: 'location_city', label: 'Control Gestión Sede',       modulo: 'control-gestion-sede' },
    { icon: 'admin_panel_settings', label: 'Seguridad',           modulo: 'seguridad', adminOnly: true },
  ];

  constructor(
    public auth: AuthService,
    private permissions: PermissionsService,
    private sedeConfig: SedeConfigService,
  ) {}

  ngOnInit(): void {
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
  }

  private calcularMenuVisible(): MenuItem[] {
    const u = this.auth.getUsuario();
    if (!u) return [];
    if (u.rol === 'admin') return this.menuItems;

    const nombreSede = this.sedeConfig.getConfig(u.sede)?.nombre ?? u.sede;

    return this.menuItems
      .map(item => {
        if (item.adminOnly) return null;
        if (item.submenu) {
          const subs = item.submenu
            .filter(s => this.permissions.canAccess(s.modulo, u.rol, u.sede))
            .map(s => ({
              ...s,
              label: s.modulo === 'gestion-sede' ? nombreSede.toUpperCase() : s.label,
            }));
          return subs.length ? { ...item, submenu: subs } : null;
        }
        if (!item.modulo || !this.permissions.canAccess(item.modulo, u.rol, u.sede)) return null;
        const label = item.modulo === 'control-gestion-sede'
          ? `Control Gestión ${nombreSede}`
          : item.label;
        return { ...item, label };
      })
      .filter((i): i is MenuItem => i !== null);
  }

  get usuario() { return this.auth.getUsuario(); }

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

  selectModule(modulo?: string) { this.moduloSeleccionado = modulo ?? ''; }

  logout() { this.auth.logout(); }

  getTituloModulo(): string {
    const found = this.flatMenuItems(this.menuItems).find(i => i.modulo === this.moduloSeleccionado);
    return found?.label ?? 'Seleccione un módulo';
  }

  private flatMenuItems(items: MenuItem[]): Array<{ label: string; icon: string; modulo?: string }> {
    return items.flatMap(m => m.submenu ? m.submenu : [{ label: m.label, icon: m.icon, modulo: m.modulo }]);
  }
}
