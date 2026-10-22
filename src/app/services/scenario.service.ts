import { Injectable, inject } from '@angular/core';
import { NEIGHBORHOODS, daysFromToday } from '../data/mock-data';
import { Equipment, EquipmentType } from '../models/fogo.models';
import { CityStateService } from './city-state.service';
import { UiStateService } from './ui-state.service';

export type ScenarioId = 'theft_wave' | 'north_degradation' | 'south_peak';

export interface Scenario {
  id: ScenarioId;
  title: string;
  description: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'theft_wave',
    title: 'Onda de Furto e Vandalismo (Centro)',
    description: '2 câmeras e 1 totem furtados; pede viaturas da Guarda/PM.',
  },
  {
    id: 'north_degradation',
    title: 'Degradação e Manutenção Crítica (Zona Norte)',
    description: '3 radares e 1 balança em falha com manutenção imediata.',
  },
  {
    id: 'south_peak',
    title: 'Horário de Pico + Alerta Preditivo (Zona Sul)',
    description: 'Véspera de pico com efetivo reduzido; gera novas recomendações.',
  },
];

/** Injeta eventos prontos na cidade para homologar a reatividade do sistema (Fase 2). */
@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);

  run(id: ScenarioId): void {
    this.city.selection.set(null);
    switch (id) {
      case 'theft_wave':
        return this.theftWave();
      case 'north_degradation':
        return this.northDegradation();
      case 'south_peak':
        return this.southPeak();
    }
  }

  restore(): void {
    this.city.resetToMock();
    this.ui.goToMap();
    this.ui.notify('Estado inicial restaurado.', 'info');
  }

  private theftWave(): void {
    // O bairro do Centro com menos Guarda/PM em serviço é o alvo mais vulnerável.
    const security = (name: string) =>
      this.city.agents().filter((a) => a.neighborhood === name && a.status !== 'off_duty' && a.role !== 'transit_agent').length;
    const districts = NEIGHBORHOODS.filter((n) => n.zone === 'Centro')
      .map((n) => n.name)
      .sort((a, b) => security(a) - security(b));
    const targets = [
      ...this.pick(['camera'], districts, 2),
      ...this.pick(['parking_totem'], districts, 1),
    ];
    this.city.patchEquipment(
      targets.map((e) => e.id),
      (e) => ({ ...e, status: 'stolen', maintenance: { priority: 'immediate' } })
    );
    this.finish(targets, 'Onda de furto no Centro', targets[0]?.location.neighborhood);
  }

  private northDegradation(): void {
    const north = NEIGHBORHOODS.find((n) => n.zone === 'Zona Norte')!;
    // Bairros ordenados pela distância à Zona Norte: se faltarem radares lá, usa o entorno.
    const byDistance = [...NEIGHBORHOODS]
      .sort((a, b) => Math.hypot(a.lat - north.lat, a.lng - north.lng) - Math.hypot(b.lat - north.lat, b.lng - north.lng))
      .map((n) => n.name);
    const targets = [...this.pick(['radar'], byDistance, 3), ...this.pick(['truck_scale'], byDistance, 1)];
    this.city.patchEquipment(
      targets.map((e) => e.id),
      (e) => ({ ...e, status: 'malfunction', maintenance: { priority: 'immediate', nextDate: daysFromToday(0) } })
    );
    this.finish(targets, 'Degradação crítica na Zona Norte', north.name);
  }

  private southPeak(): void {
    const south = NEIGHBORHOODS.find((n) => n.zone === 'Zona Sul')!;
    // Fim de turno às vésperas do pico: dois agentes ativos do bairro saem de serviço.
    const leaving = this.city
      .agents()
      .filter((a) => a.neighborhood === south.name && a.status === 'active')
      .slice(0, 2)
      .map((a) => a.id);
    this.city.patchAgents(leaving, (a) => ({ ...a, status: 'off_duty' }));
    this.city.peakSurge.set(south.name);
    this.city.log(
      `[Cenário] Véspera de pico em ${south.name}: fluxo previsto +40% e ${leaving.length} agente(s) encerrando turno`,
      'bad',
      'scenario'
    );
    this.ui.activeTab.set('predictive');
    this.ui.closeInventory();
    this.ui.notify(`Cenário injetado: véspera de pico em ${south.name}. Veja as novas previsões.`, 'bad');
  }

  /** Equipamentos operacionais dos tipos pedidos, na ordem de preferência dos bairros. */
  private pick(types: EquipmentType[], districts: string[], count: number): Equipment[] {
    const pool = this.city.equipment().filter((e) => types.includes(e.type) && e.status === 'operational');
    return districts.flatMap((d) => pool.filter((e) => e.location.neighborhood === d)).slice(0, count);
  }

  private finish(targets: Equipment[], label: string, focus?: string): void {
    for (const e of targets) {
      this.city.log(`[Cenário] ${e.serialNumber} (${e.location.neighborhood}) → ${e.status === 'stolen' ? 'Furtado' : 'Mau funcionamento'}`, 'bad', 'scenario');
    }
    this.ui.goToMap();
    if (focus) this.ui.focusDistrict(focus);
    this.ui.notify(`Cenário injetado: ${label} (${targets.length} equipamentos afetados).`, 'bad');
  }
}
