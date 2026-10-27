import { Component, computed, inject, signal } from '@angular/core';
import { Despacho, ROLE_LABELS_DESPACHO, ResultadoDespacho } from '../../core/dispatch';
import { Dossie } from '../../core/investigation';
import { Confianca } from '../../core/manuals';
import { Ocorrencia, STATUS_OCORRENCIA, STATUS_OCORRENCIA_LABELS, StatusOcorrencia, TIPO_ALERTA_LABELS } from '../../core/occurrences';
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '../../models/equipment-schema';
import { EquipmentStatus, EquipmentType } from '../../models/fogo.models';
import { CityStateService } from '../../services/city-state.service';
import { OccurrenceService } from '../../services/occurrence.service';
import { SimulationService } from '../../services/simulation.service';
import { UiStateService } from '../../services/ui-state.service';

const FIELD =
  'w-full py-1.5 px-2 bg-fogo-bg border border-fogo-border focus:border-fogo-ember rounded-lg text-sm text-fogo-sand outline-none';

const ORIGEM_LABELS: Record<string, string> = {
  seed: 'carga inicial',
  sintetico: 'dados sintéticos',
  usuario: 'alteração do usuário',
  telemetria: 'telemetria',
  cenario: 'cenário de crise',
  acao: 'ação aplicada',
  painel: 'painel',
};

const STATUS_STYLES: Record<StatusOcorrencia, string> = {
  aberta: 'bg-fogo-red/20 text-fogo-red border-fogo-red/40',
  investigada: 'bg-fogo-amber/20 text-fogo-amber border-fogo-amber/40',
  despachada: 'bg-fogo-ember/20 text-fogo-ember border-fogo-ember/40',
  encerrada: 'bg-fogo-bg text-fogo-muted border-fogo-border',
};

