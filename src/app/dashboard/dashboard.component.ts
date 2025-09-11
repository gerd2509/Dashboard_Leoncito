import { Component } from '@angular/core';
import { AgendamientosComponent } from "../features/agendamientos/agendamientos.component";
import { DerivacionesComponent } from "../features/derivaciones/derivaciones.component";
import { CommonModule } from '@angular/common';
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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, AgendamientosComponent, DerivacionesComponent, GestionContactXHoraComponent, CierreGestionComponent, AnalisisGestionMensualComponent, VentasComponent, ProyeccionComparativoComponent, ConvertidorExcelCsvComponent, TercerosComponent, VentasCuotasTipoVentaComponent, VentasBrillaRealzzaComponent, VentaXPlazoAvComponent, VentasCampoComponent, ProyeccionFfvvCampoComponent, GestionCobranzasComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  moduloSeleccionado: string = '';;

  selectModule(modulo: string): void {
    this.moduloSeleccionado = modulo;
  }

  getTituloModulo(): string {
    switch (this.moduloSeleccionado) {
      case 'derivaciones': return 'Derivaciones';
      case 'agendamientos': return 'Agendamientos';
      case 'terceros': return 'Terceros';
      case 'gestion': return 'Gestión';
      case 'cierre': return 'Gestión Contact Center'.toUpperCase();
      case 'ventas': return 'Ventas';
      case 'ventas-campo': return 'ventas-campo';
      case 'ventas-brilla-realzza': return 'ventas-brilla-realzza';
      case 'ventas-cuotas-tipoVenta': return 'ventas-cuotas-tipoVenta';
      case 'ventas-plazo-av': return 'ventas-plazo-av';
      case 'analisis': return 'analisis';
      case 'proyeccion-comparativo': return 'proyeccion-comparativo';
      case 'proyeccion-comparativo-campo': return 'proyeccion-comparativo-campo';
      case 'cobranzas': return 'cobranzas';
      case 'conversor-csv': return 'conversor-csvo';
      default: return 'Seleccione un módulo';
    }
  }
}