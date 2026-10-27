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

### Roteiro de demonstração (a partir do banco recém-resetado: `npm run reset` e `npm start`)

1. Abra o painel e clique em **Pular Calibração / Modo Livre** (ou siga a missão guiada de 3 passos). O cabeçalho mostra **Banco conectado**.
2. **Simular Cenários → Falha de Energia (Entroncamento)**: faixa vermelha de cenário ativo, alertas críticos sobem, disponibilidade cai de 75% para 69,2% e a saúde do Entroncamento de 47 para 17.
3. **Boletim da PROMETHEUS** (abaixo dos KPIs): o texto já reflete o apagão; **Ouvir** lê em voz alta.
4. Aba **Simulador · ações**: as 3 próximas melhores ações. **Simular esta** mostra o ANTES × DEPOIS e destaca no mapa os itens afetados e as células de cobertura; **Aplicar esta ação** grava e audita.
5. Aba **Rota de manutenção → Gerar rota**: linha numerada no mapa; **Concluir** em algumas paradas e o painel melhora (disponibilidade, saúde, risco, boletim).
6. **Reverter cenário** (na faixa vermelha) desfaz só o que o cenário mudou.

Outros recursos: **Pontos cegos** e **Raios de cobertura** no canto do mapa; **Simular telemetria em tempo real** (começa desligada; um evento a cada 3 s, gravado no histórico); **agente de voz** ("quantos alertas?", "qual o maior risco?"); os outros cenários (onda de furtos, degradação na Zona Norte, véspera de pico na Zona Sul).

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
├── validation.ts               # Validação dos cadastros (inclui propriedades por tipo)
└── api.spec.ts                 # Testes da API + persistência
src/app/
├── core/                       # Regras puras (sem Angular, sem banco), usadas pelo painel e pela API
│   ├── state.ts                # CityState: o estado que as funções recebem
│   ├── indicators.ts           # calcularIndicadores, calcularAlertas, calcularRegioes
│   ├── analysis.ts             # calcularSaudePorRegiao, calcularRisco, collapseStats (Parte 3)
│   ├── coverage.ts, coverage-config.ts   # calcularCobertura e raios por tipo
│   ├── simulation.ts           # simular, aplicarAcao
│   ├── recommendations.ts      # recomendarAcoes
│   ├── maintenance-route.ts    # gerarRotaManutencao
│   ├── bulletin.ts             # gerarBoletim
│   └── scenarios.ts            # cenários de crise e reversão
├── models/
│   ├── fogo.models.ts          # Tipos do domínio (Equipment, Agent, filtros, regiões, alertas)
│   └── equipment-schema.ts     # Rótulos, cores semânticas e schema dos campos dinâmicos por tipo
├── data/
│   ├── city-map.ts             # Geometria da cidade fictícia (bairros, rio, vias) e pontos sobre as vias
│   └── mock-data.ts            # Seed: 54 equipamentos, 19 agentes e histórico simulado por bairro
├── services/
│   ├── api.ts                  # Cliente HTTP da API
│   ├── city-state.service.ts   # Estado em Signals: carga do servidor, sincronização em lote, filtros, telemetria
│   ├── prediction.service.ts   # Motor preditivo explicável (Parte 3) + aplicação das recomendações
│   ├── scenario.service.ts     # Cenários de crise (servidor quando online, local quando offline)
│   ├── simulation.service.ts   # Simulador e próximas melhores ações
│   └── route.service.ts        # Rota de manutenção
└── components/
    ├── ops-center/             # Parte 2: Central de Operações (mapa, KPIs, alertas, regiões)
    ├── simulator/, route/, bulletin/   # Simulador, rota e boletim (dentro da Central)
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

## Rota de manutenção

Aba **Rota de manutenção** no painel lateral da Central: filtros por região, tipo, "só críticos" e máximo de paradas; botão **Gerar rota de manutenção**. O mapa mostra a base (B) e a linha tracejada numerada até a última parada; a lista ao lado traz situação, motivo, justificativa da posição e distância acumulada. **Concluir** marca a parada como atendida: o equipamento volta a "Operacional", a próxima preventiva vai para 90 dias depois e a auditoria registra `CONCLUIR_PARADA_ROTA`. **Simular o efeito da rota** abre o simulador com todas as paradas pendentes.

