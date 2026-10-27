import { Component, computed, effect, inject, signal } from '@angular/core';
import { daysFromToday, NEIGHBORHOODS } from '../../data/mock-data';
import { RiskLevel } from '../../core/analysis';
import { Recomendacao } from '../../core/recommendations';
import { Acao, Panorama } from '../../core/simulation';
import { AGENT_STATUS_LABELS, ROLE_LABELS, STATUS_LABELS, TYPE_LABELS } from '../../models/equipment-schema';
import { CityStateService } from '../../services/city-state.service';
import { SimulationService } from '../../services/simulation.service';

type ActionKind = Acao['tipo'];

const ACTION_LABELS: Record<ActionKind, string> = {
  FALHA_EQUIPAMENTO: 'Falha de equipamento',
  DESATIVAR_EQUIPAMENTO: 'Desativar equipamento',
  REALOCAR_AGENTES: 'Realocar agentes',
  ANTECIPAR_MANUTENCAO: 'Antecipar manutenção',
};

const FIELD =
  'w-full py-1.5 px-2 bg-fogo-bg border border-fogo-border focus:border-fogo-ember rounded-lg text-sm text-fogo-sand outline-none';

/** Simulador "e se?" (antes × depois) e próximas melhores ações, no painel lateral da Central. */
@Component({
  selector: 'app-simulator-panel',
  standalone: true,
  template: `
    <div class="p-3 space-y-4 text-sm">
      <!-- Formulário -->
      <section class="space-y-2" aria-label="Ação a simular">
        <label class="block space-y-1">
          <span class="text-xs text-fogo-muted">Ação</span>
          <select #kindSel [class]="field" (change)="kind.set($any(kindSel.value))">
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="kind() === k">{{ actionLabels[k] }}</option>
            }
          </select>
        </label>

        @if (kind() !== 'REALOCAR_AGENTES') {
          <label class="block space-y-1">
            <span class="text-xs text-fogo-muted">Equipamento</span>
            <select #eqSel [class]="field" (change)="equipmentId.set(eqSel.value)">
              <option value="">Selecione…</option>
              @for (g of equipmentByHood(); track g.hood) {
                <optgroup [label]="g.hood">
                  @for (e of g.items; track e.id) {
                    <option [value]="e.id" [selected]="equipmentId() === e.id">{{ e.serialNumber }} · {{ typeLabels[e.type] }} · {{ statusLabels[e.status] }}</option>
                  }
                </optgroup>
              }
            </select>
          </label>
          @if (kind() === 'ANTECIPAR_MANUTENCAO') {
            <label class="block space-y-1">
              <span class="text-xs text-fogo-muted">Nova data da manutenção</span>
              <input #dateIn type="date" [class]="field" [value]="newDate()" (change)="newDate.set(dateIn.value)" />
            </label>
          }
        } @else {
          <label class="block space-y-1">
            <span class="text-xs text-fogo-muted">Região de destino</span>
            <select #destSel [class]="field" (change)="destination.set(destSel.value)">
              @for (n of neighborhoods; track n.name) {
                <option [value]="n.name" [selected]="destination() === n.name">{{ n.name }}</option>
              }
            </select>
          </label>
          <fieldset class="space-y-1">
            <legend class="text-xs text-fogo-muted">Agentes ({{ agentIds().size }} selecionado(s))</legend>
            <div class="max-h-36 overflow-y-auto rounded-lg border border-fogo-border bg-fogo-bg p-1.5 space-y-0.5">
              @for (a of agentsSorted(); track a.id) {
                <label class="flex items-center gap-2 text-xs cursor-pointer" [class.opacity-50]="a.neighborhood === destination()">
                  <input type="checkbox" [checked]="agentIds().has(a.id)" (change)="toggleAgent(a.id)" />
                  <span>{{ a.name }}</span>
                  <span class="text-fogo-muted">· {{ a.neighborhood }} · {{ agentStatusLabels[a.status] }} · {{ roleLabels[a.role] }}</span>
                </label>
              }
            </div>
          </fieldset>
        }

        <div class="flex gap-2 pt-1">
          <button type="button" class="btn flex-1" [disabled]="!action() || sim.busy()" (click)="simulate()">Simular</button>
          <button type="button" class="btn-primary flex-1" [disabled]="!action() || sim.busy()" (click)="apply(action()!)">Aplicar ação</button>
        </div>
        @if (sim.error(); as err) {
          <p class="text-xs text-fogo-red">{{ err }}</p>
        }
      </section>

      <!-- Antes × depois -->
      @if (sim.result(); as r) {
        <section class="rounded-lg border border-fogo-ember/50 bg-fogo-bg p-3 space-y-3" aria-label="Resultado da simulação">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-[11px] uppercase tracking-wide text-fogo-ember font-semibold">Simulação (nada foi aplicado)</p>
              <p class="font-semibold">{{ r.descricao }}</p>
            </div>
            <button type="button" (click)="sim.clear()" class="text-xs text-fogo-muted hover:text-fogo-sand cursor-pointer" aria-label="Fechar simulação">✕</button>
          </div>

          <table class="w-full text-xs">
            <thead>
              <tr class="text-fogo-muted">
                <th class="text-left font-normal pb-1">Indicador</th>
                <th class="text-right font-normal pb-1">Antes</th>
                <th class="text-right font-normal pb-1">Depois</th>
              </tr>
            </thead>
            <tbody class="font-mono">
              @for (row of comparison(); track row.label) {
                <tr class="border-t border-fogo-border/60">
                  <td class="py-1 font-sans">{{ row.label }}</td>
                  <td class="py-1 text-right">{{ row.before }}</td>
                  <td class="py-1 text-right" [class]="row.tone === 'good' ? 'text-fogo-green' : row.tone === 'bad' ? 'text-fogo-red' : ''">{{ row.after }}</td>
                </tr>
              }
            </tbody>
          </table>

          @if (r.diferencas.length) {
            <div>
              <p class="text-xs text-fogo-muted mb-1">Variações (maior impacto primeiro)</p>
              <ul class="space-y-0.5 text-xs">
                @for (d of r.diferencas.slice(0, 8); track d.texto) {
                  <li [class]="d.melhora ? 'text-fogo-green' : 'text-fogo-red'">{{ d.melhora ? '▲' : '▼' }} {{ d.texto }}</li>
                }
              </ul>
            </div>
          } @else {
            <p class="text-xs text-fogo-muted">Nenhum indicador muda com esta ação.</p>
          }

          @if (r.novosPontosCegos.length || r.pontosCegosRecuperados.length) {
            <p class="text-xs">
              @if (r.novosPontosCegos.length) {
                <span class="text-fogo-red">{{ r.novosPontosCegos.length }} novo(s) ponto(s) cego(s)</span>
              }
              @if (r.novosPontosCegos.length && r.pontosCegosRecuperados.length) {
                <span class="text-fogo-muted"> · </span>
              }
              @if (r.pontosCegosRecuperados.length) {
                <span class="text-fogo-green">{{ r.pontosCegosRecuperados.length }} célula(s) recuperada(s)</span>
              }
              <span class="text-fogo-muted"> · destacados no mapa</span>
            </p>
          }

          @if (r.avisos.length) {
            <ul class="space-y-0.5 text-xs text-fogo-amber">
              @for (a of r.avisos; track a) {
                <li>⚠ {{ a }}</li>
              }
            </ul>
          }

          <details class="text-xs">
            <summary class="cursor-pointer text-fogo-muted">Por que este resultado? (fatores considerados)</summary>
            <ul class="mt-1 space-y-0.5 list-disc pl-4">
              @for (f of r.fatores; track f) {
                <li>{{ f }}</li>
              }
            </ul>
          </details>

          <button type="button" class="btn-primary w-full" [disabled]="sim.busy()" (click)="apply(r.acao)">Aplicar esta ação</button>
        </section>
      }

      <!-- Próximas melhores ações -->
      <section class="space-y-2" aria-label="Próximas melhores ações">
        <div class="flex items-baseline justify-between">
          <h3 class="font-semibold">Próximas melhores ações</h3>
          <span class="text-[11px] text-fogo-muted">estimativa por regras</span>
        </div>
        @for (rec of sim.recommendations(); track rec.id; let i = $index) {
          <article class="rounded-lg border border-fogo-border bg-fogo-bg p-3 space-y-1.5">
            <p class="font-medium leading-snug"><span class="text-fogo-ember font-mono">{{ i + 1 }}.</span> {{ rec.titulo }}</p>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono">
              <span>Risco {{ rec.regiao }}: {{ rec.impacto.riscoAntes }} → <b [class]="rec.impacto.riscoDepois < rec.impacto.riscoAntes ? 'text-fogo-green' : ''">{{ rec.impacto.riscoDepois }}</b></span>
              <span>Saúde: {{ rec.impacto.saudeAntes }} → <b [class]="rec.impacto.saudeDepois > rec.impacto.saudeAntes ? 'text-fogo-green' : ''">{{ rec.impacto.saudeDepois }}</b></span>
              <span>Pontos cegos: {{ rec.impacto.pontosCegosAntes }} → {{ rec.impacto.pontosCegosDepois }}</span>
            </div>
            <p class="text-xs text-fogo-muted">{{ rec.justificativa }}</p>
            <p class="text-[11px] text-fogo-muted">
              Confiança <b [class]="rec.confianca === 'alta' ? 'text-fogo-green' : 'text-fogo-amber'">{{ rec.confianca === 'alta' ? 'alta' : 'média' }}</b> · {{ rec.limitacoes }}
            </p>
            <div class="flex gap-2 pt-0.5">
              <button type="button" class="btn flex-1 text-xs" [disabled]="sim.busy()" (click)="simulateRecommendation(rec)">Simular esta</button>
              <button type="button" class="btn-primary flex-1 text-xs" [disabled]="sim.busy()" (click)="apply(rec.acao, rec.titulo)">Aplicar</button>
            </div>
          </article>
        } @empty {
          <p class="text-xs text-fogo-muted">Nenhuma ação com ganho estimado agora: a cidade está sob controle.</p>
        }
        <p class="text-[11px] text-fogo-muted">
          Ganho = queda de risco + 0,5 × alta de saúde + 0,5 × pontos cegos recuperados, somados em todos os bairros.
        </p>
      </section>
    </div>
  `,
  styles: `
    .btn { @apply py-1.5 px-3 rounded-lg bg-fogo-panel border border-fogo-border text-sm hover:border-fogo-ember cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed; }
    .btn-primary { @apply py-1.5 px-3 rounded-lg bg-fogo-ember border border-fogo-ember text-fogo-bg text-sm font-semibold hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed; }
  `,
})
export class SimulatorPanelComponent {
  readonly sim = inject(SimulationService);
  private readonly city = inject(CityStateService);

