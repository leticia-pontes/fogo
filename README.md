# F.O.G.O. – Ferramenta Onisciente de Gestão e Operações

Solução para a **Etapa Bônus do DSIN Coder Challenge (Protocolo PROMETHEUS)**: painel em **Angular 21** (standalone + Signals), **Tailwind CSS** e **Leaflet**, com uma API em **Node.js** gravando num banco **SQLite**.

Roda sem chaves de API, sem servidor de mapas e sem instalar banco: o SQLite é um arquivo único (`data/fogo.db`), criado e populado sozinho na primeira execução. Os dados de exemplo cobrem 10 tipos de equipamento (há ainda o tipo **Outro**, para cadastros livres), as 6 situações e os 3 tipos de agente.

A operação acontece em **Nova Prometeia**, uma cidade fictícia desenhada em vetor pelo próprio Leaflet: contorno orgânico, 6 bairros, o Rio Brasa, parques, avenidas curvas e uma rodovia. Não há quadras nem prédios, para que o mapa destaque apenas o que importa à operação.

**Pré-requisitos:** Node.js ≥ 22.13 (testado com 24.x; usa o `node:sqlite` nativo) e npm ≥ 10. O agente de voz exige Chrome ou Edge.

```bash
npm install
npm start               # API (porta 3000) + painel em http://localhost:4200
npm run reset           # apaga o banco e recria com a seed de exemplo
npm test                # testes do painel e das regras (ng test) + testes da API/SQLite
npm run serve           # build de produção servido pela própria API em http://localhost:3000
```

> Para voltar ao cenário inicial também dá para usar **Inventário → Restaurar dados de exemplo** ou **Simular Cenários → Restaurar Estado Inicial**: no painel conectado, os dois recriam o banco.

### Roteiro de demonstração

1. **Missão guiada** (painel inferior): três passos que percorrem Inventário → Central → Cidade Preditiva. Use **Pular Calibração / Modo Livre** para explorar sem guia.
2. **Simular Cenários (Homologação)**, no cabeçalho, após a missão: onda de furtos no Centro, degradação na Zona Norte, véspera de pico na Zona Sul e falha de energia no Entroncamento. Com um cenário ativo, uma faixa vermelha mostra o cenário e os alertas críticos, com o botão **Reverter cenário** (desfaz só o que o cenário mudou).
3. **Simular telemetria em tempo real**, na Central: começa **desligada**; ao ligar, um evento é gerado a cada 3 s.
4. **Agente de voz PROMETHEUS**: responde perguntas ("quantos alertas?", "qual o maior risco?") e pode anunciar em voz alta as falhas vindas da telemetria.

### Pacote de entrega

```bash
git archive -o fogo.zip HEAD   # só arquivos versionados, sem node_modules/dist/.angular
```

---

## Banco de dados e API

**Por que SQLite:** é um arquivo único, sem servidor nem instalação, e o Node 22+ já traz o driver (`node:sqlite`), então não há dependência nativa para compilar.

- **Criação automática:** ao subir, a API cria `data/fogo.db` com o esquema e a seed. Se o arquivo já existe, nada é repopulado. `FOGO_DB=/outro/caminho.db` muda o arquivo.
- **Esquema** (`server/db.ts`): `equipamentos` (campos comuns em colunas + `propriedades` JSON validada por `json_valid` e pelo schema do tipo na API), `agentes`, `eventos_situacao` (histórico de telemetria/mudanças de situação), `alertas` (abertos/encerrados conforme o estado), `auditoria` (quem, quando, antes → depois), `cenarios_aplicados` (snapshot para reverter) e `estado_cidade`. Índices em tipo, situação e bairro.
- **Repositório** (`server/repository.ts`): `listarEquipamentos()`, `listarAgentes()`, `salvarEquipamento()`, `salvarAgente()`, `registrarAuditoria()` e afins. A API só fala com o banco por ele; as regras de negócio (`src/app/core/`) recebem o estado lido e não sabem que o banco existe.
- **Painel ↔ API:** o painel carrega `GET /api/estado` e envia em lote (`POST /api/sync`, a cada 250 ms de inatividade) só o que mudou: cadastros, mudanças de situação, telemetria e recomendações aplicadas. Cenários de crise e reset rodam no servidor. Sem servidor (ex.: deploy estático na Vercel), o cabeçalho mostra **Modo offline** e o estado fica no `localStorage`, como antes.

