import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { v4 as uuidv4 } from 'uuid';
import { DeviceInventoryService } from './device-inventory.service';
import { Barrier, RecoveryReport, StoryAct, StoryEvent } from '../models/story.models';
import { PROMETHEUS_COPY } from '../copy/story.copy';

export type NavigationTabRequest = 'ops' | 'inventory' | 'predictive';

@Injectable({
  providedIn: 'root',
})
export class StoryService {
  private readonly inventory = inject(DeviceInventoryService);
  private readonly platformId = inject(PLATFORM_ID);

  // Core required Signals
  readonly act = signal<StoryAct>(1);
  readonly barrier = signal<Barrier>(0);
  readonly log = signal<StoryEvent[]>([
    {
      id: 'EVT-INIT',
      timestamp: this.nowTime(),
      act: 1,
      barrier: 0,
      title: 'Tomada da malha urbana pelo PROMETHEUS',
      detail: 'Telemetria colocada em modo de auditoria. Índice de controle inicial em 12%.',
      prometheusComment: PROMETHEUS_COPY.act1.opening,
    },
  ]);

  // Operator & Narrative state
  readonly coderCode = signal<string>('');
  readonly prometheusLine = signal<string>(PROMETHEUS_COPY.act1.opening);
  readonly freeExploreMode = signal<boolean>(false);
  readonly diaryOpen = signal<boolean>(false);
  readonly requestedTab = signal<{ tab: NavigationTabRequest; seq: number } | null>(null);

  // Real data tracking for barriers & report
  readonly verifiedDeviceIds = signal<string[]>([]);
  readonly alertsResolvedCount = signal<number>(0);
  readonly xaiDecisions = signal<{ correct: number; wrong: number }>({ correct: 0, wrong: 0 });
  readonly initialAverageIrt = signal<number>(70);
  private sessionStartMs = Date.now();
  readonly completedElapsedSeconds = signal<number | null>(null);

  // Automated Demo ("Rodar a história completa") state
  readonly isDemoRunning = signal<boolean>(false);
  readonly isDemoPaused = signal<boolean>(false);
  readonly demoSubtitle = signal<string>('');
  readonly demoProgressPct = signal<number>(0);

  private radarTheftTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private demoIntervalId: ReturnType<typeof setInterval> | null = null;
  private demoStepIndex = 0;

  // Computed metrics from real data
  readonly verifiedPercentage = computed<number>(() => {
    const total = this.inventory.totalDevices();
    if (total === 0) return 0;
    return Math.min(100, Math.round((this.verifiedDeviceIds().length / total) * 100));
  });

  readonly averageIrt = computed<number>(() => {
    const summaries = this.inventory.regionSummaries();
    if (summaries.length === 0) return 0;
    const total = summaries.reduce((acc, item) => acc + item.irtScore, 0);
    return Math.round(total / summaries.length);
  });

  readonly barrierOneCleared = computed<boolean>(() => this.verifiedPercentage() >= 60);

  readonly barrierTwoCleared = computed<boolean>(() => {
    if (!this.barrierOneCleared()) return false;
    return (
      this.inventory.criticalFailureDevicesCount() <= 6 &&
      this.alertsResolvedCount() >= 2
    );
  });

  readonly barrierThreeCleared = computed<boolean>(() => {
    if (!this.barrierTwoCleared()) return false;
    return this.averageIrt() < 40;
  });

