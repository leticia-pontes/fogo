import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  LucideActivity,
  LucideBrainCircuit,
  LucideCheckCircle2,
  LucideCloudRainWind,
  LucideCompass,
  LucideCpu,
  LucideDatabase,
  LucideLocateFixed,
  LucideMap,
  LucideMapPin,
  LucidePlusCircle,
  LucideRadar,
  LucideRotateCcw,
  LucideSearch,
  LucideShield,
  LucideShieldAlert,
  LucideTriangleAlert,
  LucideX,
  LucideZap,
  provideLucideIcons,
} from '@lucide/angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideLucideIcons(
      LucideActivity,
      LucideBrainCircuit,
      LucideCheckCircle2,
      LucideCloudRainWind,
      LucideCompass,
      LucideCpu,
      LucideDatabase,
      LucideLocateFixed,
      LucideMap,
      LucideMapPin,
      LucidePlusCircle,
      LucideRadar,
      LucideRotateCcw,
      LucideSearch,
      LucideShield,
      LucideShieldAlert,
      LucideTriangleAlert,
      LucideX,
      LucideZap
    ),
  ],
};
