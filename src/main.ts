import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { ComprovantePaginaComponent } from './app/components/comprovante/comprovante-pagina.component';
import { ROTA_COMPROVANTE } from './app/core/comprovante-link';

// /comprovante (aberto pelo QR Code no celular) sobe só a página do cupom, sem a Central.
const raiz = location.pathname.replace(/\/$/, '') === ROTA_COMPROVANTE ? ComprovantePaginaComponent : AppComponent;

bootstrapApplication(raiz, appConfig).catch((err) => console.error(err));
