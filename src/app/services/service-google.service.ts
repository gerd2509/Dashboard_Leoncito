import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SheetsService {
  // La base sale del environment: prod (ng build) → Render https; dev (ng serve) → localhost.
  // Ya NO se comenta/descomenta nada manualmente.
  private baseUrl = `${environment.apiBase}/data`;

  // 2. Armas las rutas concatenando la base con el endpoint específico
  private apiUrlCall = `${this.baseUrl}/call`;
  private apiUrlCampo = `${this.baseUrl}/campo`;
  private apiUrlPostVenta = `${this.baseUrl}/postVenta`;
  private apiUrlpvCobranza = `${this.baseUrl}/pvCobranza`;
  private apiUrlpvControlInterno = `${this.baseUrl}/pvControlInterno`;
  private apiUrlpvCreditos = `${this.baseUrl}/pvCreditos`;
  private apiUrlpvLogistica = `${this.baseUrl}/pvLogistica`;
  private apiUrlpvOperaciones = `${this.baseUrl}/pvOperaciones`;
  private apiUrlpvServicioTecnico = `${this.baseUrl}/pvServicioTecnico`;
  private apiUrlpvVentas = `${this.baseUrl}/pvVentas`;
  private apiUrlKOMMO = `${this.baseUrl}/kommo`;
  private apiUrlFerre = `${this.baseUrl}/ferre`; // formulario de gestión de Ferreñafe
  private apiUrlSedes = `${this.baseUrl}/sedes`;
  private apiUrlCapSedes = `${this.baseUrl}/capSedes`; // CAP de asesores por sede (hoja CAP)

  constructor(private http: HttpClient) { }

  getSheetData(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlCall);
  }

  getSheetDataCampo(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlCampo);
  }

  getSheetDataPostVenta(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlPostVenta);
  }

  getSheetDataPcCobranza(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvCobranza);
  }

  getSheetDataPcControlInterno(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvControlInterno);
  }

  getSheetDataPcCreditos(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvCreditos);
  }

  getSheetDataPcLogistica(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvLogistica);
  }

  getSheetDataPcOperaciones(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvOperaciones);
  }

  getSheetDataPcServicioTecnico(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvServicioTecnico);
  }

  getSheetDataPcVentas(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvVentas);
  }

  getSheetKOMMO(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlKOMMO);
  }

  getSheetDataBySede(endpointKey: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/${endpointKey}`);
  }

  // 🏬 Sheet unificado de gestión de todas las sedes.
  // Acepta rango de fechas opcional para NO traer todo el histórico (el sheet es enorme).
  // Ej.: getSheetDataSedes({ desde: date1, hasta: date2 }) → ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
  getSheetDataSedes(rango?: { desde?: Date; hasta?: Date }): Observable<any[]> {
    let params = new HttpParams();
    if (rango?.desde) params = params.set('desde', this.fechaISO(rango.desde));
    if (rango?.hasta) params = params.set('hasta', this.fechaISO(rango.hasta));
    return this.http.get<any[]>(this.apiUrlSedes, { params });
  }

  private fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 📞 Formulario de gestión de Ferreñafe (contacto / no contacto)
  getSheetDataFerre(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlFerre);
  }

  // 👥 CAP de asesores por sede (hoja "CAP"): VENDEDOR, SEDE, CANAL, ESTADO, TIPO AV, ...
  getSheetDataCapSedes(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlCapSedes);
  }
}
