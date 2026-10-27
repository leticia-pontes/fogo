import { Injectable, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NEIGHBORHOODS } from '../data/mock-data';
import { HEALTH_LABELS, TYPE_LABELS } from '../models/equipment-schema';
import { CityStateService } from './city-state.service';
import { PredictionService } from './prediction.service';

// Tipos mínimos da Web Speech API (nem todo lib.dom os inclui).
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

export interface VoiceExchange {
  question: string;
  answer: string;
}

/** Erros do reconhecimento de voz em linguagem de gente. */
const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed': 'Permissão de microfone negada. Libere o microfone no cadeado da barra de endereço.',
  'service-not-allowed': 'O navegador bloqueou o reconhecimento de voz. Use Chrome ou Edge, ou digite a pergunta.',
  'no-speech': 'Não ouvi nada. Toque no microfone e fale de novo.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network:
    'O serviço de transcrição do navegador não respondeu (precisa de internet; alguns navegadores, como Brave e Opera, não o oferecem). Use Chrome ou Edge, ou digite a pergunta.',
};

/** Remove acentos e caixa para comparar comandos falados. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Agente de voz do PROMETHEUS: fala (speechSynthesis), escuta (SpeechRecognition) e responde
 * a partir do estado real da cidade. Também anuncia falhas detectadas pela telemetria.
 */
@Injectable({ providedIn: 'root' })
export class VoiceAgentService {
  private readonly city = inject(CityStateService);
  private readonly predictions = inject(PredictionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly RecognitionImpl: RecognitionCtor | null = this.isBrowser
    ? ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition ??
      null)
    : null;
  private recognition: Recognition | null = null;
  private lastAnnouncedEventId: string | null = null;

  readonly canSpeak = this.isBrowser && 'speechSynthesis' in window;
  /** O Brave expõe a API, mas não tem o serviço de transcrição: falha sempre com "network". */
  private readonly isBrave = this.isBrowser && 'brave' in navigator;
  readonly canListen = !!this.RecognitionImpl && !this.isBrave;
  /** Por que o microfone está desabilitado (vazio quando está disponível). */
  readonly motivoSemEscuta = this.canListen
    ? ''
    : this.isBrave
      ? 'O Brave não oferece o serviço de transcrição de voz. Use Chrome ou Edge, ou digite a pergunta.'
      : 'Reconhecimento de voz indisponível neste navegador. Use Chrome ou Edge, ou digite a pergunta.';

  readonly announcements = signal(false);
  readonly listening = signal(false);
  readonly speaking = signal(false);
  readonly interim = signal('');
  readonly history = signal<VoiceExchange[]>([]);
  readonly error = signal<string | null>(null);

  constructor() {
    // Anuncia em voz alta apenas falhas novas vindas da telemetria.
    effect(() => {
      const latest = this.city.events()[0];
      if (!latest || latest.id === this.lastAnnouncedEventId) return;
      this.lastAnnouncedEventId = latest.id;
      if (!untracked(() => this.announcements())) return;
      const match = /^\[Telemetria\] (\S+) \((.+)\) → Mau funcionamento$/.exec(latest.message);
      if (!match || (this.canSpeak && speechSynthesis.speaking)) return;
      const item = untracked(() => this.city.equipment().find((e) => e.serialNumber === match[1]));
      const label = item ? TYPE_LABELS[item.type] : 'Equipamento';
      this.speak(`Atenção. ${label} em ${match[2]} entrou em mau funcionamento.`);
    });
  }