/** Lista de ocorrências com filtro por status; clicar numa ocorrência mostra o equipamento no mapa. */
@Component({
  selector: 'app-occurrences-panel',
  standalone: true,
  template: `
    <div class="p-3 space-y-3 text-sm">
      @if (occ.selected(); as o) {
        @let eq = equipment(o);
        @let d = dossie(o);
        <div class="flex items-center justify-between gap-2">
          <button type="button" class="text-xs text-fogo-muted hover:text-fogo-sand cursor-pointer" (click)="occ.selectedId.set(null)">← Todas as ocorrências</button>
          <span class="text-[11px] px-2 py-0.5 rounded border" [class]="statusStyles[o.status]">{{ statusLabels[o.status] }}</span>
        </div>
        <div>
          <p class="font-mono text-xs text-fogo-muted">{{ o.id }} · aberta {{ formatDateTime(o.abertaEm) }}</p>
          <h3 class="text-base font-semibold">{{ alertLabels[o.tipoAlerta] }} · {{ eq?.serialNumber ?? o.equipamentoId }}</h3>
          <p class="text-xs text-fogo-muted">{{ o.snapshotAbertura.bairro }}{{ eq ? ' · ' + eq.location.street : '' }}</p>
        </div>
        @if (occ.error(); as err) {
          <p class="text-xs text-fogo-red">{{ err }}</p>
        }
        @if (o.status !== 'encerrada') {
          <button type="button" class="w-full" [class]="d ? 'btn-secondary' : 'btn-primary'" [disabled]="occ.busy() || !eq" (click)="occ.investigate(o.id)">
            {{ occ.busy() ? 'Investigando…' : d ? 'Refazer investigação (dados atuais)' : 'Investigar' }}
          </button>
        }

        @if (d) {
          <section class="space-y-1" aria-label="O que aconteceu">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-fogo-ember">1 · O que aconteceu</h4>
            <p>
              {{ typeLabel(d.oQueAconteceu.tipo) }} {{ d.oQueAconteceu.marca }} {{ d.oQueAconteceu.modelo }} · {{ d.oQueAconteceu.endereco }} ·
              situação: <strong>{{ equipmentStatusLabels[d.oQueAconteceu.situacao] }}</strong>.
            </p>
            <p class="text-xs text-fogo-muted">
              @if (d.oQueAconteceu.detectadoEm) {
                Detectado {{ formatDateTime(d.oQueAconteceu.detectadoEm) }} ({{ origemText(d.oQueAconteceu.origemDeteccao) }}).
              } @else {
                Sem registro do momento da detecção (situação vinda da carga inicial).
              }
            </p>
          </section>

          <section class="space-y-1" aria-label="Histórico">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-fogo-ember">2 · Histórico do equipamento</h4>
            <p class="text-xs text-fogo-muted">
              {{ d.historico.eventos.length }} mudança(s) de situação · {{ d.historico.falhasAnteriores }} falha(s) anterior(es) ·
              {{ d.historico.manutencoesAnteriores }} manutenção(ões) · {{ d.historico.auditoria.length }} registro(s) de auditoria
            </p>
            @for (ev of d.historico.eventos.slice(-4); track $index) {
              <p class="text-[11px] text-fogo-muted">{{ formatDateTime(ev.criadoEm) }} · {{ statusText(ev.situacaoAnterior) }} → {{ statusText(ev.situacaoNova) }} ({{ origemText(ev.origem) }})</p>
            }
          </section>

          <section class="space-y-2" aria-label="Padrões">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-fogo-ember">3 · Padrões encontrados</h4>
            @for (p of d.padroes; track p.tipo) {
              <div class="rounded-lg border border-fogo-amber/50 bg-fogo-bg p-2.5 space-y-1">
                <p class="font-medium">{{ p.titulo }}</p>
                <p class="text-xs">{{ p.descricao }}</p>
                <ul class="text-[11px] text-fogo-muted list-disc pl-4">
                  @for (ev of p.evidencias; track ev) {
                    <li>{{ ev }}</li>
                  }
                </ul>
              </div>
            } @empty {
              <p class="text-xs text-fogo-muted">Nenhum padrão de lote, vizinhança ou energia.</p>
            }
            @if (d.relacionados.length) {
              <p class="text-[11px] text-fogo-muted">Itens relacionados destacados no mapa com halo laranja.</p>
            }
          </section>

          <section class="space-y-1" aria-label="Impacto">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-fogo-ember">4 · Impacto</h4>
            <p class="text-xs">{{ d.impacto.descricao }}</p>
          </section>

          <section class="space-y-1" aria-label="Hipótese">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-fogo-ember">5 · Hipótese · confiança {{ confiancaLabels[d.hipotese.confianca] }}</h4>
            <p>{{ d.hipotese.texto }}</p>
            @for (l of d.hipotese.limitacoes; track l) {
              <p class="text-[11px] text-fogo-muted">Limitação: {{ l }}</p>
            }
          </section>

          <section class="space-y-1.5" aria-label="Recomendação dos manuais">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-fogo-ember">6 · Recomendação dos manuais · confiança {{ confiancaLabels[d.recomendacao.confianca] }}</h4>
            <p class="font-medium">{{ d.recomendacao.decisao }}</p>
            <p class="text-xs text-fogo-muted">{{ d.recomendacao.justificativa }}</p>
            @for (f of d.recomendacao.fontes; track f.id) {
              <blockquote class="border-l-2 border-fogo-ember pl-2 text-[11px] text-fogo-muted">
                “{{ f.trecho }}”
                <span class="block mt-0.5 font-mono">{{ f.fonte }} › {{ f.secao }}</span>
              </blockquote>
            }
            <p class="text-[11px] text-fogo-muted italic">{{ d.recomendacao.metodo }}</p>
          </section>

          <section class="space-y-1" aria-label="Próximos passos">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-fogo-ember">7 · Próximos passos</h4>
            <ol class="text-xs list-decimal pl-4 space-y-0.5">
              @for (p of d.proximosPassos; track p) {
                <li>{{ p }}</li>
              }
            </ol>
          </section>
        } @else {
          <p class="text-xs text-fogo-muted">
            Na abertura: disponibilidade {{ o.snapshotAbertura.indicadores.availabilityPct.toLocaleString('pt-BR') }}%
            @if (o.snapshotAbertura.saude; as s) { · saúde do bairro {{ s.health }} }
            @if (o.snapshotAbertura.risco; as r) { · risco {{ r.risk }} ({{ r.level }}) }.
            A investigação cruza histórico, padrões, impacto e manuais.
          </p>
        }

        <section class="space-y-2 border-t border-fogo-border pt-3" aria-label="Despacho">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-fogo-ember">Despacho</h4>
          @if (despacho(o); as dp) {
            <div class="rounded-lg border border-fogo-ember/60 bg-fogo-bg p-2.5 space-y-0.5">
              <p class="font-medium">{{ dp.agenteNome }} · {{ roleLabels[dp.funcao] }} · {{ dp.orgao }}</p>
              <p class="text-xs text-fogo-muted">
                {{ dp.convocacao ? 'Convocado(a) de folga' : 'Saiu de ' + dp.origem.bairro }} às {{ formatDateTime(dp.despachadoEm) }} ·
                {{ dp.distanciaKm.toLocaleString('pt-BR') }} km · ETA estimado ~{{ dp.etaMin }} min
              </p>
              <p class="text-[11px] text-fogo-muted">Linha laranja no mapa: origem → local. Ao encerrar, o agente volta à origem.</p>
            </div>
          } @else if (o.status !== 'encerrada') {
            @let sug = suggestions(o);
            @if (!sug) {
              <button type="button" class="btn-secondary w-full" [disabled]="occ.busy() || !eq" (click)="occ.suggestDispatch(o.id)">Sugerir agentes mais próximos</button>
            } @else {
              <p class="text-xs text-fogo-muted">
                Perfil: {{ sug.perfil }}{{ sug.fallback ? ' (ninguém do perfil livre: qualquer agente em serviço)' : '' }}.
              </p>
              @for (x of sug.sugestoes; track x.agenteId; let i = $index) {
                <div class="rounded-lg border border-fogo-border bg-fogo-bg p-2.5 space-y-1">
                  <div class="flex items-center justify-between gap-2">
                    <p class="font-medium">{{ i + 1 }}. {{ x.nome }}</p>
                    <span class="text-xs font-mono">~{{ x.etaMin }} min</span>
                  </div>
                  <p class="text-xs text-fogo-muted">
                    {{ roleLabels[x.funcao] }} · {{ x.orgao }} · {{ x.bairro }} · {{ x.distanciaKm.toLocaleString('pt-BR') }} km
                    @if (x.convocacao) {
                      · <span class="text-fogo-amber">convocar (de folga)</span>
                    }
                  </p>
                  <p class="text-[11px] text-fogo-muted">Custo colateral: {{ x.custoColateral.texto }}</p>
                  <div class="grid grid-cols-2 gap-2 pt-1">
                    <button type="button" class="btn-secondary text-xs" (click)="sim.open(x.acao)">Simular</button>
                    <button type="button" class="btn-primary text-xs" [disabled]="occ.busy()" (click)="confirmDispatch(o.id, x.agenteId, x.nome, x.etaMin)">Despachar</button>
                  </div>
                </div>
              } @empty {
                <p class="text-xs text-fogo-muted">Nenhum agente livre no momento: todos estão em atendimento.</p>
              }
              <p class="text-[11px] text-fogo-muted">{{ sug.observacao }}</p>
            }
          } @else {
            <p class="text-xs text-fogo-muted">Encerrada sem despacho.</p>
          }
        </section>
      } @else {
      <div class="flex items-end gap-2">
        <label class="flex-1 space-y-1">
          <span class="text-xs text-fogo-muted">Status</span>
          <select #statusSel [class]="field" (change)="status.set($any(statusSel.value))">
            <option value="">Todos ({{ occ.list().length }})</option>
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="status() === s">{{ statusLabels[s] }} ({{ count(s) }})</option>
            }
          </select>
        </label>
        <button type="button" class="btn-secondary text-xs" (click)="occ.refresh()" aria-label="Atualizar lista de ocorrências">Atualizar</button>
      </div>
      @if (occ.error(); as err) {
        <p class="text-xs text-fogo-red">{{ err }}</p>
      }

      <ul class="space-y-2" aria-label="Ocorrências">
        @for (o of visible(); track o.id) {
          @let eq = equipment(o);
          <li>
            <button
              type="button"
              (click)="select(o)"
              [attr.aria-current]="occ.selectedId() === o.id ? 'true' : null"
              class="w-full text-left rounded-lg border p-3 bg-fogo-bg hover:border-fogo-ember cursor-pointer space-y-1"
              [class]="occ.selectedId() === o.id ? 'border-fogo-ember' : 'border-fogo-border'"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-xs text-fogo-muted">{{ o.id }}</span>
                <span class="text-[11px] px-2 py-0.5 rounded border" [class]="statusStyles[o.status]">{{ statusLabels[o.status] }}</span>
              </div>
              <p class="font-medium">{{ alertLabels[o.tipoAlerta] }} · {{ eq?.serialNumber ?? o.equipamentoId }}</p>
              <p class="text-xs text-fogo-muted">
                {{ o.snapshotAbertura.bairro }} · aberta {{ formatDateTime(o.abertaEm) }}
                @if (eq) {
                  · agora: <i class="dot" [style.background]="statusColors[eq.status]"></i> {{ equipmentStatusLabels[eq.status] }}
                } @else {
                  · equipamento excluído
                }
              </p>
              <p class="text-[11px] text-fogo-muted">
                Na abertura: disponibilidade {{ o.snapshotAbertura.indicadores.availabilityPct.toLocaleString('pt-BR') }}%
                @if (o.snapshotAbertura.saude; as s) { · saúde do bairro {{ s.health }} }
                @if (o.snapshotAbertura.risco; as r) { · risco {{ r.risk }} ({{ r.level }}) }
              </p>
            </button>
          </li>
        } @empty {
          <li class="text-center text-fogo-muted py-10">
            {{ status() ? 'Nenhuma ocorrência com este status.' : 'Nenhuma ocorrência ainda. Abra uma pelo botão "Abrir ocorrência" num alerta de furto ou falha.' }}
          </li>
        }
      </ul>
      }
    </div>
  `,
})
export class OccurrencesPanelComponent {
  readonly occ = inject(OccurrenceService);
  private readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);

  readonly status = signal<StatusOcorrencia | ''>('');
  readonly visible = computed(() => this.occ.list().filter((o) => !this.status() || o.status === this.status()));

  readonly field = FIELD;
  readonly statuses = STATUS_OCORRENCIA;
  readonly statusLabels = STATUS_OCORRENCIA_LABELS;
  readonly statusStyles = STATUS_STYLES;
  readonly alertLabels = TIPO_ALERTA_LABELS;
  readonly statusColors = STATUS_COLORS;
  readonly equipmentStatusLabels = STATUS_LABELS;

  readonly sim = inject(SimulationService);
  readonly roleLabels = ROLE_LABELS_DESPACHO;

  despacho(o: Ocorrencia): Despacho | null {
    return (o.despacho as Despacho | null) ?? null;
  }

  suggestions(o: Ocorrencia): ResultadoDespacho | null {
    const s = this.occ.dispatchSuggestions();
    return s?.ocorrenciaId === o.id ? s.resultado : null;
  }

  confirmDispatch(id: string, agenteId: string, nome: string, eta: number): void {
    if (confirm(`Despachar ${nome} para a ocorrência ${id}? ETA estimado ~${eta} min. O agente passa a "em atendimento" e a ação vai para a auditoria.`)) {
      void this.occ.dispatch(id, agenteId);
    }
  }

  dossie(o: Ocorrencia): Dossie | null {
    return (o.dossie as Dossie | null) ?? null;
  }

  readonly confiancaLabels: Record<Confianca, string> = { alta: 'alta', media: 'média', baixa: 'baixa' };

  origemText(origem: string | null): string {
    return ORIGEM_LABELS[origem ?? ''] ?? origem ?? '–';
  }

  typeLabel(tipo: string): string {
    return TYPE_LABELS[tipo as EquipmentType] ?? tipo;
  }

  statusText(status: string | null): string {
    return status ? (STATUS_LABELS[status as EquipmentStatus] ?? status) : '–';
  }

  count(s: StatusOcorrencia): number {
    return this.occ.list().filter((o) => o.status === s).length;
  }

  equipment(o: Ocorrencia) {
    return this.city.equipment().find((e) => e.id === o.equipamentoId);
  }

  /** Seleciona a ocorrência e centraliza o equipamento no mapa (sem sair da aba). */
  select(o: Ocorrencia): void {
    this.occ.selectedId.set(o.id);
    const eq = this.equipment(o);
    if (eq) this.ui.focusPoint(eq.location.lat, eq.location.lng);
  }

  formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
