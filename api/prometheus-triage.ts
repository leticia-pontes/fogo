/// <reference types="node" />
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export interface TriageRequestPayload {
  scenario?: string;
  region?: string;
  activeFailures?: number;
  stolenCount?: number;
  weatherAlert?: boolean;
  incidentSummary?: string;
}

export interface TriageResponsePayload {
  source: 'gemini-ai' | 'prometheus-heuristic-fallback';
  model: string;
  timestamp: string;
  tacticalBriefing: string;
  priorityLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'NOMINAL';
  recommendedDirectives: string[];
  xaiReasoning: {
    factor: string;
    weight: number;
  }[];
}

interface VercelRequest {
  method?: string;
  body?: TriageRequestPayload | string;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: TriageResponsePayload | { error: string }) => void;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).json({ error: 'OK' });
    return;
  }

  const parsedBody: TriageRequestPayload =
    typeof req.body === 'string' ? (JSON.parse(req.body) as TriageRequestPayload) : (req.body ?? {});

  const region = parsedBody.region ?? 'Zona Sul';
  const activeFailures = parsedBody.activeFailures ?? 4;
  const stolenCount = parsedBody.stolenCount ?? 1;
  const weatherAlert = parsedBody.weatherAlert ?? false;
  const scenario = parsedBody.scenario ?? 'MONITORAMENTO_CONTINUO';

  const apiKey = process.env['GOOGLE_GENERATIVE_AI_API_KEY'] || process.env['GEMINI_API_KEY'];

  if (apiKey) {
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const prompt = `Você é PROMETHEUS, a IA Central de Comando Tático Urbano do sistema F.O.G.O. (Nexus Urbano).
Analise o cenário operacional atual e retorne estritamente um JSON válido com:
- tacticalBriefing (string curta e direta em tom militar/operacional cyberpunk)
- priorityLevel ("CRITICAL" | "HIGH" | "MODERATE" | "NOMINAL")
- recommendedDirectives (array com 3 diretrizes acionáveis para viaturas, semáforos ou manutenção)
- xaiReasoning (array de 3 objetos { "factor": string, "weight": number } somando 100)

Dados de Telemetria:
- Cenário: ${scenario}
- Região Foco: ${region}
- Equipamentos em falha crítica: ${activeFailures}
- Sensores furtados: ${stolenCount}
- Alerta Meteorológico Severo: ${weatherAlert ? 'ATIVO (Chuva Torrencial)' : 'INATIVO'}
- Resumo adicional: ${parsedBody.incidentSummary ?? 'Operação padrão da malha urbana'}`;

      const { text } = await generateText({
        model: google('gemini-2.0-flash'),
        prompt,
      });

      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as Omit<TriageResponsePayload, 'source' | 'model' | 'timestamp'>;

      res.status(200).json({
        source: 'gemini-ai',
        model: 'gemini-2.0-flash',
        timestamp: new Date().toISOString(),
        tacticalBriefing: parsed.tacticalBriefing,
        priorityLevel: parsed.priorityLevel,
        recommendedDirectives: parsed.recommendedDirectives,
        xaiReasoning: parsed.xaiReasoning,
      });
      return;
    } catch {
      // Fallback to deterministic tactical response if API call or JSON parsing fails
    }
  }

  const isCritical = weatherAlert || stolenCount > 0 || activeFailures >= 5;
  res.status(200).json({
    source: 'prometheus-heuristic-fallback',
    model: 'gemini-2.0-flash-simulated',
    timestamp: new Date().toISOString(),
    tacticalBriefing: weatherAlert
      ? `[PROMETHEUS // ALERTA VERMELHO] Precipitação extrema detectada em ${region}. 4 sensores acusando lâmina d'água crítica e IRT elevado para 92/100. Recomenda-se bloqueio preventivo de vias baixas e onda verde de escoamento.`
      : stolenCount > 0
        ? `[PROMETHEUS // QUEBRA DE PERÍMETRO] Corte abrupto de telemetria óptica e violação de chassi detectados (${stolenCount} unidade(s) furtada(s)). Viatura tática mais próxima vetorizada para interceptação.`
        : `[PROMETHEUS // SINCRONIA NOMINAL] Malha IoT operando dentro dos parâmetros táticos em ${region}. ${activeFailures} anomalias sob contenção preventiva.`,
    priorityLevel: isCritical ? 'CRITICAL' : activeFailures > 2 ? 'HIGH' : 'NOMINAL',
    recommendedDirectives: weatherAlert
      ? [
          `Ativar Onda Verde de escoamento nos corredores da ${region}`,
          'Despachar 2 viaturas da Defesa Civil / Trânsito para bloqueio de alagamento',
          'Redirecionar fluxo pesado via painéis de mensagem variável (PMV)',
        ]
      : [
          `Deslocar viatura tática para inspeção visual na ${region}`,
          'Reconfigurar ciclo semafórico adjacente para absorver retenção (+18s verde)',
          'Emitir Ordem de Serviço de Urgência Imediata para equipe de campo',
        ],
    xaiReasoning: weatherAlert
      ? [
          { factor: 'Acumulado Pluviométrico (>65mm/h)', weight: 45 },
          { factor: 'Saturação de Sensores de Drenagem', weight: 35 },
          { factor: 'Histórico de Retenção Viária no Corredor', weight: 20 },
        ]
      : [
          { factor: 'Perda Abrupta de Heartbeat / Telemetria', weight: 40 },
          { factor: 'Densidade de Fluxo Veicular no Horário', weight: 35 },
          { factor: 'Tempo de Resposta da Patrulha Mais Próxima', weight: 25 },
        ],
  });
}