| Rota | O que faz |
| --- | --- |
| `GET /api/estado` | equipamentos, agentes, bairro em pico e cenário ativo |
| `GET/POST /api/equipamentos`, `GET/PUT/DELETE /api/equipamentos/:id` | CRUD (filtros `?tipo=&situacao=&bairro=`) |
| `PATCH /api/equipamentos/:id/situacao` | troca a situação (ex.: desativar) |
| `GET/POST /api/agentes`, `GET/PUT/DELETE /api/agentes/:id`, `PATCH /api/agentes/:id/situacao` | idem para agentes |
| `POST /api/sync` | gravação em lote vinda do painel |
| `POST /api/cenarios/:id`, `POST /api/cenarios/reverter` | aplica / reverte cenário de crise |
| `POST /api/reset` | recria o banco com a seed |
| `GET /api/alertas`, `GET /api/eventos`, `GET /api/auditoria` | alertas abertos, histórico de situação, auditoria |

### Seed enxuta

54 equipamentos e 19 agentes em 6 bairros, gerados de forma determinística (`src/app/data/mock-data.ts`) e marcados com `origem = 'seed'` no banco. Cobre todos os tipos e todas as situações, com CEPs e referências variadas ("Oposto ao nº 181", "KM 14", "S/N", "Em frente à Prefeitura"). Casos de borda para a demonstração: **Entroncamento** com saúde baixa, **Orla do Rio** com efetivo bem abaixo do necessário, um equipamento no **Centro Histórico** com preventiva vencendo amanhã e um lote de câmeras Hikvision degradando. As datas de manutenção são relativas ao dia em que a seed roda.

**Dados sintéticos de volume** ficam desligados: só são gerados sob demanda.

```bash
npm run sintetico -- --eventos=5000       # histórico de telemetria (não muda o estado atual)
npm run sintetico -- --equipamentos=500   # frota extra no mapa (origem = 'sintetico')
npm run reset                             # volta ao estado limpo
```

## Estrutura

