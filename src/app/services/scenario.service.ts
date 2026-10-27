import { Injectable, inject } from '@angular/core';
import { SCENARIOS, ScenarioId, ScenarioResult, applyScenario, recordSnapshot, revertScenarios } from '../core/scenarios';
import { ServerState } from './api';
import { CityStateService } from './city-state.service';
import { UiStateService } from './ui-state.service';

export { SCENARIOS };
export type { Scenario, ScenarioId } from '../core/scenarios';

/** Injeta cenários de crise na cidade (regras em core/scenarios.ts) e permite revertê-los. */
@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);

  async run(id: ScenarioId): Promise<void> {
    this.city.selection.set(null);
    let result: Pick<ScenarioResult, 'label' | 'focus' | 'messages'> & { affected: number };
    if (this.city.mode() === 'online') {
      // O servidor aplica a mesma regra pura, grava o snapshot e a auditoria.
      const before = this.city.snapshot();
      try {
        const res = await this.city.serverAction<ServerState & ScenarioResult>(`/cenarios/${id}`);
        const changed = (list: { id: string }[], old: { id: string }[]) => {
          const prev = new Map(old.map((x) => [x.id, JSON.stringify(x)]));
          return list.filter((x) => prev.get(x.id) !== JSON.stringify(x)).length;
        };
        result = { ...res, affected: changed(res.equipment, before.equipment) + changed(res.agents, before.agents) };
      } catch (err) {
        this.ui.notify(`Falha ao aplicar o cenário: ${(err as Error).message}`, 'bad');
        return;
      }
    } else {
      const before = this.city.snapshot();
      const local = applyScenario(before, id);
      this.city.replaceState(local.state);
      this.city.scenarioSnapshot.set(recordSnapshot(this.city.scenarioSnapshot(), before, local, id));
      result = { ...local, affected: local.equipmentIds.length + local.agentIds.length };
    }
    for (const message of result.messages) this.city.log(message, 'bad', 'scenario');

    const affected = result.affected;
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
  async revert(): Promise<void> {
    const snapshot = this.city.scenarioSnapshot();
    if (!snapshot) return;
    if (this.city.mode() === 'online') {
      try {
        await this.city.serverAction('/cenarios/reverter');
      } catch (err) {
        this.ui.notify(`Falha ao reverter: ${(err as Error).message}`, 'bad');
        return;
      }
    } else {
      this.city.replaceState(revertScenarios(this.city.snapshot(), snapshot));
      this.city.scenarioSnapshot.set(null);
    }
    this.city.log(`Cenário(s) revertido(s): ${snapshot.equipment.length} equipamento(s) e ${snapshot.agents.length} agente(s) restaurados`, 'good', 'scenario');
    this.ui.notify('Cenário revertido: a cidade voltou ao estado anterior.', 'good');
  }

  async restore(): Promise<void> {
    await this.city.resetToMock();
    this.ui.goToMap();
    this.ui.notify('Estado inicial restaurado.', 'info');
  }
}