  /**
   * Índice de controle (0 a 100%) calculado estritamente a partir do estado real dos dados:
   * - Base degradada inicial: 12%
   * - Barreira 1 (Verificação real do inventário até 60%): +0 a +33 pontos (chega a 45%)
   * - Barreira 2 (Redução real de falhas críticas e contenção de alertas): +0 a +25 pontos (chega a 70%)
   * - Barreira 3 (Redução real do IRT médio territorial abaixo de 40): +0 a +30 pontos (chega a 100%)
   */
  readonly controlIndex = computed<number>(() => {
    if (this.act() === 3) {
      return 100;
    }

    const base = 12;

    // 1. Contribuição real da verificação do inventário (0 a 33 pts)
    const verifiedRatio = Math.min(1, this.verifiedPercentage() / 60);
    const inventoryScore = Math.round(verifiedRatio * 33);

    // 2. Contribuição real da contenção de falhas críticas na Central (0 a 25 pts)
    let opsScore = 0;
    if (this.barrier() >= 2 || this.barrierOneCleared()) {
      const failures = this.inventory.criticalFailureDevicesCount();
      const resolvedBonus = Math.min(10, this.alertsResolvedCount() * 5);
      const failureReductionRatio = Math.max(0, Math.min(1, (15 - failures) / 9));
      opsScore = Math.min(25, Math.round(failureReductionRatio * 15 + resolvedBonus));
    }

    // 3. Contribuição real da redução do Índice de Risco Territorial (IRT) (0 a 30 pts)
    let predictiveScore = 0;
    const currentIrt = this.averageIrt();
    const baselineIrt = this.initialAverageIrt();
    if (currentIrt < baselineIrt) {
      const irtDropRatio = Math.min(1, (baselineIrt - currentIrt) / Math.max(1, baselineIrt - 38));
      predictiveScore = Math.round(irtDropRatio * 30);
    }

    const total = base + inventoryScore + opsScore + predictiveScore;
    return Math.max(12, Math.min(100, total));
  });

  readonly recoveryReport = computed<RecoveryReport>(() => {
    const elapsed =
      this.completedElapsedSeconds() ??
      Math.max(1, Math.round((Date.now() - this.sessionStartMs) / 1000));
    const decisions = this.xaiDecisions();
    const code = this.coderCode().trim();

    return {
      elapsedSeconds: elapsed,
      verifiedDevices: this.verifiedDeviceIds().length,
      totalDevices: this.inventory.totalDevices(),
      alertsResolved: this.alertsResolvedCount(),
      riskBefore: this.initialAverageIrt(),
      riskAfter: this.averageIrt(),
      xaiCorrect: decisions.correct,
      xaiWrong: decisions.wrong,
      operatorName: code ? code : undefined,
    };
  });

  setCoderCode(code: string): void {
    this.coderCode.set(code);
    if (code.trim()) {
      this.appendLog(
        1,
        0,
        `Credencial CODER identificada: ${code.trim()}`,
        'Acesso de inspeção da banca avaliadora habilitado.',
        `${PROMETHEUS_COPY.act1.coderGreetingPrefix} ${code.trim()}. ${PROMETHEUS_COPY.act1.coderExtraMessage}`
      );
    }
  }

  startProtocol(): void {
    this.sessionStartMs = Date.now();
    this.completedElapsedSeconds.set(null);
    this.initialAverageIrt.set(this.averageIrt());
    this.act.set(2);
    this.barrier.set(1);
    this.freeExploreMode.set(false);
    this.prometheusLine.set(PROMETHEUS_COPY.barriers.b1Intro);

    this.appendLog(
      2,
      1,
      'Protocolo iniciado — Barreira 1 ativa',
      'O operador iniciou a retomada de controle. Meta: verificar 60% do inventário.',
      PROMETHEUS_COPY.barriers.b1Intro
    );

    this.requestTab('ops');
  }

  isDeviceVerified(deviceId: string): boolean {
    if (this.act() === 3 || this.freeExploreMode()) {
      return true;
    }
    return this.verifiedDeviceIds().includes(deviceId);
  }

  /**
   * Reivindica e verifica um equipamento (e os sensores pareados do mesmo logradouro/setor)
   * para permitir auditoria fluida em menos de 2 minutos.
   */
  verifyDeviceCluster(deviceId: string): void {
    const allDevices = this.inventory.devices();
    const target = allDevices.find((d) => d.id === deviceId);
    if (!target) return;

    // Reivindica o equipamento clicado e os sensores do mesmo bairro/corredor
    const sectorIds = allDevices
      .filter((d) => d.location.neighborhood === target.location.neighborhood)
      .map((d) => d.id);

    const currentSet = new Set(this.verifiedDeviceIds());
    let newlyAdded = 0;
    for (const id of sectorIds) {
      if (!currentSet.has(id)) {
        currentSet.add(id);
        newlyAdded++;
      }
    }

    if (newlyAdded === 0) return;

    this.verifiedDeviceIds.set(Array.from(currentSet));
    this.prometheusLine.set(PROMETHEUS_COPY.barriers.b1Progress);

    this.appendLog(
      2,
      this.barrier(),
      `Setor verificado: ${target.location.neighborhood}`,
      `${newlyAdded} equipamentos auditados e reivindicados (${this.verifiedPercentage()}% da malha).`,
      PROMETHEUS_COPY.barriers.b1Progress
    );

    this.evaluateBarrierProgression();
  }

