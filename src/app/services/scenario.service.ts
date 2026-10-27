import { Injectable, inject } from '@angular/core';
import { SCENARIOS, ScenarioId, applyScenario, recordSnapshot, revertScenarios } from '../core/scenarios';
import { CityStateService } from './city-state.service';
import { UiStateService } from './ui-state.service';

export { SCENARIOS };
export type { Scenario, ScenarioId } from '../core/scenarios';

/** Injeta cenários de crise na cidade (regras em core/scenarios.ts) e permite revertê-los. */
@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);

  run(id: ScenarioId): void {
    this.city.selection.set(null);
    const before = this.city.snapshot();
    const result = applyScenario(before, id);
    this.city.replaceState(result.state);
    this.city.scenarioSnapshot.set(recordSnapshot(this.city.scenarioSnapshot(), before, result, id));
    for (const message of result.messages) this.city.log(message, 'bad', 'scenario');

    const affected = result.equipmentIds.length + result.agentIds.length;
    if (id === 'south_peak') {
      this.ui.activeTab.set('predictive');
      this.ui.closeInventory();
      this.ui.notify(`Cenário injetado: ${result.label}. Veja as novas previsões.`, 'bad');
      return;
    }
    this.ui.goToMap();
    if (result.focus) this.ui.focusDistrict(result.focus);
    this.ui.notify(`Cenário injetado: ${result.label} (${affected} itens afetados).`, 'bad');
  }

  /** Desfaz só o que os cenários alteraram, preservando cadastros e edições do usuário. */
  revert(): void {
    const snapshot = this.city.scenarioSnapshot();
    if (!snapshot) return;
    this.city.replaceState(revertScenarios(this.city.snapshot(), snapshot));
    this.city.scenarioSnapshot.set(null);
    this.city.log(`Cenário(s) revertido(s): ${snapshot.equipment.length} equipamento(s) e ${snapshot.agents.length} agente(s) restaurados`, 'good', 'scenario');
    this.ui.notify('Cenário revertido: a cidade voltou ao estado anterior.', 'good');
  }

  restore(): void {
    this.city.resetToMock();
    this.ui.goToMap();
    this.ui.notify('Estado inicial restaurado.', 'info');
  }
}