`gerarRotaManutencao(estado, { origem?, limite?, apenasCriticos?, bairro?, tipo? })` (`core/maintenance-route.ts`):

1. **Seleção**: imediata (mau funcionamento ou manutenção imediata), vencida (preventiva vencida ou em manutenção) e próxima (preventiva em até 7 dias; fica de fora com "só críticos"). Furtados ficam fora: exigem reposição, não manutenção.
2. **Ordem**: a partir da base, escolhe a parada de menor **distância ÷ peso** (imediata 6, vencida 2,5, próxima 1), com distâncias haversine. Enquanto houver imediata pendente, só imediatas são elegíveis, então um item crítico nunca fica para o fim por estar longe.
3. **Estimativa**: distância total = soma dos trechos (linha reta); tempo = distância ÷ 25 km/h + 20 min por parada. É uma estimativa declarada: o trajeto real pelas vias é mais longo.

Nas recomendações, a rota com até 6 paradas críticas entra como candidata (`EXECUTAR_ROTA_MANUTENCAO`, que é a composição de `ANTECIPAR_MANUTENCAO` para cada parada). Rota: `GET /api/rota-manutencao?bairro=&tipo=&apenasCriticos=1&limite=10`.

## Boletim da PROMETHEUS

Card no topo da Central, logo abaixo dos KPIs: **Atualizar boletim**, **Copiar**, **Exportar .txt** e **Ouvir** (usa a voz do agente PROMETHEUS). O boletim se refaz sozinho quando o estado muda (cenário de crise, ação aplicada, parada concluída, telemetria).

`gerarBoletim(estado, previsoes, agora)` (`core/bulletin.ts`) monta o texto a partir de **templates determinísticos** preenchidos com números do estado, no tom da PROMETHEUS (confiante, levemente irônica, profissional):

1. saudação conforme o horário (bom dia / boa tarde / boa noite) e hora do boletim;
2. disponibilidade (operacionais ÷ instalados, agentes em serviço) com um comentário por faixa;
3. regiões que exigem atenção (saúde < 60 ou risco ALTO), com o motivo: fiscalização fora, déficit de efetivo, manutenção vencida;
4. alertas críticos ativos;
5. preventivas que vencem nas próximas 48 h (as corretivas já estão nos alertas);
6. pontos cegos: % coberto e o bairro com menor cobertura;
7. maior risco para o próximo pico (janela histórica do bairro);
8. a próxima melhor ação recomendada, com o impacto estimado.

Sem nada crítico, o texto diz "Tudo sob controle". **Não usa LLM**: o mesmo estado e horário geram sempre o mesmo texto e nenhum número é inventado. (Não há modo opcional com LLM: preferi não depender de chave nem arriscar números diferentes na demonstração.) Rota: `GET /api/boletim`.

## Testes

`npm test` roda **78 testes** (Vitest): 69 do painel e das regras via `ng test` e 9 da API/SQLite (`npm run test:server`).

- `core/simulation.spec.ts`: simular não altera o estado original; desativar nunca aumenta disponibilidade nem cobertura; realocar tira efetivo da origem e soma no destino; antecipar manutenção nunca piora a saúde; diferenças ordenadas; recomendações ordenadas por ganho, determinísticas e a primeira realmente melhora os indicadores; cobertura (um equipamento isolado cobre só as células dentro do raio, desativá-lo reduz a cobertura, dois sobrepostos não perdem cobertura quando um cai, agente fora de turno não cobre).
- `core/maintenance-route.spec.ts`: imediatas antes das de menor criticidade, sem paradas repetidas, distância total = soma dos trechos, lista vazia sem erro, filtros e furtados fora.
- `core/bulletin.spec.ts`: o boletim cita os números corretos, muda quando o estado muda e, sem alertas, diz "tudo sob controle".
- `core/scenarios.spec.ts`: cada cenário altera o estado sem mutar a entrada e é reproduzível; reverter devolve exatamente o estado anterior e preserva itens criados depois.
- `server/api.spec.ts`: banco criado e populado na primeira execução e não repopulado depois; criar, consultar, editar e desativar equipamento e agente persistem entre reinícios; validação das propriedades por tipo; `sync` com histórico e alertas; cenário persistido e revertido; simulação não grava e aplicar grava e audita; reset restaura o estado inicial.
- `city-state.service.spec.ts`, `prediction.service.spec.ts`, `marker-sync.spec.ts`, `city-map.spec.ts`: KPIs, filtros, alertas, previsões da Parte 3, mapa incremental e telemetria (testes anteriores, mantidos).

