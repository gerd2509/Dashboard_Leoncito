import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { locale, loadMessages } from 'devextreme/localization';
import esMessages from 'devextreme/localization/messages/es.json';

// Textos por defecto de DevExtreme en español (Sí/No, paginador, "sin datos", etc.)
loadMessages(esMessages);
locale('es');

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