  readonly field = FIELD;
  readonly kinds = Object.keys(ACTION_LABELS) as ActionKind[];
  readonly actionLabels = ACTION_LABELS;
  readonly typeLabels = TYPE_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly agentStatusLabels = AGENT_STATUS_LABELS;
  readonly roleLabels = ROLE_LABELS;
  readonly neighborhoods = NEIGHBORHOODS;

  readonly kind = signal<ActionKind>('FALHA_EQUIPAMENTO');
  readonly equipmentId = signal('');
  readonly newDate = signal(daysFromToday(0));
  readonly destination = signal(NEIGHBORHOODS[0].name);
  readonly agentIds = signal<ReadonlySet<string>>(new Set());

  readonly equipmentByHood = computed(() =>
    NEIGHBORHOODS.map((n) => ({
      hood: n.name,
      items: this.city.equipment().filter((e) => e.location.neighborhood === n.name),
    })).filter((g) => g.items.length)
  );

  readonly agentsSorted = computed(() =>
    [...this.city.agents()].sort((a, b) => a.neighborhood.localeCompare(b.neighborhood) || a.name.localeCompare(b.name))
  );

  /** Ação montada a partir do formulário (null enquanto incompleta). */
  readonly action = computed<Acao | null>(() => {
    const kind = this.kind();
    if (kind === 'REALOCAR_AGENTES') {
      return this.agentIds().size ? { tipo: kind, agentes: [...this.agentIds()], regiaoDestino: this.destination() } : null;
    }
    const equipamentoId = this.equipmentId();
    if (!equipamentoId) return null;
    return kind === 'ANTECIPAR_MANUTENCAO' ? { tipo: kind, equipamentoId, novaData: this.newDate() } : { tipo: kind, equipamentoId };
  });

