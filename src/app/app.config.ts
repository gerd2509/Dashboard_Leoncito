import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withFetch } from '@angular/common/http';

// App 100% de cliente (SPA): NO se usa hidratación/SSR. Con provideClientHydration
// + withEventReplay la app quedaba sin responder y "recargando" al refrescar,
// porque intentaba hidratar un DOM que nunca se renderizó en servidor.
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
  ]
};
