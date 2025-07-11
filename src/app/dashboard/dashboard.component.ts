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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, AgendamientosComponent, DerivacionesComponent, GestionContactXHoraComponent, CierreGestionComponent, AnalisisGestionMensualComponent, VentasComponent, ProyeccionComparativoComponent, ConvertidorExcelCsvComponent],
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
      case 'ventas': return 'Ventas';
      case 'analisis': return 'analisis';
      case 'proyeccion-comparativo': return 'proyeccion-comparativo';
      case 'conversor-csv': return 'conversor-csvo';
      default: return 'Seleccione un módulo';
    }
  }
}