  recordAlertAction(actionType: 'dispatch' | 'normalize', serialNumber: string): void {
    this.alertsResolvedCount.update((c) => c + 1);
    const comment =
      actionType === 'dispatch'
        ? PROMETHEUS_COPY.barriers.b2ActionComment
        : PROMETHEUS_COPY.barriers.b2NormalizeComment;

    this.prometheusLine.set(comment);

    this.appendLog(
      this.act(),
      this.barrier(),
      actionType === 'dispatch'
        ? `Equipe despachada para ${serialNumber}`
        : `Equipamento ${serialNumber} normalizado`,
      `Falhas críticas restantes: ${this.inventory.criticalFailureDevicesCount()}.`,
      comment
    );

    this.evaluateBarrierProgression();
  }

  recordXaiAttempt(incidentId: string, selectedFactor: string): {
    correct: boolean;
    dominantFactor: string;
    explanation: string;
  } {
    const incident = this.inventory.incidents().find((inc) => inc.id === incidentId);
    if (!incident || incident.xaiFactors.length === 0) {
      return {
        correct: false,
        dominantFactor: '',
        explanation: 'Incidente não localizado.',
      };
    }

    const sorted = [...incident.xaiFactors].sort((a, b) => b.weight - a.weight);
    const topFactor = sorted[0];
    const isCorrect = selectedFactor === topFactor.factor;

    if (isCorrect) {
      this.xaiDecisions.update((s) => ({ ...s, correct: s.correct + 1 }));
      this.inventory.executeMitigation(incidentId);
      this.prometheusLine.set(PROMETHEUS_COPY.barriers.b3CorrectAnswer);

      this.appendLog(
        2,
        3,
        `Decisão XAI validada em ${incident.targetRegion}`,
        `Fator dominante reconhecido: "${topFactor.factor}" (${topFactor.weight}%). Mitigação aplicada.`,
        PROMETHEUS_COPY.barriers.b3CorrectAnswer
      );

      this.evaluateBarrierProgression();

      return {
        correct: true,
        dominantFactor: topFactor.factor,
        explanation: `Correto: "${topFactor.factor}" detém ${topFactor.weight}% do peso preditivo neste cenário. Rota normalizada e risco reduzido.`,
      };
    } else {
      this.xaiDecisions.update((s) => ({ ...s, wrong: s.wrong + 1 }));
      this.prometheusLine.set(PROMETHEUS_COPY.barriers.b3WrongAnswer);

      this.appendLog(
        2,
        3,
        `Revisão de pesos XAI em ${incident.targetRegion}`,
        `Fator selecionado ("${selectedFactor}") tem peso menor que "${topFactor.factor}" (${topFactor.weight}%).`,
        PROMETHEUS_COPY.barriers.b3WrongAnswer
      );

      return {
        correct: false,
        dominantFactor: topFactor.factor,
        explanation: `"${selectedFactor}" contribui parcialmente, mas "${topFactor.factor}" concentra ${topFactor.weight}% da predição. Confira o gráfico de pesos abaixo e tente novamente.`,
      };
    }
  }

  advance(): void {
    if (this.act() === 1) {
      this.startProtocol();
      return;
    }

    if (this.act() === 2 && this.barrier() === 1) {
      this.enterBarrierTwo();
      return;
    }

    if (this.act() === 2 && this.barrier() === 2) {
      this.enterBarrierThree();
      return;
    }

    if (this.act() === 2 && this.barrier() === 3) {
      this.enterActThree();
    }
  }

  enterFreeExplore(): void {
    this.freeExploreMode.set(true);
    this.requestTab('ops');
  }

