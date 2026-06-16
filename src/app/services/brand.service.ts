import { Injectable } from '@angular/core';

export type BrandId = 'leoncito' | 'realzza';

export interface Brand {
  id: BrandId;
  nombre: string;   // Texto de marca: 'LEONCITO'
  emoji: string;    // Mascota/ícono: '🦁'
  rgb: string;      // Color de acento en formato R,G,B para usar en rgba(var(--..), a)
}

const BRANDS: Record<BrandId, Brand> = {
  leoncito: { id: 'leoncito', nombre: 'LEONCITO', emoji: '🦁', rgb: '240,116,32' },
  // Realzza nació de Leoncito: mismo leoncito pero en blanco (filtro CSS .emoji-blanco)
  realzza:  { id: 'realzza',  nombre: 'REALZZA',  emoji: '🦁', rgb: '26,95,173'  },
};

@Injectable({ providedIn: 'root' })
export class BrandService {

  /** Marca por defecto cuando aún no se conoce al usuario. */
  get default(): Brand { return BRANDS.leoncito; }

  byId(id: BrandId): Brand { return BRANDS[id]; }

  /** Resuelve la marca según la sede: 'realzza' → Realzza; cualquier otra → Leoncito. */
  fromSede(sede: string | null | undefined): Brand {
    return this.normalizar(sede) === 'realzza' ? BRANDS.realzza : BRANDS.leoncito;
  }

  /** Acepta una marca/sede textual (lo que devuelva el backend) y la mapea a una marca. */
  fromValor(valor: string | null | undefined): Brand {
    const v = this.normalizar(valor);
    if (v === 'realzza') return BRANDS.realzza;
    if (v === 'leoncito') return BRANDS.leoncito;
    return this.fromSede(valor);
  }

  private normalizar(v: string | null | undefined): string {
    return (v ?? '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]/g, '');
  }
}
