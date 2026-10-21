import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LucideBrainCircuit, LucideDatabase, LucideMap, LucideRadar, provideLucideIcons } from '@lucide/angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideLucideIcons(LucideBrainCircuit, LucideDatabase, LucideMap, LucideRadar),
  ],
};