```txt
server/
├── main.ts                     # Sobe a API (porta 3000) e, se houver build, serve o painel
├── app.ts                      # Rotas da API
├── db.ts                       # Esquema SQLite e abertura do arquivo
├── repository.ts               # Repositório: única camada que lê/grava o banco
├── seed.ts, reset.ts, synthetic.ts
└── validation.ts               # Validação dos cadastros (inclui propriedades por tipo)
src/app/
├── core/                       # Regras puras (sem Angular, sem banco): indicadores, cenários…
├── models/
│   ├── fogo.models.ts          # Tipos do domínio (Equipment, Agent, filtros, regiões, alertas)
│   └── equipment-schema.ts     # Rótulos, cores semânticas e schema dos campos dinâmicos por tipo
├── data/
│   ├── city-map.ts             # Geometria da cidade fictícia (bairros, rio, vias) e pontos sobre as vias
│   └── mock-data.ts            # Seed: 54 equipamentos, 19 agentes e histórico simulado por bairro
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
- **Desempenho**: o mapa é atualizado de forma incremental (`marker-sync.ts`). Cada marcador é criado uma única vez e depois só se move ou troca de ícone, com ícones compartilhados em cache.
- **Agrupamento**: acima de 300 equipamentos visíveis, os próximos entre si viram grupos (`leaflet.markercluster`). O grupo mostra a quantidade e tem a borda na cor da pior situação que contém (furto > falha > manutenção > desativado > não instalado > operacional); passar o mouse mostra o resumo por situação. A partir do zoom 16 os grupos se desfazem. Agentes e o item selecionado (por clique ou alerta) ficam sempre fora dos grupos. A demonstração padrão, com 54 equipamentos, não usa grupos.

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

## Simulador e próxima melhor ação

No painel lateral da Central, aba **Simulador · melhores ações** (ou pelos botões **E se…?** no detalhe de um equipamento ou agente). O gestor escolhe a ação, vê o **ANTES × DEPOIS** e só depois decide **Aplicar** (com confirmação). Os itens afetados ganham um halo laranja tracejado no mapa; células que viram ponto cego ficam vermelhas e as recuperadas, verdes.

| Ação | Parâmetros | Efeito simulado |
| --- | --- | --- |
| `FALHA_EQUIPAMENTO` | `equipamentoId` | situação → mau funcionamento, manutenção imediata |
| `DESATIVAR_EQUIPAMENTO` | `equipamentoId` | situação → desativado |
| `REALOCAR_AGENTES` | `agentes[]`, `regiaoDestino` | agentes vão para o destino (de folga = convocado) |
| `ANTECIPAR_MANUTENCAO` | `equipamentoId`, `novaData` | projeção com a manutenção concluída na data: volta a operar e a próxima preventiva fica para 90 dias depois. Ao **aplicar** com data futura, só agenda |

**Como funciona** (`src/app/core/`, funções puras, sem banco nem tela):

- `simular(estado, acao)` faz uma cópia profunda do estado (`structuredClone`), aplica a ação na cópia e calcula, antes e depois, os indicadores gerais, a saúde e o risco de cada bairro e os pontos cegos. Devolve `{ antes, depois, diferencas, fatores, avisos }`: as diferenças vêm ordenadas pelo tamanho da mudança (ex.: "Saúde de Vila Esperança: 94 → 89 (−5)"), os fatores dizem o que entrou na conta e os avisos apontam efeitos colaterais (ex.: "Vila Esperança passa a ter risco ALTO", "Surgem 6 novos pontos cegos").
- `recomendarAcoes(estado, { topN: 3 })` monta ações candidatas (manutenção imediata de cada equipamento em falha, manutenção, imediata ou vencida; convocar agentes de folga em bairros com déficit; realocar o excedente dos bairros de menor risco para os de déficit), roda `simular` em cada uma e ordena pelo **ganho = Σ queda de risco + 0,5 × Σ alta de saúde + 0,5 × pontos cegos recuperados**. No máximo 2 sugestões do mesmo tipo entram no top 3. Cada recomendação traz o impacto (antes → depois), a justificativa e a confiança (alta para reparo, média para realocação) com as limitações. É uma **estimativa por regras**, não uma previsão estatística.
- `aplicarAcao(estado, acao)` produz o estado novo; a API grava, registra na auditoria quem, quando e o antes → depois dos itens afetados, e o painel se atualiza sem recarregar.

Rotas: `POST /api/simulacao` (`{ acao }`, não grava nada), `GET /api/recomendacoes?topN=3`, `POST /api/acoes/aplicar` (`{ acao }`, grava e devolve o novo estado) e `GET /api/analise` (indicadores, saúde, risco e cobertura atuais).

### Índice de saúde por bairro (0–100)

```
saúde = 40 × disponibilidade + 20 × manutenção + 15 × alertas + 25 × efetivo
```

| Componente | Cálculo |
| --- | --- |
| disponibilidade | operacionais ÷ instalados |
| manutenção | 1 − (vencidas + imediatas + 0,5 × próximas em até 7 dias) ÷ instalados (mín. 0) |
| alertas | 1 − (0,2 × críticos + 0,1 × altos) (mín. 0); crítico = furto/falha grave, alto = manutenção imediata ou vencida |
| efetivo | agentes em serviço ÷ necessários no pico (máx. 1) |

### Risco por bairro (0–100)

```
risco = escore de colapso viário (Parte 3) + 20 × fração do bairro em ponto cego
escore de colapso = 15 × fiscalização indisponível (máx. 45) + fluxo no pico relativo (máx. 30) + 10 × déficit de agentes (máx. 25)
```

Nível: **ALTO** ≥ 55 (o mesmo limiar que dispara a previsão de colapso), **MÉDIO** ≥ 35, **BAIXO** abaixo. O escore de colapso é o mesmo da Cidade Preditiva (`collapseStats` em `core/analysis.ts`, usado pelas duas telas).

## Pontos cegos de cobertura

`calcularCobertura(estado)` (`core/coverage.ts`) divide a cidade numa grade de células de **250 m** (521 células dentro dos bairros). Uma célula está **coberta** se o centro dela fica a até R metros (distância haversine) de pelo menos um **equipamento operacional** ou de um **agente em serviço**. Devolve o % coberto da cidade e de cada bairro e a lista de pontos cegos.

Raios (`core/coverage-config.ts`, valores de referência para a demonstração, não medições de campo):

| Fonte | Raio |
| --- | --- |
| Viatura | 600 m |
| Moto operacional | 500 m |
| Câmera | 450 m |
| Agente em serviço (a pé ou em viatura) | 400 m |
| Veículo autônomo de fiscalização | 400 m |
| Radar | 300 m |
| Balança, cancela, outro | 150 m |
| Totem | 120 m |
| Veículo de transporte, patinete | 0 (não fiscalizam) |

- **Mapa**: botões **Pontos cegos** (células escurecidas, com o total e o % coberto) e **Raios de cobertura** (círculos de cada fonte ativa). Os cards de região mostram o % de cobertura do bairro.
- **Simulador**: toda falha ou desativação lista os **novos pontos cegos** e os destaca em vermelho no mapa; manutenções e realocações mostram em verde as células recuperadas. As recomendações somam 0,5 ponto de ganho por célula recuperada, e o risco do bairro inclui a fração em ponto cego.
- **Desempenho** (Node 24, média de 10 execuções): 0,7 ms com a seed (54 equipamentos, 19 agentes); 2,3 ms com 2.054 equipamentos; 1,3 ms com 5.054. A grade é calculada uma vez e cada fonte passa por um pré-filtro de caixa antes do haversine. Já as recomendações simulam cada candidata por completo; por isso só as 12 manutenções mais urgentes (pré-filtro barato) são simuladas: 72 ms com a seed e 338 ms com 2.054 equipamentos (eram 4,8 s sem o pré-filtro).
- `GET /api/cobertura` devolve o resultado atual.

## Testes

`npm test` roda 40 testes unitários (Vitest, via `ng test`) sobre as regras de negócio:

- `city-state.service.spec.ts`: KPIs e disponibilidade, filtros aplicados a KPIs, alertas e regiões, limiares de saúde por bairro, alertas (furto, falha, manutenção vencida ou em até 7 dias, agente sem atividade), CRUD, persistência e determinismo do seed.
- `marker-sync.spec.ts`: o mapa reaproveita os marcadores (só move ou troca o ícone do que mudou, remove o que saiu, compartilha ícones) e, com grupos, aplica as mudanças em lote, adia a posição de quem está dentro de um grupo visível e recalcula a cor do grupo.
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

Com o agrupamento, a mesma frota aparece como 85 ícones (58 grupos, 24 agentes e alguns itens isolados), e cada ciclo de telemetria leva cerca de 29 ms de script. Veículos dentro de um grupo visível só têm a posição aplicada no próximo zoom, porque reposicioná-los a cada ciclo forçava o redesenho dos grupos (111 ms por ciclo).

## Uso de IA no desenvolvimento

O código foi desenvolvido com apoio de assistentes de IA: **Claude** (Claude Code) e **Gemini** (Antigravity). As pastas `.agents/` e `.gemini/` guardam a especificação usada como contexto pelas IAs e ficam fora do pacote de entrega (`.gitattributes`). A aplicação não chama nenhuma IA em tempo de execução: as previsões são regras explicáveis.