## Teste de carga

Abra `http://localhost:4200/?stress=2000` (máximo 5000) para somar uma frota sintética, determinística e posicionada sobre as vias. Ela fica só em memória: nesse modo o painel não lê nem grava no banco. Para volume dentro do banco, use `npm run sintetico`.

Medição em Chrome headless com 2.072 equipamentos e 24 agentes (seed anterior), ao longo de 10 ciclos de telemetria:

| | Antes (redesenho completo) | Depois (incremental) |
| --- | --- | --- |
| Tempo de script por ciclo | 216 ms | 39 ms |
| Tempo de layout por ciclo | 17 ms | 6 ms |
| Marcadores recriados no DOM por ciclo | 2.096 | 0 |

Com o agrupamento, a mesma frota aparece como 85 ícones (58 grupos, 24 agentes e alguns itens isolados), e cada ciclo de telemetria leva cerca de 29 ms de script. Veículos dentro de um grupo visível só têm a posição aplicada no próximo zoom, porque reposicioná-los a cada ciclo forçava o redesenho dos grupos (111 ms por ciclo).

## Suposições e limitações

- **Cidade fictícia.** O desafio pedia bairros reais; mantive **Nova Prometeia** (6 bairros) porque o mapa é desenhado em vetor, sem servidor de mapas, e todos os pontos ficam sobre as vias desenhadas. CEPs seguem o formato brasileiro e as coordenadas ficam no interior de SP, mas nenhum endereço é real.
- **Números são estimativas por regras.** Saúde, risco, cobertura, ganho das recomendações e tempo da rota vêm de fórmulas documentadas acima, com pesos escolhidos por bom senso, não calibrados com dados reais. O histórico de fluxo e ocorrências por bairro é simulado (`NEIGHBORHOOD_HISTORY`).
- **Raios de cobertura** são valores de referência, e a cobertura não considera obstáculos nem o ângulo das câmeras.
- **Rota** usa distância em linha reta e velocidade média fixa; o trajeto real pelas vias é mais longo.
- **Antecipar manutenção** na simulação é uma projeção com o serviço concluído na data; ao aplicar com data futura, a ação só agenda.
- **Datas da seed** são relativas ao dia do reset (ex.: "vence amanhã"); mesma seed no mesmo dia, mesmo resultado.
- **Concorrência:** o painel envia alterações em lote (último a gravar vence). Cenários, ações e reset rodam no servidor e devolvem o estado completo.
- **Auditoria** registra o autor pelo cabeçalho `x-usuario` (o painel envia "gestor (painel)"); não há autenticação.
- **Modo offline** (sem servidor, ex.: deploy estático): tudo funciona com as mesmas funções puras, mas sem banco, histórico nem auditoria.
- **Desempenho das recomendações** cresce com o número de candidatas; com milhares de equipamentos em falha, só as 12 manutenções mais urgentes são simuladas por completo.

## Uso de IA no desenvolvimento

O código foi desenvolvido com apoio de assistentes de IA: **Claude** (Claude Code) e **Gemini** (Antigravity). Na etapa final (cenários com reversão, banco SQLite e API, simulador, próxima melhor ação, pontos cegos, rota de manutenção e boletim), o Claude Code (modelo Claude Opus 5.5) escreveu o código e os testes a partir de uma especificação detalhada do autor, que revisou as decisões. As pastas `.agents/` e `.gemini/` guardam a especificação usada como contexto pelas IAs e ficam fora do pacote de entrega (`.gitattributes`).

A aplicação **não chama nenhuma IA em tempo de execução**: previsões, recomendações e o boletim são regras e templates explicáveis, com as fórmulas descritas neste README.