  reset(): void {
    this.stopDemo();
    this.clearTimers();
    this.inventory.resetScenarioData();
    this.inventory.activeAlertBanner.set(null);

    this.act.set(1);
    this.barrier.set(0);
    this.freeExploreMode.set(false);
    this.verifiedDeviceIds.set([]);
    this.alertsResolvedCount.set(0);
    this.xaiDecisions.set({ correct: 0, wrong: 0 });
    this.completedElapsedSeconds.set(null);
    this.sessionStartMs = Date.now();
    this.prometheusLine.set(PROMETHEUS_COPY.act1.opening);

    this.log.set([
      {
        id: `EVT-${uuidv4().slice(0, 6)}`,
        timestamp: this.nowTime(),
        act: 1,
        barrier: 0,
        title: 'Sistema reiniciado para o Ato 1',
        detail: 'Malha restaurada ao estado inicial degradado (12% de controle).',
        prometheusComment: PROMETHEUS_COPY.act1.opening,
      },
    ]);
  }

  /**
   * Demonstração automática encenando os 3 atos com legendas e suporte a pausa.
   */
  runFullStory(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.reset();
    this.isDemoRunning.set(true);
    this.isDemoPaused.set(false);
    this.demoStepIndex = 0;
    this.demoProgressPct.set(5);
    this.demoSubtitle.set(PROMETHEUS_COPY.demoSubtitles.step1);

    const executeDemoStep = () => {
      if (!this.isDemoRunning() || this.isDemoPaused()) return;
      this.demoStepIndex++;

      switch (this.demoStepIndex) {
        case 1: {
          // Iniciar protocolo -> Barreira 1 (Inventário)
          this.setCoderCode('Banca DSIN');
          this.startProtocol();
          this.demoProgressPct.set(20);
          this.demoSubtitle.set(PROMETHEUS_COPY.demoSubtitles.step2);
          break;
        }
        case 2: {
          // Verificar lotes do inventário até superar 60%
          this.requestTab('inventory');
          const devices = this.inventory.devices();
          this.verifyDeviceCluster(devices[0].id);
          this.verifyDeviceCluster(devices[15].id);
          this.verifyDeviceCluster(devices[30].id);
          this.demoProgressPct.set(35);
          break;
        }
        case 3: {
          // Concluir Barreira 1 -> Dispara Barreira 2 (Chuva Torrencial na Central)
          const devices = this.inventory.devices();
          this.verifyDeviceCluster(devices[45].id);
          this.demoProgressPct.set(50);
          this.demoSubtitle.set(PROMETHEUS_COPY.demoSubtitles.step3);
          break;
        }
        case 4: {
          // Furto de radar + despacho e contenção de alertas críticos
          this.inventory.simulateRadarTheft();
          this.demoProgressPct.set(68);
          this.demoSubtitle.set(PROMETHEUS_COPY.demoSubtitles.step4);

          const anomalies = this.inventory.activeAnomalies();
          for (const anomaly of anomalies.slice(0, 8)) {
            this.inventory.dispatchAgentToDevice(anomaly.deviceId);
            this.inventory.updateDeviceStatus(
              anomaly.deviceId,
              'operational',
              'none',
              'Contido durante operação na Central.'
            );
          }
          this.recordAlertAction('dispatch', anomalies[0]?.serialNumber ?? 'RAD-510');
          this.recordAlertAction('normalize', anomalies[1]?.serialNumber ?? 'CAM-510');
          break;
        }
        case 5: {
          // Barreira 3: Cidade preditiva (XAI)
          if (this.barrier() < 3) {
            this.enterBarrierThree();
          }
          this.demoProgressPct.set(85);
          this.demoSubtitle.set(PROMETHEUS_COPY.demoSubtitles.step5);

          for (const inc of this.inventory.incidents()) {
            const top = [...inc.xaiFactors].sort((a, b) => b.weight - a.weight)[0];
            if (top) {
              this.recordXaiAttempt(inc.id, top.factor);
            }
          }
          break;
        }
        default: {
          // Ato 3: O Núcleo (100% controle)
          if (this.act() !== 3) {
            this.enterActThree();
          }
          this.demoProgressPct.set(100);
          this.demoSubtitle.set(PROMETHEUS_COPY.demoSubtitles.step6);
          this.stopDemo(true);
          break;
        }
      }
    };

    // Cadência fluida para avaliação rápida ou acompanhamento passo a passo
    this.demoIntervalId = setInterval(executeDemoStep, 4500);
  }

  togglePauseDemo(): void {
    if (!this.isDemoRunning()) return;
    this.isDemoPaused.update((paused) => !paused);
  }