  readonly comparison = computed(() => {
    const r = this.sim.result();
    if (!r) return [];
    const rows: { label: string; before: string; after: string; tone: 'good' | 'bad' | 'same' }[] = [];
    const add = (label: string, b: number, a: number, higherIsBetter: boolean, fmt = (v: number) => v.toLocaleString('pt-BR')) =>
      rows.push({ label, before: fmt(b), after: fmt(a), tone: a === b ? 'same' : a > b === higherIsBetter ? 'good' : 'bad' });
    const pct = (v: number) => `${v.toLocaleString('pt-BR')}%`;
    add('Disponibilidade', r.antes.indicadores.availabilityPct, r.depois.indicadores.availabilityPct, true, pct);
    add('Operacionais', r.antes.indicadores.operational, r.depois.indicadores.operational, true);
    add('Agentes ativos', r.antes.indicadores.activeAgents, r.depois.indicadores.activeAgents, true);
    add('Cobertura da cidade', r.antes.cobertura.pct, r.depois.cobertura.pct, true, pct);
    add('Pontos cegos', r.antes.cobertura.pontosCegos, r.depois.cobertura.pontosCegos, false);
    // Bairros afetados (alguma mudança de saúde, risco ou cobertura); se nenhum, o mais arriscado.
    const touched = this.touchedHoods(r.antes, r.depois);
    for (const hood of touched) {
      const hb = r.antes.saude.find((h) => h.neighborhood === hood)!.health;
      const ha = r.depois.saude.find((h) => h.neighborhood === hood)!.health;
      const rb = r.antes.risco.find((x) => x.neighborhood === hood)!;
      const ra = r.depois.risco.find((x) => x.neighborhood === hood)!;
      add(`Saúde · ${hood}`, hb, ha, true);
      rows.push({
        label: `Risco · ${hood}`,
        before: `${rb.risk} ${LEVEL[rb.level]}`,
        after: `${ra.risk} ${LEVEL[ra.level]}`,
        tone: ra.risk === rb.risk ? 'same' : ra.risk < rb.risk ? 'good' : 'bad',
      });
      add(`Cobertura · ${hood}`, r.antes.cobertura.porBairro[hood], r.depois.cobertura.porBairro[hood], true, pct);
    }
    return rows;
  });

