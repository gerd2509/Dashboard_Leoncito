import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { locale, loadMessages } from 'devextreme/localization';
import esMessages from 'devextreme/localization/messages/es.json';
import SelectBox from 'devextreme/ui/select_box';

// Textos por defecto de DevExtreme en español (Sí/No, paginador, "sin datos", etc.)
loadMessages(esMessages);
locale('es');

// Desplegable de TODOS los dx-select-box: se limita el alto (~34% del viewport, máx.
// 320px) para que el popup quepa DEBAJO del campo y DevExtreme lo abra HACIA ABAJO con
// scroll interno, en vez de abrirse hacia arriba y taparse en móvil.
SelectBox.defaultOptions({
  options: {
    dropDownOptions: {
      maxHeight: () => Math.min(Math.round(window.innerHeight * 0.34), 320),
    },
  },
});

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
