# F.O.G.O. – Ferramenta Onisciente de Gestão e Operações

Solução para a **Etapa Bônus do DSIN Coder Challenge (Protocolo PROMETHEUS)**: SPA em **Angular 21** (standalone + Signals), **Tailwind CSS** e **Leaflet**.

Roda sem banco de dados, chaves de API ou servidor de mapas: o estado fica em memória (Signals) e é persistido no `localStorage`. Os dados de exemplo cobrem os 10 tipos de equipamento, as 6 situações e os 3 tipos de agente.

A operação acontece em **Nova Prometeia**, uma cidade fictícia desenhada em vetor pelo próprio Leaflet: contorno orgânico, 6 bairros, o Rio Brasa, parques, avenidas curvas e uma rodovia. Não há quadras nem prédios, para que o mapa destaque apenas o que importa à operação.

```bash
npm install
npm start          # http://localhost:4200
npm run build      # bundle de produção em dist/fogo-nexus
```

> Para voltar ao cenário inicial: **Inventário → Restaurar dados de exemplo**.

---

## Estrutura

```
src/app/
├── models/
│   ├── fogo.models.ts          # Tipos do domínio (Equipment, Agent, filtros, regiões, alertas)
│   └── equipment-schema.ts     # Rótulos, cores semânticas e schema dos campos dinâmicos por tipo
├── data/
│   ├── city-map.ts             # Geometria da cidade fictícia (bairros, rio, vias) e pontos sobre as vias
│   └── mock-data.ts            # 72 equipamentos, 24 agentes e histórico simulado por bairro
├── services/
│   ├── city-state.service.ts   # Estado global: CRUD, localStorage, filtros, KPIs, alertas, regiões, telemetria
│   └── prediction.service.ts   # Motor preditivo explicável + aplicação das recomendações
└── components/
    ├── ops-center/             # Parte 2: Central de Operações
    ├── inventory/              # Parte 1: Inventário inteligente
    └── predictive-engine/      # Parte 3: Cidade Preditiva
```

`Equipment` é uma união discriminada: o campo `type` define o formato de `customProperties`. Exemplos: câmera → `{ nightVision, resolution, colorMode }`; radar → `{ radarSubtype, maxSpeedLimit? }`. O mesmo schema (`CUSTOM_FIELDS`) monta o formulário dinâmico e o painel de detalhes.

## Parte 1 – Inventário inteligente

- Listagem unificada de **equipamentos** e **agentes**, com busca e filtros por tipo e situação.
- Drawer lateral para **cadastrar, editar e excluir**. Os campos específicos mudam conforme o tipo escolhido.
- A situação pode ser alterada direto na listagem. Toda alteração atualiza o mapa, os KPIs, os alertas e as previsões.

## Parte 2 – Central de Operações

- **KPIs**: total de equipamentos, operacionais, indisponíveis, disponibilidade (operacionais ÷ instalados) e agentes ativos.
- **Filtros** por tipo, situação, bairro e órgão responsável. Eles valem para o mapa, os KPIs, os alertas e a visão por região.
- **Mapa**: equipamentos em círculos com ícone do tipo; agentes em quadrados (AT/GM/PM). Cores das situações: verde = operacional, amarelo = manutenção, vermelho = falha ou furto, cinza = não instalado ou desativado. Os itens ficam sobre as vias, e o endereço de cada um usa o nome da via onde está.
- **Painel de detalhes** ao clicar num marcador ou alerta: endereço com referência, manutenção e propriedades específicas.
- **Alertas**: furtos, falhas graves, manutenção imediata, manutenção vencida ou prevista para os próximos 7 dias.
- **Visão por região**: Normal (< 15%), Atenção (15–30%) ou Crítico (≥ 30%), conforme a proporção de equipamentos indisponíveis no bairro. No mapa, cada bairro é pintado com a cor correspondente (mapa coroplético).
- **Simular telemetria em tempo real**: a cada 3 s, um equipamento falha ou se recupera e os veículos e agentes se deslocam. O feed de eventos registra cada mudança.

## Parte 3 – Cidade Preditiva

Cada card de previsão responde a três perguntas:

1. **O que está sendo previsto**
2. **Base de dados considerada**: as variáveis concretas que geraram o alerta
3. **Recomendação de decisão**: inclui um botão **Aplicar recomendação** que altera o estado da cidade

| Previsão | Base de dados | Ação aplicada |
|---|---|---|
| Índice de Risco de Colapso Viário | radares, câmeras e cancelas indisponíveis + fluxo histórico no pico + déficit de agentes | abre OS imediata e convoca ou realoca agentes |
| Tendência de Falha em Lote | taxa de falha de um mesmo fabricante/modelo comparada ao restante da frota | OS imediata para as unidades com falha e preventiva antecipada para as demais |
| Necessidade de Reforço de Efetivo | efetivo atual vs. necessário no pico + ocorrências por semana | convoca agentes de folga ou realoca excedentes de outros bairros |

O modelo é **heurístico e totalmente explicável**: os pesos estão em `prediction.service.ts` e também aparecem na própria tela, em "Como as previsões são calculadas".

## Uso de IA no desenvolvimento

O código foi desenvolvido com apoio de assistentes de IA (Claude Code). A pasta `api/` contém uma função serverless opcional (Vercel + Gemini) que a interface atual não utiliza.