  constructor() {
    // Ação vinda de fora (detalhe do equipamento, recomendação): preenche o formulário.
    effect(() => {
      const draft = this.sim.draft();
      if (!draft) return;
      this.kind.set(draft.tipo);
      if (draft.tipo === 'REALOCAR_AGENTES') {
        this.agentIds.set(new Set(draft.agentes));
        this.destination.set(draft.regiaoDestino);
      } else {
        this.equipmentId.set(draft.equipamentoId);
        if (draft.tipo === 'ANTECIPAR_MANUTENCAO') this.newDate.set(draft.novaData);
      }
    });
  }

  toggleAgent(id: string): void {
    this.agentIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  simulate(): void {
    const acao = this.action();
    if (acao) void this.sim.simulate(acao);
  }

  simulateRecommendation(rec: Recomendacao): void {
    this.sim.draft.set(rec.acao);
    void this.sim.simulate(rec.acao);
  }

  async apply(acao: Acao, label?: string): Promise<void> {
    const text = label ?? this.sim.result()?.descricao ?? ACTION_LABELS[acao.tipo];
    if (!confirm(`Aplicar de verdade: "${text}"?\nA mudança será gravada e registrada na auditoria.`)) return;
    await this.sim.apply(acao);
  }

  private touchedHoods(antes: Panorama, depois: Panorama): string[] {
    const changed = antes.saude
      .map((h) => h.neighborhood)
      .filter((hood) => {
        const hb = antes.saude.find((h) => h.neighborhood === hood)!.health;
        const ha = depois.saude.find((h) => h.neighborhood === hood)!.health;
        const rb = antes.risco.find((x) => x.neighborhood === hood)!.risk;
        const ra = depois.risco.find((x) => x.neighborhood === hood)!.risk;
        return hb !== ha || rb !== ra || antes.cobertura.porBairro[hood] !== depois.cobertura.porBairro[hood];
      });
    return changed.slice(0, 3);
  }
}

const LEVEL: Record<RiskLevel, string> = { BAIXO: 'baixo', MEDIO: 'médio', ALTO: 'ALTO' };
