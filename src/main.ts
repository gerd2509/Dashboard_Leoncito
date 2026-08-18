import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { locale, loadMessages } from 'devextreme/localization';
import esMessages from 'devextreme/localization/messages/es.json';
import SelectBox from 'devextreme/ui/select_box';
import TagBox from 'devextreme/ui/tag_box';
import Autocomplete from 'devextreme/ui/autocomplete';

// Textos por defecto de DevExtreme en español (Sí/No, paginador, "sin datos", etc.)
loadMessages(esMessages);
locale('es');

// ── Desplegables (SelectBox/TagBox/Autocomplete) SIEMPRE hacia ABAJO ──────────────
// En móvil, con listas largas y el campo a media pantalla, DevExtreme abría el popup
// hacia arriba (su default es `collision: 'flip flip'`). Solución determinista:
//  1) popupPosition con `collision: 'flip fit'` → el eje VERTICAL nunca voltea: el popup
//     queda SIEMPRE debajo del campo y se ajusta al viewport (aplica antes de abrir, sin
//     parpadeo). DevExtreme le agrega `of` = el propio campo automáticamente.
//  2) maxHeight (~40% del viewport, máx. 360px) → el resto de opciones con scroll interno.
const ddMaxHeight = () => Math.min(Math.round(window.innerHeight * 0.4), 360);

for (const Widget of [SelectBox, TagBox, Autocomplete]) {
  Widget.defaultOptions({
    options: {
      popupPosition: { my: 'left top', at: 'left bottom', collision: 'flip fit' },
      dropDownOptions: { maxHeight: ddMaxHeight },
    },
  });
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
