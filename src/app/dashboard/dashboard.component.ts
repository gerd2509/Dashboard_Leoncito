import { Component } from '@angular/core';
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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
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
    AgendamientosKommoComponent
],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  sidebarVisible = true;
  moduloSeleccionado: string = '';
  submenuAbierto: string | null = null;

  // 🔹 Estructura dinámica del menú
  menuItems = [
    {
      icon: 'event',
      label: 'Agendamientos',
      submenu: [
        { label: 'CALL CENTER', icon: 'call', modulo: 'agendamientos' },
        { label: 'REALZZA', icon: 'storefront', modulo: 'agendamientos-campo' },
        { label: 'KOMMO', icon: 'public', modulo: 'agendamientos-kommo' }
      ]
    },
    { icon: 'people', label: 'Terceros', modulo: 'terceros' },
    {
      icon: 'bar_chart',
      label: 'Gestión',
      submenu: [
        { label: 'CALL CENTER', icon: 'call', modulo: 'gestion' },
        { label: 'REALZZA', icon: 'storefront', modulo: 'gestion-campo' },
        { label: 'Post_venta', icon: 'storefront', modulo: 'gestion-post-venta' },
        { label: 'KOMMO', icon: 'public', modulo: 'gestion-kommo' }
      ]
    },
    { icon: 'done_all', label: 'Cierre Gestión', modulo: 'cierre' },
    { icon: 'analytics', label: 'Análisis Mensual', modulo: 'analisis' },
    {
      icon: 'shopping_cart',
      label: 'Ventas',
      submenu: [
        { label: 'CALL CENTER', icon: 'call', modulo: 'ventas' },
        { label: 'REALZZA', icon: 'storefront', modulo: 'ventas-campo' },
        { label: 'COMPARATIVO', icon: 'balance', modulo: 'ventas-comparativo' },
        { label: 'EVOLUTIVO', icon: 'balance', modulo: 'evolucion-tipo-cliente' },
      ]
    },
    { icon: 'storefront', label: 'Ventas Brilla Realzza', modulo: 'ventas-brilla-realzza' },
    { icon: 'storefront', label: 'Ventas - Cuotas - Tipo Venta', modulo: 'ventas-cuotas-tipoVenta' },
    { icon: 'storefront', label: 'Ventas - Plazo AV', modulo: 'ventas-plazo-av' },
    { icon: 'storefront', label: 'Proyección Call', modulo: 'proyeccion-comparativo' },
    { icon: 'storefront', label: 'Proyección Campo', modulo: 'proyeccion-comparativo-campo' },
    { icon: 'payments', label: 'Cobranzas', modulo: 'cobranzas' },
    { icon: 'sync_alt', label: 'Conversor CSV', modulo: 'conversor-csv' },
    { icon: 'post_add', label: 'Post Venta', modulo: 'post-venta' }
  ];

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
  }

  toggleSubmenu(menu?: string): void {
    this.submenuAbierto = this.submenuAbierto === menu ? null : menu ?? null;
  }

  selectModule(modulo?: string) {
    this.moduloSeleccionado = modulo ?? '';
  }

  getTituloModulo(): string {
    const found = this.menuItems
      .flatMap(m => m.submenu ? m.submenu : [m])
      .find(item => item.modulo === this.moduloSeleccionado);
    return found ? found.label : 'Seleccione un módulo';
  }
}

