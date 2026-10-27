# F.O.G.O. – Ferramenta Onisciente de Gestão e Operações

> *"Bom dia, gestor. A cidade continua de pé. Por enquanto."* – PROMETHEUS, no primeiro boletim do dia

Solução para a **Etapa Bônus do DSIN Coder Challenge (Protocolo PROMETHEUS)**: painel em **Angular 21** (standalone + Signals), **Tailwind CSS** e **Leaflet**, com uma API em **Node.js** gravando num banco **SQLite**.

A operação acontece em **Nova Prometeia**, uma cidade fictícia desenhada em vetor pelo próprio Leaflet: contorno orgânico, 6 bairros, o Rio Brasa, parques, avenidas curvas e uma rodovia. Não há quadras nem prédios, para que o mapa destaque apenas o que importa à operação. Radares, câmeras, viaturas e agentes ficam sobre as vias; o gestor cadastra, monitora, prevê e decide. A PROMETHEUS comenta (com alguma ironia).

## Como rodar

**Pré-requisitos:** Node.js ≥ 22.13 (testado com 24.x; usa o `node:sqlite` nativo) e npm ≥ 10. Para **falar** com o agente de voz, use Chrome ou Edge, com internet e em `localhost`. Em outros navegadores dá para digitar as perguntas (veja [Agente de voz](#agente-de-voz-prometheus)).

```bash
npm install
npm start               # API (porta 3000) + painel em http://localhost:4200
npm run reset           # apaga o banco e recria com a seed de exemplo
npm test                # testes do painel e das regras (ng test) + testes da API/SQLite
npm run serve           # build de produção servido pela própria API em http://localhost:3000
```

| Endereço | O que é |
| --- | --- |
| `http://localhost:4200` | Painel (desenvolvimento, com `npm start`) |
| `http://localhost:3000` | Painel de produção servido pela API, quando existe um build (`npm run serve`) |
| `http://localhost:3000/api/docs` | Documentação interativa da API (Swagger UI) |
| `http://localhost:3000/api/openapi.json` | Especificação OpenAPI 3 |

Não é preciso instalar banco nem subir servidor de mapas: o SQLite é um arquivo único (`data/fogo.db`), criado e populado sozinho na primeira execução. Os dados de exemplo cobrem 10 tipos de equipamento (há ainda o tipo **Outro**, para cadastros livres), as 6 situações e os 3 tipos de agente.

> Para voltar ao cenário inicial também dá para usar **Inventário → Restaurar dados de exemplo** ou **Simular Cenários → Restaurar Estado Inicial**: no painel conectado, os dois recriam o banco.

### Preciso de chave de API? Não.

O código do sistema **não chama nenhum serviço de IA nem API externa** em tempo de execução, e **nenhuma variável de ambiente é obrigatória**. A única exceção fica por conta do navegador: a transcrição do microfone, explicada abaixo. As únicas lidas são opcionais: `PORT` (padrão 3000) e `FOGO_DB` (caminho do banco).

Se você tem um `.env` com uma chave do Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`), ela é herança das primeiras versões: havia uma rota serverless (`api/prometheus-triage.ts`) que pedia ao Gemini um briefing tático. Ela foi removida e trocada por regras e templates determinísticos (veja [Boletim da PROMETHEUS](#boletim-da-prometheus)). Hoje nada lê esse arquivo, então ele pode ser apagado sem efeito. O `.env` está no `.gitignore` e nunca entra no pacote de entrega.

A voz do agente PROMETHEUS usa a **Web Speech API**, que vem no próprio navegador. O projeto não usa chave nem serviço configurado, mas há um detalhe:

- **Fala (texto → voz):** sintetizada pelo navegador, funciona offline. É o que lê o boletim e anuncia as falhas.
- **Escuta (voz → texto):** no Chrome, o navegador envia o áudio para o serviço de transcrição do Google, e no Edge, para o da Microsoft. Precisa de internet, permissão de microfone e página em `localhost` ou HTTPS. Firefox não tem reconhecimento de voz. Em qualquer desses casos o botão do microfone fica desabilitado ou mostra o motivo, e a pergunta pode ser **digitada** no mesmo campo, com a mesma resposta falada. Detalhes e solução de problemas em [Agente de voz](#agente-de-voz-prometheus).

O mapa é desenhado em vetor localmente. Fora a transcrição de voz, a internet só é usada para baixar as fontes (Google Fonts) e o Swagger UI (jsDelivr). Sem rede, todo o resto funciona, só com a fonte padrão e sem a página `/api/docs`.

## O que o sistema faz

Um dia típico do gestor em Nova Prometeia:

1. **Cadastra a frota** no **Inventário**: equipamentos de 11 tipos (radar, câmera, balança, cancela, totem, veículos, patinetes, viaturas…), cada um com seus campos próprios (a câmera tem visão noturna, o radar tem limite de velocidade), e os agentes de trânsito, guardas municipais e policiais militares. Ou, mais rápido: **clica direto numa rua do mapa**, e o formulário já abre com via, bairro, CEP e coordenadas daquele ponto.
2. **Acompanha a cidade** na **Central de Operações**: mapa com tudo plotado e colorido por situação, KPIs, alertas críticos, saúde de cada bairro e um boletim falado da PROMETHEUS. Liga a telemetria e assiste equipamentos falhando e viaturas circulando.
3. **Antecipa problemas** na **Cidade Preditiva**: risco de colapso viário, falha em lote de um fabricante e falta de efetivo no pico, sempre com o que foi previsto, os dados usados e um botão para aplicar a recomendação.
4. **Testa decisões antes de tomá-las** no **Simulador**: "e se esta câmera cair?", "e se eu mover 3 agentes para a Orla?". Vê o ANTES × DEPOIS, as 3 próximas melhores ações e só então aplica, com auditoria.
5. **Planeja o dia da equipe técnica** com a **Rota de manutenção**: as paradas críticas primeiro, depois as mais próximas.
6. **Treina para o pior** com os **Cenários de crise** (apagão, onda de furtos, degradação, véspera de pico) e depois reverte tudo com um clique.

## Obrigatório × diferencial

O que o desafio pede e o que foi além dele.

### Requisitos do desafio (básico)

| Parte | Requisito | Onde está |
| --- | --- | --- |
| 1 – Inventário | Cadastro de equipamentos com identificação, localização (CEP, rua, bairro, referência, coordenadas), situação e manutenção | Inventário → drawer de cadastro |
| 1 – Inventário | Propriedades específicas por tipo de equipamento | Formulário dinâmico (`CUSTOM_FIELDS`) |
| 1 – Inventário | Cadastro de agentes (matrícula, função, órgão, situação, posição) | Inventário → aba de agentes |
| 2 – Central | Mapa interativo com ícone por tipo e cor por situação, detalhes ao clicar | Central de Operações |
| 2 – Central | KPIs: total, operacionais × indisponíveis, disponibilidade, agentes ativos | Faixa de KPIs |
| 2 – Central | Filtros por tipo, situação, bairro e órgão | Barra de filtros (valem para mapa, KPIs e alertas) |
| 2 – Central | Destaque de manutenção imediata e preventiva vencendo | Alertas |
| 2 – Central | Painel de alertas críticos | Alertas (furto, falha, manutenção, agente sem atividade) |
| 2 – Central | Visão consolidada por região (coroplético) | Bairros pintados + cards de região |
| 3 – Preditiva | Previsões com as três respostas: o que é previsto, com base em quê, qual decisão tomar | Cidade Preditiva (3 tipos de previsão) |
| Entrega | Documentação e menção às IAs usadas | Este README |

### Diferenciais (extras)

O enunciado avisa que *"não será sobre quem usou mais tecnologia, mais IA ou mais linhas de código"*. Por isso, cada extra só entrou se respondesse a uma das perguntas do próprio desafio ou a um dos critérios de avaliação (efetividade, desempenho, experiência de uso, qualidade técnica, criatividade). O critério foi simples: se o extra não ajuda o gestor a **perceber**, **antecipar** ou **decidir**, ele ficou de fora.

| Extra | Por que foi implementado | Como ajuda a resolver o problema |
| --- | --- | --- |
| **Cadastro pelo mapa** (clicar numa via preenche endereço e coordenadas) | A Parte 1 pede CEP, bairro, cidade/UF, rua, referência **e** coordenadas GPS. Digitar latitude e longitude à mão é o jeito mais fácil de errar um cadastro | O equipamento nasce exatamente sobre a via, no bairro certo, sem erro de digitação. Coordenada errada estragaria tudo o que vem depois: mapa, cobertura, risco e rota |
| **API Node + banco SQLite** com histórico, alertas e auditoria (quem, quando, antes → depois) | A Parte 3 fala em *"dados históricos"*, e a PROMETHEUS precisa de memória para enxergar tendência. Um painel que esquece tudo no F5 não tem histórico nenhum | O estado persiste entre reinícios, cada mudança de situação vira evento consultável e cada decisão tem autor e rastro. É a base que torna as previsões e a auditoria possíveis |
| **Swagger UI** em `/api/docs` | O FAQ aceita *"apenas uma API"* como entrega e lembra que projeto que *"roda de primeira"* é avaliado *"com um sorriso no rosto"* | Quem avalia explora e testa toda a API pelo navegador, com exemplos prontos, sem Postman nem ler código |
| **Telemetria em tempo real simulada** | A Parte 2 diz que a PROMETHEUS *"passará a receber continuamente informações"* e pede a cidade *"em tempo real"*. Sem dispositivos reais, era preciso simular o fluxo | Falhas, recuperações e veículos circulando pelas vias mostram o painel reagindo ao vivo: KPIs, alertas e boletim mudam sozinhos. Responde, na prática, a *"Se algo estiver acontecendo na cidade agora, PROMETHEUS conseguirá perceber?"* |
| **Pontos cegos de cobertura** (grade de 250 m) | A visão por região mostra *o que* está quebrado, mas não *onde a cidade ficou sem olhos*. Uma câmera parada no meio de três radares importa menos que a única câmera de uma avenida | Mede o % da cidade vigiado por algum equipamento ou agente e entra no índice de risco. A pergunta deixa de ser "quantos caíram?" e passa a ser "o que deixamos de ver?" |
| **Simulador "E se…?" + próxima melhor ação** | A Parte 3 pede *"recomendações para apoiar a tomada de decisão"* e diz que o valor está em *"transformar uma previsão em algo realmente útil"*. Uma previsão sem ação sugerida deixa o gestor sozinho no "e agora?" | O gestor vê o ANTES × DEPOIS de uma decisão **antes** de tomá-la, e o sistema ranqueia as 3 ações de maior ganho com justificativa e confiança. Previsão vira decisão, e decisão vira resultado medido |
| **Rota de manutenção** ponderada pela criticidade | A Parte 2 pede para *destacar* manutenções imediatas e próximas. Destacar 15 alertas não diz à equipe técnica por onde começar | Transforma a lista de alertas num roteiro de trabalho: críticos primeiro, depois os mais próximos, com distância e tempo estimados. Concluir uma parada atualiza a cidade inteira |
| **Cenários de crise reversíveis** (apagão, furtos, degradação, véspera de pico) | A Parte 3 pede para *"agir antes que um problema aconteça"*. Para treinar a resposta é preciso provocar o problema, sem estragar os dados reais | O gestor (e quem avalia) vê em segundos como a cidade e as recomendações reagem a uma crise, e depois desfaz só o que o cenário mudou |
| **Boletim da PROMETHEUS** + **agente de voz** | A Parte 2 pede para entender a situação *"rapidamente"*. Um gestor numa sala de controle nem sempre tem tempo de ler oito cards | O boletim resume em um parágrafo o que exige atenção agora e qual a próxima melhor ação, e pode ser ouvido. Usa templates com os números reais: nada é inventado, e o texto é sempre o mesmo para o mesmo estado |
| **Mapa incremental + agrupamento** (até 5.000 equipamentos) | Desempenho é critério explícito de avaliação, e uma cidade real tem milhares de dispositivos, não 54 | Atualizar só o que mudou cortou o script por ciclo de 216 ms para 39 ms, e o agrupamento mantém o mapa legível com frota grande (ver [Teste de carga](#teste-de-carga)) |
| **Missão guiada de 3 passos** | Experiência de uso é critério de avaliação, e a comissão vai testar *"tanta coisa"* | Em três passos, quem nunca viu o sistema descobre onde está cada parte. Quem já conhece pula direto para o modo livre |
| **Modo offline** | Se a API não subir (ou num deploy estático), o painel não pode virar uma tela branca | Tudo funciona no navegador com as mesmas funções puras, só sem banco, histórico e auditoria |
| **82 testes automatizados** | Qualidade técnica e *"demonstrar entendimento daquilo que a IA construiu"* | As regras (simulação, cobertura, rota, boletim, cenários), a API e a persistência são verificadas a cada `npm test`. As fórmulas não dependem de confiança, dependem de teste |

## Tecnologias e por quê

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Front-end | **Angular 21** (standalone + Signals) | Estado reativo fino: um filtro muda e só o que depende dele é recalculado (mapa, KPIs, alertas), sem biblioteca extra de estado |
| Estilo | **Tailwind CSS** | Visual de central de operações consistente, sem folha de estilo gigante |
| Mapa | **Leaflet** + `leaflet.markercluster` | Leve, sem chave nem conta, e desenha a cidade fictícia em vetor; o agrupamento cuida da alta densidade |
| Ícones | **Lucide** | Um ícone claro por tipo de equipamento |
| API | **Node.js** com `node:http` puro | São ~30 rotas simples: um roteador de 10 linhas basta, sem framework |
| Banco | **SQLite** via `node:sqlite` (nativo do Node 22+) | Arquivo único, zero instalação, nada nativo para compilar |
| Regras | **TypeScript puro** em `src/app/core/` | As mesmas funções rodam no navegador e no servidor, e são testadas sem tela nem banco |
| Testes | **Vitest** | Rápido, e o mesmo runner do `ng test` |
| Voz | **Web Speech API** | Fala e escuta nativas do navegador, sem chave nem integração no código. A fala funciona offline; a escuta usa o serviço de transcrição do próprio navegador (Google no Chrome, Microsoft no Edge) |
| Docs da API | **OpenAPI 3 + Swagger UI** (via CDN) | Documentação navegável sem nova dependência |

A stack sugerida no desafio citava PostgreSQL/PostGIS e modelos de ML. Para uma solução que precisa rodar com `npm install && npm start` em qualquer máquina, SQLite e heurísticas explicáveis entregam o mesmo valor demonstrativo sem infraestrutura, e toda fórmula está documentada abaixo.

## Caso de uso: apagão no Entroncamento

> **Situação:** sexta-feira, véspera do pico. Cai a energia no Entroncamento. A PROMETHEUS já percebeu; o gestor precisa reagir.

Partindo de um banco limpo (`npm run reset` e depois `npm start`). Os números abaixo valem para a seed padrão.

| # | Passo | Resultado esperado |
| --- | --- | --- |
| 1 | Abra `http://localhost:4200` e clique em **Pular Calibração / Modo Livre** (ou siga a missão guiada) | Cabeçalho mostra **Banco conectado**; disponibilidade **75%**; Entroncamento com saúde **47** |
| 2 | **Simular Cenários → Falha de Energia (Entroncamento)** | Faixa vermelha de cenário ativo; disponibilidade **75% → 69,2%**; saúde do Entroncamento **47 → 17**; alertas críticos **7 → 10** |
| 3 | Leia o **Boletim da PROMETHEUS** (abaixo dos KPIs) e clique em **Ouvir** | O texto cita o apagão e o Entroncamento entre as regiões que exigem atenção; a voz lê o boletim |
| 4 | Aba **Simulador · ações** | Top 3: **Executar rota de manutenção (6 paradas críticas, ~5,7 km, ~134 min)**, realocar agentes do Centro Histórico para a Orla do Rio e para o Entroncamento |
| 5 | **Simular esta** na primeira | ANTES × DEPOIS com as diferenças ordenadas; itens afetados com halo laranja no mapa. **Nada é gravado** |
| 6 | Aba **Rota de manutenção → Gerar rota**, depois **Concluir** em algumas paradas | Linha numerada no mapa; a cada parada, disponibilidade, saúde, risco e boletim melhoram; **Auditoria** registra `CONCLUIR_PARADA_ROTA` |
| 7 | **Reverter cenário** (na faixa vermelha) | Só o que o cenário mudou é desfeito; o que você consertou ou criou depois continua |

### O mesmo teste pela API (Swagger)

Em `http://localhost:3000/api/docs`, com **Try it out**:

| # | Chamada | Resultado esperado |
| --- | --- | --- |
| 1 | `POST /api/reset` | 200 com o estado inicial (54 equipamentos, 19 agentes) |
| 2 | `GET /api/analise` | `indicadores` com disponibilidade 75; Entroncamento com `health: 47` em `saude` |
| 3 | `POST /api/cenarios/power_outage` | 200 com `label: "Falha de energia em Entroncamento"` |
| 4 | `GET /api/analise` | Disponibilidade 69,2; Entroncamento com `health: 17` |
| 5 | `GET /api/recomendacoes` | 3 recomendações; a primeira é a rota de manutenção com 6 paradas |
| 6 | `POST /api/simulacao` com `{ "acao": { "tipo": "DESATIVAR_EQUIPAMENTO", "equipamentoId": "<id de /api/equipamentos>" } }` | ANTES × DEPOIS; `GET /api/auditoria` continua igual (simular não grava) |
| 7 | `POST /api/equipamentos` com o exemplo pronto do Swagger | **201** com o equipamento criado |
| 8 | Repetir o mesmo `POST` | **409** "Equipamento … já existe" |
| 9 | `POST /api/equipamentos` com `{ "id": "x" }` | **400** "Dados inválidos" e a lista de campos em `detalhes` |
| 10 | `PATCH /api/equipamentos/{id}/situacao` com `{ "situacao": "stolen" }` | `GET /api/alertas` traz o alerta crítico **"Furto detectado · <número de série>"** |
| 11 | `GET /api/auditoria` | `EDITAR_EQUIPAMENTO`, `CRIAR_EQUIPAMENTO` e `APLICAR_CENARIO`, com autor `gestor` (ou o valor de `x-usuario`) |
| 12 | `POST /api/cenarios/reverter` | Estado sem o apagão; repetir dá **409** "Nenhum cenário ativo" |

Os mesmos comportamentos (cenário aplicado e revertido, simulação que não grava, validação, 409 por id repetido, auditoria) também são verificados automaticamente em `server/api.spec.ts` (`npm run test:server`).

### Outros recursos para explorar

**clique numa rua** para cadastrar um equipamento ali; **Pontos cegos** e **Raios de cobertura** no canto do mapa; **Simular telemetria em tempo real** (começa desligada; um evento a cada 3 s, gravado no histórico); **agente de voz** ("quantos alertas?", "qual o maior risco?"); os outros cenários (onda de furtos, degradação na Zona Norte, véspera de pico na Zona Sul); e `?stress=2000` na URL para ver o mapa com uma frota enorme.

### Pacote de entrega

```bash
git archive -o fogo.zip HEAD   # só arquivos versionados, sem node_modules/dist/.angular/.env
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
| `GET /api/docs`, `GET /api/openapi.json` | Swagger UI e especificação OpenAPI |
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
├── openapi.ts                  # Especificação OpenAPI + página do Swagger UI (/api/docs)
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
- **Cadastro a partir do mapa**: clicar numa rua, avenida ou rodovia da Central abre este mesmo drawer com via, bairro, CEP, cidade/UF e coordenadas preenchidos (detalhes na [Parte 2](#parte-2--central-de-operações)). Só falta escolher o tipo e informar a referência.
- Validações: campos obrigatórios, formato do CEP, número de série e matrícula únicos, e coordenadas válidas e dentro dos limites da cidade.
- A situação pode ser alterada direto na listagem. Toda alteração atualiza o mapa, os KPIs, os alertas e as previsões.

## Parte 2 – Central de Operações

- **KPIs**: total de equipamentos, operacionais, indisponíveis, disponibilidade (operacionais ÷ instalados) e agentes ativos.
- **Filtros** por tipo, situação, bairro e órgão responsável. Eles valem para o mapa, os KPIs, os alertas e a visão por região.
- **Mapa**: equipamentos em círculos com ícone do tipo; agentes em quadrados (AT/GM/PM). Cores das situações: verde = operacional, amarelo = manutenção, vermelho = mau funcionamento, roxo com borda tracejada = furtado, cinza-escuro = desativado, cinza-claro com borda pontilhada = não instalado. A **legenda** no canto do mapa lista situações, tipos e agentes; clicar numa situação ou tipo aplica o filtro. Os itens ficam sobre as vias, e o endereço de cada um usa o nome da via onde está.
- **Cadastro pelo mapa**: passar o mouse numa rua, avenida ou rodovia mostra o nome dela e a dica "Clique para cadastrar um equipamento aqui". O clique abre o Inventário com o formulário de novo equipamento já preenchido:
  - **via, bairro e cidade/UF** do ponto clicado;
  - **coordenadas** encaixadas no eixo da via mais próxima (até ~80 m do clique), para o equipamento não nascer no meio de uma quadra;
  - **CEP** com o prefixo do bairro (`13904-000`), o mesmo padrão do cadastro manual, já que a cidade fictícia não tem CEP por rua;
  - **referência**: em rodovia vem a quilometragem ("KM 12"); em ruas e avenidas fica para o gestor ("Oposto ao nº 181", "Em frente à Prefeitura").

  Rio, lago e parques mostram o nome, mas não abrem o cadastro, e cliques fora dos bairros são ignorados. O encaixe é feito por `pointOnRoad` (`data/city-map.ts`), que projeta o clique em cada trecho de via e devolve o ponto mais próximo com bairro e KM.
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

```txt
saúde = 40 × disponibilidade + 20 × manutenção + 15 × alertas + 25 × efetivo
```

| Componente | Cálculo |
| --- | --- |
| disponibilidade | operacionais ÷ instalados |
| manutenção | 1 − (vencidas + imediatas + 0,5 × próximas em até 7 dias) ÷ instalados (mín. 0) |
| alertas | 1 − (0,2 × críticos + 0,1 × altos) (mín. 0); crítico = furto/falha grave, alto = manutenção imediata ou vencida |
| efetivo | agentes em serviço ÷ necessários no pico (máx. 1) |

### Risco por bairro (0–100)

```txt
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

Sem nada crítico, o texto diz "Tudo sob controle". **Não usa LLM**: o mesmo estado e horário geram sempre o mesmo texto e nenhum número é inventado. As primeiras versões chamavam o Gemini para um briefing tático; troquei por templates para não depender de chave, de rede nem arriscar números diferentes no meio da demonstração. A ironia continua, só que agora é determinística. Rota: `GET /api/boletim`.

## Agente de voz PROMETHEUS

Botão redondo com o **microfone**, flutuando no canto da tela. Ele abre o painel **PROMETHEUS · Voz**: você pergunta (falando ou digitando) e a PROMETHEUS responde em texto e em voz alta, com os números do estado atual da cidade.

### Como usar

1. Clique no botão do microfone para abrir o painel.
2. Toque no **microfone** e fale, ou **digite** a pergunta no campo e tecle Enter. Os chips de sugestão também funcionam com um clique.
3. Enquanto você fala, a transcrição parcial aparece em itálico. Ao terminar a frase, a resposta é mostrada e lida em voz alta.
4. **Anunciar falhas** (caixa no topo do painel): com a telemetria ligada, a PROMETHEUS avisa em voz alta cada equipamento que entra em mau funcionamento.

### O que dá para perguntar

As perguntas são interpretadas por palavras-chave, sem LLM. Não importa a forma exata da frase, nem acento ou maiúscula.

| Pergunte algo como | Resposta |
| --- | --- |
| "Resumo da cidade", "como está a cidade?" | Total de equipamentos, operacionais, indisponíveis, disponibilidade, alertas e previsões |
| "Quais os alertas?", "quantos alertas?" | Total de alertas, quantos são críticos e qual é o primeiro |
| "Previsão mais crítica", "qual o maior risco?" | Quantas previsões ativas, a mais crítica, o escore de risco e a recomendação |
| "Como está o Entroncamento?" (qualquer bairro) | Situação do bairro, equipamentos indisponíveis, agentes em serviço e a previsão dele |
| "Quantos agentes?" | Agentes em serviço, em despacho e cadastrados |
| "Aplicar recomendação" | **Aplica** a recomendação pendente mais crítica da Cidade Preditiva |
| "Iniciar telemetria" / "parar telemetria" | Liga ou desliga a telemetria em tempo real |
| "Ajuda" | Lista o que dá para perguntar |

### Requisitos: o que funciona onde

A voz usa a **Web Speech API**, que vem no próprio navegador. O projeto não tem chave nem integração própria para isso, mas as duas metades se comportam de forma diferente:

| | Fala (texto → voz) | Escuta (voz → texto) |
| --- | --- | --- |
| Usada em | Respostas do agente, **Ouvir** do boletim, anúncio de falhas | Botão do microfone |
| Quem processa | O próprio navegador/sistema operacional | **Serviço online do navegador**: Google no Chrome, Microsoft no Edge. O áudio sai da máquina |
| Precisa de internet | Não | **Sim** |
| Navegadores | Chrome, Edge, Firefox, Safari | **Chrome e Edge** (Firefox não tem; no Brave costuma falhar com erro de rede) |
| Outras condições | Uma voz em português instalada (sem ela, o navegador usa a voz padrão) | **Permissão de microfone** e página em `localhost` ou **HTTPS** |

**Sem microfone, sem internet ou noutro navegador**, o agente continua funcionando: digite a pergunta e a resposta sai em texto e em voz do mesmo jeito.

### Se o microfone não funcionar

| Mensagem no painel | Causa | O que fazer |
| --- | --- | --- |
| Botão do microfone desabilitado | O navegador não tem reconhecimento de voz | Use Chrome ou Edge, ou digite |
| "Permissão de microfone negada…" | O microfone foi bloqueado para o site | Clique no cadeado da barra de endereço → Microfone → Permitir, e recarregue |
| "O reconhecimento de voz precisa de internet…" | Sem rede, ou o serviço do navegador bloqueado (comum no Brave) | Conecte-se ou digite a pergunta |
| "Não ouvi nada…" | Silêncio ou microfone mudo | Verifique o microfone de entrada do sistema e fale logo após tocar |
| "Nenhum microfone encontrado." | Não há dispositivo de captura | Conecte um microfone ou digite |
| Nada acontece ao abrir pelo IP da rede (`http://192.168…`) | O navegador só libera o microfone em `localhost` ou HTTPS | Abra por `http://localhost:4200` (ou `:3000`) |

O código fica em `services/voice-agent.service.ts` (reconhecimento, síntese e respostas) e `components/voice-agent/` (painel).

## Testes

`npm test` roda **82 testes** (Vitest): 72 do painel e das regras via `ng test` e 10 da API/SQLite (`npm run test:server`).

- `core/simulation.spec.ts`: simular não altera o estado original; desativar nunca aumenta disponibilidade nem cobertura; realocar tira efetivo da origem e soma no destino; antecipar manutenção nunca piora a saúde; diferenças ordenadas; recomendações ordenadas por ganho, determinísticas e a primeira realmente melhora os indicadores; cobertura (um equipamento isolado cobre só as células dentro do raio, desativá-lo reduz a cobertura, dois sobrepostos não perdem cobertura quando um cai, agente fora de turno não cobre).
- `core/maintenance-route.spec.ts`: imediatas antes das de menor criticidade, sem paradas repetidas, distância total = soma dos trechos, lista vazia sem erro, filtros e furtados fora.
- `core/bulletin.spec.ts`: o boletim cita os números corretos, muda quando o estado muda e, sem alertas, diz "tudo sob controle".
- `core/scenarios.spec.ts`: cada cenário altera o estado sem mutar a entrada e é reproduzível; reverter devolve exatamente o estado anterior e preserva itens criados depois.
- `server/api.spec.ts`: banco criado e populado na primeira execução e não repopulado depois; criar, consultar, editar e desativar equipamento e agente persistem entre reinícios; validação das propriedades por tipo; `sync` com histórico e alertas; cenário persistido e revertido; simulação não grava e aplicar grava e audita; reset restaura o estado inicial; toda rota da API está documentada no OpenAPI e o Swagger UI responde.
- `city-map.spec.ts`: telemetria anda sempre sobre as vias do bairro; o clique numa via encaixa o ponto no eixo da via certa, com bairro e CEP do bairro, traz o KM em rodovia e não devolve nada fora da cidade.
- `city-state.service.spec.ts`, `prediction.service.spec.ts`, `marker-sync.spec.ts`: KPIs, filtros, alertas, previsões da Parte 3 e mapa incremental (testes anteriores, mantidos).

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

A aplicação **não chama nenhuma IA em tempo de execução** e não precisa de chave de API: previsões, recomendações e o boletim são regras e templates explicáveis, com as fórmulas descritas neste README. Em caso de dúvidas, veja [Preciso de chave de API?](#preciso-de-chave-de-api-não).