  /** `rate`: velocidade da fala (1 = natural); textos longos, como o boletim, pedem mais. */
  speak(text: string, rate = 1.3): void {
    if (!this.canSpeak) return;
    speechSynthesis.cancel();
    // "agente(s)" e "lotado(s)" ficam estranhos lidos em voz alta.
    const utterance = new SpeechSynthesisUtterance(text.replace(/\(s\)/g, 's'));
    utterance.lang = 'pt-BR';
    utterance.rate = rate;
    utterance.pitch = 0.9;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('pt-br'));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => this.speaking.set(true);
    utterance.onend = utterance.onerror = () => this.speaking.set(false);
    speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    if (this.canSpeak) speechSynthesis.cancel();
    this.speaking.set(false);
  }

  toggleListening(): void {
    if (this.listening()) {
      this.recognition?.stop();
      return;
    }
    if (!this.canListen || !this.RecognitionImpl) {
      this.error.set(this.motivoSemEscuta);
      return;
    }
    // Nova pergunta interrompe a resposta anterior (e o microfone não capta a própria voz).
    this.stopSpeaking();
    this.error.set(null);
    const rec = new this.RecognitionImpl();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          this.interim.set('');
          this.ask(text.trim());
          return;
        }
      }
      this.interim.set(text);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      this.error.set(RECOGNITION_ERRORS[e.error] ?? `Erro no reconhecimento de voz (${e.error}). Digite a pergunta.`);
    };
    rec.onend = () => {
      this.listening.set(false);
      this.interim.set('');
    };
    this.recognition = rec;
    this.listening.set(true);
    rec.start();
  }

  /** Responde a uma pergunta (falada ou digitada) e fala a resposta. */
  ask(question: string): void {
    if (!question) return;
    const answer = this.answer(question);
    this.history.update((h) => [{ question, answer }, ...h].slice(0, 6));
    this.speak(answer);
  }

  private answer(question: string): string {
    const q = normalize(question);
    const kpis = this.city.kpis();
    const has = (...words: string[]) => words.some((w) => q.includes(w));

    if (has('ajuda', 'o que voce', 'comandos')) {
      return 'Pergunte sobre o resumo da cidade, alertas, agentes, previsões ou um bairro. Também posso aplicar a recomendação mais crítica e ligar ou desligar a telemetria.';
    }

    if (has('telemetria')) {
      const wantsOn = has('liga', 'inici', 'ativ', 'comec');
      const wantsOff = has('deslig', 'para', 'paus', 'desativ', 'encerr');
      if ((wantsOn && !this.city.telemetryOn()) || (wantsOff && this.city.telemetryOn())) {
        this.city.toggleTelemetry();
        return this.city.telemetryOn() ? 'Telemetria em tempo real iniciada.' : 'Telemetria pausada.';
      }
      return `A telemetria está ${this.city.telemetryOn() ? 'ativa' : 'pausada'}.`;
    }

    if (has('aplica', 'execut') && has('recomend', 'previs', 'acao')) {
      const target = this.predictions.predictions().find((p) => !this.predictions.isApplied(p) && p.actions.length);
      if (!target) return 'Não há recomendações pendentes para aplicar.';
      this.predictions.apply(target);
      return `Recomendação aplicada em ${target.subject}. ${target.recommendation}`;
    }

    const hood = NEIGHBORHOODS.find((n) => q.includes(normalize(n.name)));
    if (hood) {
      const region = this.city.regions().find((r) => r.neighborhood === hood.name);
      const prediction = this.predictions.predictions().find((p) => p.neighborhood === hood.name);
      if (!region) return `Não há dados de ${hood.name} na visão filtrada atual.`;
      return (
        `${hood.name} está em situação ${HEALTH_LABELS[region.health]}: ${region.unavailable} de ${region.total} equipamentos indisponíveis ` +
        `e ${region.activeAgents} agentes em serviço.` +
        (prediction ? ` Previsão: ${prediction.title}, risco ${prediction.riskScore} de 100.` : '')
      );
    }

    if (has('previs', 'risco', 'recomend', 'antecip')) {
      const list = this.predictions.predictions();
      if (!list.length) return 'Nenhum risco relevante previsto no momento.';
      const top = list[0];
      return `Há ${list.length} previsões ativas. A mais crítica é ${top.title} em ${top.subject}, risco ${top.riskScore} de 100. Recomendação: ${top.recommendation}`;
    }

    if (has('alerta', 'falha', 'furto', 'problema', 'anomalia')) {
      const alerts = this.city.alerts();
      if (!alerts.length) return 'Nenhum alerta ativo.';
      const critical = alerts.filter((a) => a.severity === 'critical');
      return `Existem ${alerts.length} alertas, ${critical.length} críticos. O primeiro é: ${(critical[0] ?? alerts[0]).title.replace(' · ', ', ')}.`;
    }

    if (has('agente', 'efetivo', 'viatura', 'equipe')) {
      return `${kpis.activeAgents} agentes em serviço, ${kpis.inDispatch} em despacho, de ${kpis.totalAgents} cadastrados.`;
    }

    if (has('resumo', 'status', 'situacao', 'disponib', 'como esta', 'cidade')) {
      return (
        `${kpis.total} equipamentos, ${kpis.operational} operacionais e ${kpis.unavailable} indisponíveis. ` +
        `Disponibilidade de ${kpis.availabilityPct.toLocaleString('pt-BR')} por cento. ` +
        `${this.city.alerts().length} alertas ativos e ${this.predictions.predictions().length} previsões.`
      );
    }

    return 'Não entendi. Pergunte sobre o resumo da cidade, alertas, agentes, previsões ou um bairro.';
  }
}
