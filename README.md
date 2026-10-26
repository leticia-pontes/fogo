# F.O.G.O. – Ferramenta Onisciente de Gestão e Operações

Solução para a **Etapa Bônus do DSIN Coder Challenge (Protocolo PROMETHEUS)**: SPA em **Angular 21** (standalone + Signals), **Tailwind CSS** e **Leaflet**.

Roda sem banco de dados, chaves de API ou servidor de mapas: o estado fica em memória (Signals) e é persistido no `localStorage`. Os dados de exemplo cobrem 10 tipos de equipamento (há ainda o tipo **Outro**, para cadastros livres), as 6 situações e os 3 tipos de agente.

A operação acontece em **Nova Prometeia**, uma cidade fictícia desenhada em vetor pelo próprio Leaflet: contorno orgânico, 6 bairros, o Rio Brasa, parques, avenidas curvas e uma rodovia. Não há quadras nem prédios, para que o mapa destaque apenas o que importa à operação.

**Pré-requisitos:** Node.js ≥ 20.19 (testado com 24.x) e npm ≥ 10. O agente de voz exige Chrome ou Edge.

```bash
npm install
npm start          # http://localhost:4200
npm run build      # bundle de produção em dist/fogo-nexus
npm test           # testes unitários (Vitest)
```

> Para voltar ao cenário inicial: **Inventário → Restaurar dados de exemplo**.

### Roteiro de demonstração

1. **Missão guiada** (painel inferior): três passos que percorrem Inventário → Central → Cidade Preditiva. Use **Pular Calibração / Modo Livre** para explorar sem guia.
2. **Simular Cenários (Homologação)**, no cabeçalho, após a missão: onda de furtos no Centro, degradação na Zona Norte e véspera de pico na Zona Sul.
3. **Simular telemetria em tempo real**, na Central: começa **desligada**; ao ligar, um evento é gerado a cada 3 s.
4. **Agente de voz PROMETHEUS**: responde perguntas ("quantos alertas?", "qual o maior risco?") e pode anunciar em voz alta as falhas vindas da telemetria.

### Pacote de entrega

```bash
git archive -o fogo.zip HEAD   # só arquivos versionados, sem node_modules/dist/.angular
```

---

## Estrutura

```txt
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
- Drawer lateral para **cadastrar, editar e excluir**. Os campos específicos mudam conforme o tipo escolhido; o tipo **Outro** pede uma descrição livre.
- Validações: campos obrigatórios, formato do CEP, número de série e matrícula únicos, e coordenadas válidas e dentro dos limites da cidade.
- A situação pode ser alterada direto na listagem. Toda alteração atualiza o mapa, os KPIs, os alertas e as previsões.

## Parte 2 – Central de Operações

- **KPIs**: total de equipamentos, operacionais, indisponíveis, disponibilidade (operacionais ÷ instalados) e agentes ativos.
- **Filtros** por tipo, situação, bairro e órgão responsável. Eles valem para o mapa, os KPIs, os alertas e a visão por região.
- **Mapa**: equipamentos em círculos com ícone do tipo; agentes em quadrados (AT/GM/PM). Cores das situações: verde = operacional, amarelo = manutenção, vermelho = mau funcionamento, roxo com borda tracejada = furtado, cinza-escuro = desativado, cinza-claro com borda pontilhada = não instalado. A **legenda** no canto do mapa lista situações, tipos e agentes; clicar numa situação ou tipo aplica o filtro. Os itens ficam sobre as vias, e o endereço de cada um usa o nome da via onde está.
- **Painel de detalhes** ao clicar num marcador ou alerta: endereço com referência, manutenção e propriedades específicas.
- **Alertas**: furtos, falhas graves, manutenção imediata, manutenção vencida ou prevista para os próximos 7 dias, e **agente sem atividade** (fora de turno em bairro cujo efetivo em serviço está abaixo do necessário no pico).
- **Visão por região**: Normal (< 15%), Atenção (15–30%) ou Crítico (≥ 30%), conforme a proporção de equipamentos indisponíveis no bairro. No mapa, cada bairro é pintado com a cor correspondente (mapa coroplético).
- **Simular telemetria em tempo real**: a cada 3 s, um equipamento falha ou se recupera e os veículos e agentes seguem pelas vias do próprio bairro, fazendo o retorno no fim do trecho; o endereço acompanha a via atual. O feed de eventos registra cada mudança.
- **Desempenho**: o mapa é atualizado de forma incremental. Cada marcador é criado uma única vez e depois só se move ou troca de ícone, com ícones compartilhados em cache.

## Parte 3 – Cidade Preditiva

Cada card de previsão responde a três perguntas:

1. **O que está sendo previsto**
2. **Base de dados considerada**: as variáveis concretas que geraram o alerta
3. **Recomendação de decisão**: inclui um botão **Aplicar recomendação** que altera o estado da cidade

| Previsão | Base de dados | Ação aplicada |
| --- | --- | --- |
| Índice de Risco de Colapso Viário | radares, câmeras e cancelas indisponíveis + fluxo histórico no pico + déficit de agentes | abre OS imediata e convoca ou realoca agentes |
| Tendência de Falha em Lote | taxa de falha de um mesmo fabricante/modelo comparada ao restante da frota | OS imediata para as unidades com falha e preventiva antecipada para as demais |
| Necessidade de Reforço de Efetivo | efetivo atual vs. necessário no pico + ocorrências por semana | convoca agentes de folga ou realoca excedentes de outros bairros |

O modelo é **heurístico e totalmente explicável**: os pesos estão em `prediction.service.ts` e também aparecem na própria tela, em "Como as previsões são calculadas".

## Testes

`npm test` roda 27 testes unitários (Vitest, via `ng test`) sobre as regras de negócio:

- `city-state.service.spec.ts`: KPIs e disponibilidade, filtros aplicados a KPIs, alertas e regiões, limiares de saúde por bairro, alertas (furto, falha, manutenção vencida ou em até 7 dias, agente sem atividade), CRUD, persistência e determinismo do seed.
- `city-map.spec.ts`: deslocamento da telemetria sempre sobre as vias do bairro, inversão de sentido no fim do trecho e frota do teste de carga (determinística, séries únicas).
- `prediction.service.spec.ts`: as 4 previsões (colapso viário com a fórmula do score, reforço de efetivo, falha em lote, onda de furtos), determinismo e efeito de "Aplicar recomendação" no estado.

## Teste de carga

Abra `http://localhost:4200/?stress=2000` (máximo 5000) para somar uma frota sintética, determinística e posicionada sobre as vias. Ela fica só em memória e não sobrescreve os dados salvos.

Medição em Chrome headless com 2.072 equipamentos e 24 agentes, ao longo de 10 ciclos de telemetria:

| | Antes (redesenho completo) | Depois (incremental) |
| --- | --- | --- |
| Tempo de script por ciclo | 216 ms | 39 ms |
| Tempo de layout por ciclo | 17 ms | 6 ms |
| Marcadores recriados no DOM por ciclo | 2.096 | 0 |

## Uso de IA no desenvolvimento

O código foi desenvolvido com apoio de assistentes de IA: **Claude** (Claude Code) e **Gemini** (Antigravity). As pastas `.agents/` e `.gemini/` guardam a especificação usada como contexto pelas IAs e ficam fora do pacote de entrega (`.gitattributes`). A aplicação não chama nenhuma IA em tempo de execução: as previsões são regras explicáveis.