  stopDemo(keepSubtitle = false): void {
    if (this.demoIntervalId) {
      clearInterval(this.demoIntervalId);
      this.demoIntervalId = null;
    }
    this.isDemoRunning.set(false);
    this.isDemoPaused.set(false);
    if (!keepSubtitle) {
      this.demoSubtitle.set('');
      this.demoProgressPct.set(0);
    }
  }

  private evaluateBarrierProgression(): void {
    if (this.act() !== 2) return;

    if (this.barrier() === 1 && this.barrierOneCleared()) {
      this.enterBarrierTwo();
      return;
    }

    if (this.barrier() === 2 && this.barrierTwoCleared()) {
      this.enterBarrierThree();
      return;
    }

    if (this.barrier() === 3 && this.barrierThreeCleared()) {
      this.enterActThree();
    }
  }

  private enterBarrierTwo(): void {
    this.barrier.set(2);
    this.prometheusLine.set(PROMETHEUS_COPY.barriers.b2RainTriggered);

    this.appendLog(
      2,
      2,
      'Barreira 1 superada — Barreira 2 iniciada',
      'Mais de 60% do inventário foi verificado. O PROMETHEUS reagiu disparando chuva torrencial na Zona Sul.',
      PROMETHEUS_COPY.barriers.b2RainTriggered
    );

    this.requestTab('ops');
    this.inventory.simulateTorrentialRain();

    // Dispara o furto de radar alguns segundos depois durante a Barreira 2
    this.clearTimers();
    if (isPlatformBrowser(this.platformId)) {
      this.radarTheftTimeoutId = setTimeout(() => {
        if (this.act() === 2 && this.barrier() === 2 && !this.isDemoPaused()) {
          this.inventory.simulateRadarTheft();
          this.prometheusLine.set(PROMETHEUS_COPY.barriers.b2TheftTriggered);
          this.appendLog(
            2,
            2,
            'Anomalia secundária: furto de radar detectado',
            'O PROMETHEUS testou o foco operacional cortando a telemetria de um radar arterial.',
            PROMETHEUS_COPY.barriers.b2TheftTriggered
          );
        }
      }, 8000);
    }
  }

  private enterBarrierThree(): void {
    this.clearTimers();
    this.barrier.set(3);
    this.prometheusLine.set(PROMETHEUS_COPY.barriers.b3Intro);

    this.appendLog(
      2,
      3,
      'Barreira 2 superada — Barreira 3 iniciada',
      'Crise imediata contida na Central. Meta final: provar compreensão dos fatores XAI e baixar o IRT médio para menos de 40.',
      PROMETHEUS_COPY.barriers.b3Intro
    );

    this.requestTab('predictive');
  }

  private enterActThree(): void {
    this.clearTimers();
    const allIds = this.inventory.devices().map((d) => d.id);
    this.verifiedDeviceIds.set(allIds);
    this.completedElapsedSeconds.set(
      Math.max(1, Math.round((Date.now() - this.sessionStartMs) / 1000))
    );
    this.act.set(3);
    this.barrier.set(3);
    this.prometheusLine.set(PROMETHEUS_COPY.act3.closing);

    this.appendLog(
      3,
      3,
      'Ato 3: O Núcleo — Controle em 100%',
      'As três barreiras caíram. A malha urbana foi integralmente retomada pelo operador.',
      PROMETHEUS_COPY.act3.closing
    );
  }

  private requestTab(tab: NavigationTabRequest): void {
    this.requestedTab.update((curr) => ({
      tab,
      seq: (curr?.seq ?? 0) + 1,
    }));
  }

  private appendLog(
    act: StoryAct,
    barrier: Barrier,
    title: string,
    detail: string,
    prometheusComment?: string
  ): void {
    const entry: StoryEvent = {
      id: `EVT-${uuidv4().slice(0, 8)}`,
      timestamp: this.nowTime(),
      act,
      barrier,
      title,
      detail,
      prometheusComment,
    };
    this.log.update((list) => [entry, ...list]);
  }

  private clearTimers(): void {
    if (this.radarTheftTimeoutId) {
      clearTimeout(this.radarTheftTimeoutId);
      this.radarTheftTimeoutId = null;
    }
  }

  private nowTime(): string {
    return new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
