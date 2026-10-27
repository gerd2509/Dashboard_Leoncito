import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

// Orígenes de nuestros propios backends (api-unificada + limpieza-sedes, que en
// dev corren en puertos distintos) — el token SOLO se manda ahí, nunca a un
// tercero, aunque algún día se agregue otra llamada externa.
const ORIGENES_PROPIOS = Array.from(new Set(
  [environment.apiBase, environment.ventasBase, environment.gestionBase, environment.aulaBase, environment.cruceBase]
    .filter(Boolean)
    .map(url => new URL(url).origin)
));

/**
 * Agrega `Authorization: Bearer <token>` a cada llamada a nuestra API (el backend
 * lo exige en todas las rutas salvo login/marca/cambiar-password). Si el backend
 * responde 401 (sin token, token vencido o inválido), cierra la sesión del lado
 * del cliente — así no queda "viéndose logueado" mientras todo lo demás falla.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  if (ORIGENES_PROPIOS.some(origen => req.url.startsWith(origen))) {
    const token = auth.getToken();
    if (token) req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError(err => {
      if (err?.status === 401 && auth.isLoggedIn()) auth.logout();
      return throwError(() => err);
    })
  );
};
