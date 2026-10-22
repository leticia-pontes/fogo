import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { daysFromToday } from '../data/mock-data';
import { CityEvent } from '../models/fogo.models';
import { CityStateService, EMPTY_FILTERS } from './city-state.service';
import { UiStateService } from './ui-state.service';

export type MissionPhase = 'calibration' | 'free';
export type MissionStep = 1 | 2 | 3;

const STORAGE_KEY = 'fogo:mission:v1';
/** Bairro onde a anomalia do passo 2 acontece: já tem previsão de colapso, o que conecta com o passo 3. */
const ANOMALY_DISTRICT = 'Entroncamento';

export const MISSION_STEPS: Record<MissionStep, { title: string; module: string; text: string; action: string }> = {
  1: {
    title: 'Calibrar Memória',
    module: 'Inventário',
    text: 'PROMETHEUS detectou sinal de um novo Radar e de uma Viatura em campo, mas eles ainda não constam no catálogo. Registre o ativo para iniciar a telemetria.',
    action: 'Abrir Cadastro Rápido',
  },
  2: {
    title: 'Calibrar Percepção',
    module: 'Central de Operações',
    text: 'Equipamento sincronizado! Porém, uma anomalia crítica acaba de ocorrer na rede. Se algo acontecer agora, PROMETHEUS conseguirá perceber? Filtre ou inspecione o alerta vermelho no mapa.',
    action: 'Focar Anomalia no Mapa',
  },
  3: {
    title: 'Calibrar Antecipação',
    module: 'Cidade Preditiva',
    text: 'A falha atual vai gerar sobrecarga nas vias vizinhas no próximo horário de pico. Acesse a visão preditiva para antecipar o problema antes que ele ocorra.',
    action: 'Ver Previsão e Agir',
  },
};

/**
 * Fase 1 do storytelling: guia o usuário pelos 3 módulos reagindo ao que ele faz de verdade
 * (cadastrar, inspecionar, aplicar recomendação). Nunca bloqueia a tela; pode ser pulada a qualquer momento.
 */
@Injectable({ providedIn: 'root' })
export class MissionService {
  private readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private lastSeenEventId: string | null = null;

  readonly phase = signal<MissionPhase>('calibration');
  readonly step = signal<MissionStep>(1);
  readonly minimized = signal(false);
  readonly anomalyId = signal<string | null>(null);
  /** Destaca o menu de cenários logo após a calibração. */
  readonly justCalibrated = signal(false);

  readonly current = computed(() => MISSION_STEPS[this.step()]);

  constructor() {
    this.restore();
    this.lastSeenEventId = this.city.events()[0]?.id ?? null;

    effect(() => {
      const state = { phase: this.phase(), step: this.step() };
      if (!this.isBrowser) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Sem armazenamento: o tutorial apenas recomeça ao recarregar.
      }
    });

    // Avança os passos a partir das ações reais registradas na cidade.
    effect(() => {
      const latest = this.city.events()[0];
      if (!latest || latest.id === this.lastSeenEventId) return;
      this.lastSeenEventId = latest.id;
      untracked(() => this.onEvent(latest));
    });

    // Passo 2 também é concluído ao inspecionar um equipamento com falha ou furtado.
    effect(() => {
      const selected = this.city.selectedEquipment();
      if (!selected || selected.status === 'operational') return;
      if (untracked(() => this.phase() === 'calibration' && this.step() === 2)) this.completeStep2();
    });
  }

  // ---------------------------------------------------------------------------
  // Ações do dock
  // ---------------------------------------------------------------------------

  runStepAction(): void {
    switch (this.step()) {
      case 1:
        return this.ui.openInventory({ mode: 'create', kind: 'equipment', hintAutofill: true });
      case 2:
        return this.focusAnomaly();
      case 3:
        this.ui.closeInventory();
        this.ui.activeTab.set('predictive');
    }
  }

  advance(): void {
    if (this.step() === 1) this.completeStep1();
    else if (this.step() === 2) this.completeStep2();
  }

  skip(): void {
    this.phase.set('free');
    this.ui.notify('Modo Livre ativado. Use "Simular Cenários" para testar a cidade.', 'info');
  }

  restart(): void {
    this.phase.set('calibration');
    this.step.set(1);
    this.minimized.set(false);
    this.anomalyId.set(null);
  }

  // ---------------------------------------------------------------------------

  private onEvent(event: CityEvent): void {
    if (this.phase() !== 'calibration') return;
    const step = this.step();
    if (step === 1 && (event.kind === 'equipment_created' || event.kind === 'agent_created')) this.completeStep1();
    else if (step === 2 && event.kind === 'status_changed') this.completeStep2();
    else if (step === 3 && event.kind === 'prediction_applied') this.finish();
  }

  private completeStep1(): void {
    this.step.set(2);
    this.ui.goToMap();
    this.injectAnomaly();
  }

  private completeStep2(): void {
    this.step.set(3);
  }

  private finish(): void {
    this.phase.set('free');
    // Remove o filtro crítico aplicado no passo 2 para a Central voltar à visão completa.
    this.city.filters.set(EMPTY_FILTERS);
    this.ui.notify('Sistema F.O.G.O. 100% Calibrado!', 'good', 4500);
    this.justCalibrated.set(true);
    setTimeout(() => this.justCalibrated.set(false), 8000);
  }

  /** Simula uma falha crítica real em um equipamento de fiscalização operacional. */
  private injectAnomaly(): void {
    const enforcement = this.city
      .equipment()
      .filter((e) => ['radar', 'camera', 'barrier_gate'].includes(e.type) && e.status === 'operational');
    const target = enforcement.find((e) => e.location.neighborhood === ANOMALY_DISTRICT) ?? enforcement[0];
    if (!target) return;
    this.city.patchEquipment([target.id], (e) => ({
      ...e,
      status: 'malfunction',
      maintenance: { priority: 'immediate', nextDate: daysFromToday(0) },
    }));
    this.anomalyId.set(target.id);
    this.city.log(`[Telemetria] ${target.serialNumber} (${target.location.neighborhood}) → Mau funcionamento`, 'bad', 'telemetry');
  }

  private focusAnomaly(): void {
    this.ui.goToMap();
    const anomaly = this.city.equipment().find((e) => e.id === this.anomalyId());
    const target =
      anomaly && anomaly.status !== 'operational'
        ? anomaly
        : this.city.equipment().find((e) => e.status === 'malfunction' || e.status === 'stolen');
    if (!target) return;
    // Destaca o filtro crítico: o mapa passa a mostrar só equipamentos nessa situação.
    this.city.filters.set({ ...EMPTY_FILTERS, status: target.status });
    this.ui.focusPoint(target.location.lat, target.location.lng);
  }

  private restore(): void {
    if (!this.isBrowser) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { phase?: MissionPhase; step?: MissionStep } | null;
      if (saved?.phase === 'free') this.phase.set('free');
      // Recarregar no meio da calibração recomeça do passo 1, que prepara a anomalia do passo 2.
    } catch {
      // Estado corrompido: começa a calibração do zero.
    }
  }
}
