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
npm run gerar-manuais   # reindexa manuais/*.md (já roda sozinho antes de start, build e test)
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
7. **Resolve ocorrências do começo ao fim**: transforma um alerta em ocorrência, deixa a PROMETHEUS investigar (padrões, impacto e o que dizem os manuais), despacha o agente mais próximo, encerra e recebe um relatório pronto para arquivar.

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
| **Fluxo de ocorrência** (alerta → investigação → despacho → encerramento → relatório) | A Parte 3 pede que a previsão vire *"algo realmente útil"* e que fique claro *"como essa previsão pode ajudar na tomada de decisão"*. Um alerta sozinho para no "furto detectado" | A PROMETHEUS cruza o alerta com o histórico, encontra padrões (lote, vizinhança, energia), mede o impacto, cita o manual que sustenta a decisão, sugere o agente mais próximo com o custo de tirá-lo do posto e fecha com um relatório que compara a cidade na abertura e agora. Percebeu, investigou, decidiu, resolveu e documentou ([detalhes](#ocorrências-do-alerta-ao-relatório)) |
| **Manuais + regras, sem IA generativa** | O desafio valoriza *"explicabilidade"* e avisa que *"a tecnologia escolhida não será o mais importante"*. Uma recomendação operacional precisa dizer de onde veio | Busca por palavras-chave (BM25) em manuais e uma tabela de regras declarativa: cada decisão cita arquivo e seção, declara confiança e limitações, e dá sempre a mesma resposta para o mesmo caso. Sem chave de API, sem rede e sem alucinação |
| **Missão guiada de 3 passos** | Experiência de uso é critério de avaliação, e a comissão vai testar *"tanta coisa"* | Em três passos, quem nunca viu o sistema descobre onde está cada parte. Quem já conhece pula direto para o modo livre |
| **Modo offline** | Se a API não subir (ou num deploy estático), o painel não pode virar uma tela branca | Tudo funciona no navegador com as mesmas funções puras, só sem banco, histórico e auditoria |
| **157 testes automatizados** | Qualidade técnica e *"demonstrar entendimento daquilo que a IA construiu"* | As regras (simulação, cobertura, rota, boletim, cenários, ocorrências, manuais, comprovante), a API e a persistência são verificadas a cada `npm test`. As fórmulas não dependem de confiança, dependem de teste |

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

> **Segundo caso de uso, de ponta a ponta:** onda de furtos → ocorrência → investigação → despacho → encerramento → relatório. Está em [Ocorrências](#caso-de-uso-onda-de-furtos-do-alerta-ao-relatório).

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
- **Esquema** (`server/db.ts`): `equipamentos` (campos comuns em colunas + `propriedades` JSON validada por `json_valid` e pelo schema do tipo na API), `agentes`, `eventos_situacao` (histórico de telemetria/mudanças de situação), `alertas` (abertos/encerrados conforme o estado), `auditoria` (quem, quando, antes → depois), `cenarios_aplicados` (snapshot para reverter), `ocorrencias` (status, snapshot da abertura, dossiê, despacho e encerramento, todos em JSON validado por `json_valid`) e `estado_cidade`. Índices em tipo, situação, bairro e, nas ocorrências, em status e equipamento.
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
| `POST /api/ocorrencias`, `GET /api/ocorrencias?status=`, `GET /api/ocorrencias/:id` | abre (idempotente), lista e consulta ocorrências |
| `GET /api/ocorrencias/:id/dossie` | investiga: grava o dossiê e passa para "investigada" |
| `GET /api/ocorrencias/:id/despacho`, `POST /api/ocorrencias/:id/despachar` | sugere os agentes mais próximos (sem gravar) / despacha |
| `POST /api/ocorrencias/:id/encerrar`, `GET /api/ocorrencias/:id/relatorio?formato=md` | encerra / relatório pós-ocorrência em Markdown |
| `GET /api/manuais/busca?q=&tipo=&fabricante=` | busca nos manuais fictícios |
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
manuais/                        # Manuais FICTÍCIOS em Markdown (um por tipo + 3 transversais)
scripts/gerar-manuais.mjs       # manuais/*.md → src/app/data/manuais.json (versionado, embutido no painel e na API)
src/app/
├── core/                       # Regras puras (sem Angular, sem banco), usadas pelo painel e pela API
│   ├── state.ts                # CityState: o estado que as funções recebem
│   ├── indicators.ts           # calcularIndicadores, calcularAlertas, calcularRegioes
│   ├── analysis.ts             # calcularSaudePorRegiao, calcularRisco, collapseStats (Parte 3)
│   ├── coverage.ts, coverage-config.ts   # calcularCobertura e raios por tipo
│   ├── simulation.ts           # simular, aplicarAcao
│   ├── recommendations.ts      # recomendarAcoes
│   ├── maintenance-route.ts    # gerarRotaManutencao
│   ├── occurrences.ts          # abrirOcorrencia (idempotente), montarSnapshot
│   ├── manuals.ts              # recuperarTrechos (BM25), decidirComManual (regras)
│   ├── investigation.ts        # investigarOcorrencia: dossiê com padrões, impacto e hipótese
│   ├── batch.ts                # analisarLotes (usado pela previsão de lote e pela investigação)
│   ├── dispatch.ts             # sugerirDespacho, despachar, devolverAgente
│   ├── closure.ts              # encerrarOcorrencia, gerarRelatorio
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

## Ocorrências: do alerta ao relatório

Um alerta diz *"furto detectado"*. A ocorrência responde ao resto: **por quê, quanto custa, o que fazer, quem vai e como terminou**. Aba **Ocorrências** no painel lateral da Central.

```
alerta ──▶ abrir ──▶ investigar ──▶ despachar ──▶ encerrar ──▶ relatório
          (aberta)   (investigada)  (despachada)  (encerrada)
```

Cada passo grava uma entrada na auditoria (quem, quando, antes → depois), e é dela que sai a linha do tempo do relatório. Tudo é calculado por **funções puras** em `src/app/core/`; a API e o painel offline chamam as mesmas.

### Caso de uso: onda de furtos, do alerta ao relatório

Partindo de `npm run reset` e `npm start`. Os valores são os da seed padrão (horários e datas variam).

| # | Passo | Resultado esperado |
| --- | --- | --- |
| 1 | **Simular Cenários → Onda de Furto e Vandalismo** | Faixa vermelha; 2 câmeras e 1 totem furtados no Entroncamento |
| 2 | Aba **Alertas** → **Abrir ocorrência** no alerta de `CAM-902-0030` | Aviso "OC-0001 aberta: furto"; a aba **Ocorrências** abre com ela (status **Aberta**). Clicar de novo não duplica: "OC-0001 já estava aberta" |
| 3 | **Investigar** | Status **Investigada**. Dossiê: padrão **Ocorrências na vizinhança** com `CAM-902-0031` e `TOT-902-0033` (a menos de 1 km, nas últimas 24 h), destacados com halo laranja no mapa; impacto "5 pontos cegos a mais; saúde de Entroncamento 33 → 24"; hipótese **Ação coordenada de furto** (confiança alta); recomendação **acionar GM e PM para ronda e registrar boletim de ocorrência**, citando `procedimento-furto.md › Furtos em série no mesmo bairro` |
| 4 | **Sugerir agentes mais próximos** | Perfil "guarda municipal e polícia militar". 1º: **Larissa Correia** (GM), 0,71 km, ~2 min, "já está no bairro do local". Os seguintes mostram o custo colateral (ex.: "Cidade Universitária fica com 1 de 3 agentes no pico; risco 72 → 83") e linhas amarelas no mapa |
| 5 | **Simular** na 1ª sugestão | ANTES × DEPOIS no simulador, sem gravar; botão "Voltar à ocorrência para despachar" |
| 6 | **Despachar** (confirmar) | Status **Despachada**; a agente vai até a câmera ("em atendimento"); linha laranja origem → local |
| 7 | **Encerrar** como "Equipamento reposto" | Status **Encerrada**; câmera **Furtado → Operacional**; a agente volta exatamente à posição de origem |
| 8 | **Relatório** | Resumo, linha do tempo com `ABRIR_OCORRENCIA` → `INVESTIGAR_OCORRENCIA` → `DESPACHAR_AGENTE` → `ENCERRAR_OCORRENCIA`, impacto (ex.: saúde do Entroncamento 27 → 33, disponibilidade 69,2% → 71,2%, +2 p.p.), ações, padrões e fontes. **Copiar**, **Exportar .md** ou **Imprimir / PDF** |

Pela API: `POST /api/ocorrencias` → `GET /api/ocorrencias/{id}/dossie` → `GET /api/ocorrencias/{id}/despacho` → `POST /api/ocorrencias/{id}/despachar` → `POST /api/ocorrencias/{id}/encerrar` → `GET /api/ocorrencias/{id}/relatorio?formato=md`, todas no Swagger.

Os outros cenários mostram os outros padrões: **Degradação (Zona Norte)** → falha num radar dispara **LOTE** e a decisão "troca em lote do modelo"; **Falha de energia (Entroncamento)** → **POSSÍVEL_ENERGIA** e a decisão "acionar a concessionária", em vez de trocar peças.

### Abertura

- **Chave estável:** `equipamentoId + tipoAlerta`. O tipo vem da situação: furtado → `furto`, mau funcionamento → `falha`, manutenção imediata ou vencida → `manutencao`. Já havendo uma ocorrência **não encerrada** com a mesma chave, abrir devolve a existente (HTTP 200 em vez de 201).
- **Snapshot da abertura** (`montarSnapshot`): indicadores gerais, saúde e risco do bairro e cobertura (cidade e bairro), com as mesmas funções da Central. É o "antes" do relatório.

### Investigação: as regras dos padrões

| Padrão | Dispara quando | Evidência mostrada |
| --- | --- | --- |
| **LOTE** | Há outras unidades do mesmo fabricante + modelo em falha (mau funcionamento, em manutenção ou manutenção imediata). Não vale para furto. Usa a mesma análise da previsão de falha em lote (`core/batch.ts`) | Unidades do modelo em falha × total, taxa do lote × taxa da frota, números de série |
| **VIZINHANÇA** | Furtos ou falhas de outros equipamentos (eventos de situação, exceto a carga inicial) ou outras ocorrências abertas a até **1 km** (haversine) nas últimas **24 h** | Número de série, tipo, horário e distância de cada um |
| **POSSÍVEL_ENERGIA** | Pelo menos **3** equipamentos fixos do mesmo bairro caem numa janela de **30 min** **e** são pelo menos **75%** dos fixos que operavam no bairro | Fração dos fixos que caíram e horário de cada queda |

O limite de 75% separa um apagão (cai quase tudo: 3 de 3 no Entroncamento) de uma degradação (cai uma parte: 3 de 6 em Jardim Aurora). Sem ele, a degradação virava "queda de energia".

- **Impacto:** o simulador compara o equipamento **operando × fora de operação** (pontos cegos novos, saúde e risco do bairro). É estimativa e está declarado como tal.
- **Hipótese** (por ordem): furto com vizinhança → "ação coordenada de furto"; furto sem → "furto isolado"; energia → "queda de energia, não defeito do equipamento"; lote → "defeito de lote"; senão, "falha isolada". Limitações aparecem quando há menos de 3 mudanças de situação registradas ("base de histórico curta") ou quando o momento da detecção é desconhecido.

### Manuais e decisão por regras (sem IA generativa)

Os manuais em [`manuais/`](manuais/) são **fictícios**, escritos para a demonstração: um por tipo de equipamento (viatura e moto juntas) e três transversais (furto, falha em lote, queda de energia). Cada seção `##` é um trecho com tipo, fabricante (opcional) e tópicos; `npm run gerar-manuais` gera `src/app/data/manuais.json` (41 trechos), versionado e embutido no painel e na API.

**Busca** (`recuperarTrechos`): BM25 (k1 = 1,2, b = 0,75) sobre seção + tópicos + texto, com minúsculas, sem acentos, sem stopwords e plural simples reduzido ("furtos" → "furto"). Bônus de +1 quando o tipo coincide e +1,5 quando o fabricante coincide (só para trechos que já casaram com a consulta). Empate desfeito pelo id; nada casou, lista vazia.

**Decisão** (`decidirComManual`): a primeira regra da tabela que casa decide, e as fontes são os trechos recuperados sobre o tópico da regra, preferindo o manual do próprio tipo e os transversais.

| Regra | Quando | Decisão | Tópico que a sustenta |
| --- | --- | --- | --- |
| `EQUIPAMENTO_DESATIVADO` | equipamento desativado | Planejar a reposição | substituição |
| `FURTO_REINCIDENTE` | furto + padrão de vizinhança | Acionar GM e PM para ronda e registrar BO | reincidência |
| `FURTO_ISOLADO` | furto | BO, bloquear o equipamento e solicitar reposição | furto |
| `QUEDA_DE_ENERGIA` | falha + padrão de energia | Acionar a concessionária; agentes nos pontos sem fiscalização | energia |
| `FALHA_EM_LOTE` | falha + outras unidades do modelo em falha | OS de troca em lote e preventiva antecipada | lote |
| `FALHA_ISOLADA` | falha | OS corretiva imediata | falha |
| `MANUTENCAO` | demais casos | Executar a preventiva pendente | manutenção preventiva |

Cada decisão traz justificativa com a evidência, as fontes (arquivo › seção), confiança e limitações. Se nenhum trecho sustenta a decisão, a confiança cai para **baixa** e isso é dito.

### Despacho: perfil, ETA e ranking

- **Perfil:** furto → guarda municipal e polícia militar; falha e manutenção → agente de trânsito (sinalizar o local). Sem ninguém do perfil livre, qualquer agente em serviço.
- **Candidatos:** agentes livres (em serviço ou de folga); quem já está em atendimento fica de fora.
- **ETA (estimativa):** `ETA (min) = ⌈ distância haversine (km) ÷ velocidade (km/h) × 60 + penalidade ⌉`, com velocidade padrão de **30 km/h** em linha reta e **+15 min** para quem está de folga ("convocar"). O trajeto real pelas vias é mais longo, e a tela diz isso.
- **Ranking:** ETA crescente; empate pela distância e depois pelo id. Top 3.
- **Custo colateral:** `simular` com a ação `DESPACHAR_AGENTE` mede efetivo, risco e cobertura do bairro de origem depois da saída. De folga não desfalca ninguém; no mesmo bairro do local, o efetivo do bairro não muda.
- **Despachar** move o agente até o equipamento (situação "em atendimento") e guarda a posição, o bairro e a situação de origem; **encerrar** devolve o agente exatamente para lá. `DESPACHAR_AGENTE` pode ser simulada em `/api/simulacao`, mas só é aplicada pela ocorrência.

### Encerramento e relatório

- **Resoluções:** reposto e consertado devolvem o equipamento a "Operacional" com novo ciclo de preventiva (90 dias); falso alarme devolve a "Operacional" só limpando a pendência; outro mantém a situação. Encerrar duas vezes dá **409**.
- **Relatório** (`gerarRelatorio`, Markdown no tom da PROMETHEUS, determinístico): resumo; linha do tempo da auditoria; tabela de impacto **na abertura × agora** (disponibilidade, saúde, risco e cobertura do bairro, cobertura e pontos cegos da cidade, com variação em pontos percentuais); ações executadas; padrões, prevenção sugerida e fontes dos manuais. Ocorrência sem investigação ou sem despacho também gera relatório, dizendo que a etapa não ocorreu.

### Comprovante de ocorrência

Um "cupom de papel" emitido quando a ocorrência é **encerrada**: número, selo ENCERRADA, equipamento, local, horários, duração, quem atendeu, resolução, a cidade **na abertura → agora** e uma frase da PROMETHEUS.

- **Como emitir:** encerre uma ocorrência na aba **Ocorrências** e o comprovante abre sozinho (a voz da PROMETHEUS diz "Comprovante emitido.", se o navegador falar). Depois, em qualquer ocorrência encerrada, use **Emitir comprovante**.
- **Imprimir ou salvar PDF:** `window.print()`. Antes de imprimir, o modal copia o cupom para um contêiner filho direto do `body` e o CSS de impressão esconde todo o resto com `display: none`: sai **uma página**, só com o cupom, papel creme preservado (`print-color-adjust: exact`, mesmo com "gráficos de fundo" desligado), recortes brancos e margem de 10 mm. **Copiar texto** copia a versão em texto puro (até 42 colunas).
- **QR Code para o celular:** **Abrir no celular** troca o cupom por um QR grande. A câmera abre a página do comprovante, com **Salvar PDF** e **Baixar texto (.txt)**. O link depende de onde o painel está aberto:
  - **Publicado (ex.: `https://fogo-chi.vercel.app`) ou aberto por um IP:** o **comprovante vai dentro do link** (`/comprovante#c1z.…`, valores comprimidos com `CompressionStream` e em base64url). A página `/comprovante` lê os dados do próprio link, sem servidor: funciona no deploy estático e em qualquer rede, inclusive 4G. O trecho depois do `#` não é enviado ao servidor.
  - **Em `localhost` com a API:** link para a página servida pela API no **IP da rede local** (`localhost` não funcionaria no celular); o celular precisa estar no mesmo Wi-Fi.
  - **Em `localhost` sem API:** não há endereço que o celular alcance, e o botão fica desabilitado.
- **QR sem dependências:** codificador próprio em `core/qrcode.ts` (modo byte, correção L ou M, versões 1 a 40). O link com o comprovante tem uns 450 caracteres e vira um QR de versão ~14, mostrado a 280 px para a câmera ler com folga.
- **Rotas:** `GET /api/ocorrencias/:id/comprovante` (dados; 200, 404 se não existe, 409 se ainda não foi encerrada), `GET /api/ocorrencias/:id/comprovante/link` (link para o QR) e `GET /api/comprovantes/:id` (página HTML para o celular; `?formato=txt` baixa o texto). No modo offline, o painel chama a mesma função localmente.
- **Função pura:** `montarComprovante(ocorrencia, estadoAtual, agora, { fusoHorario })` em `core/comprovante.ts`. "Antes" vem do `snapshotAbertura`; "agora" é recalculado do estado atual com `calcularIndicadores`, `calcularSaudePorRegiao` e `calcularRisco` (via `montarSnapshot`). **Detectado** = momento da detecção registrado no dossiê, ou a abertura quando não há registro; **Duração** = encerramento − detecção; **Atendido por** = agente do despacho ("Sem agente despachado" quando não houve). A frase usa 3 templates por resolução, escolhidos pelo número do id, e só cita a duração e a variação real da saúde do bairro (positiva, zero ou negativa).
- **Mesmo visual nos dois lugares:** o CSS do cupom (`TICKET_CSS`) e a marcação HTML ficam em `core/comprovante-html.ts`, usados pelo componente Angular e pela página do celular. O rodapé diz que o documento é interno e que os valores são estimados por regras.

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

`npm test` roda **157 testes** (Vitest): 133 do painel e das regras via `ng test` e 24 da API, do SQLite e do gerador de manuais (`npm run test:server`).

- `core/simulation.spec.ts`: simular não altera o estado original; desativar nunca aumenta disponibilidade nem cobertura; realocar tira efetivo da origem e soma no destino; antecipar manutenção nunca piora a saúde; diferenças ordenadas; recomendações ordenadas por ganho, determinísticas e a primeira realmente melhora os indicadores; cobertura (um equipamento isolado cobre só as células dentro do raio, desativá-lo reduz a cobertura, dois sobrepostos não perdem cobertura quando um cai, agente fora de turno não cobre).
- `core/maintenance-route.spec.ts`: imediatas antes das de menor criticidade, sem paradas repetidas, distância total = soma dos trechos, lista vazia sem erro, filtros e furtados fora.
- `core/bulletin.spec.ts`: o boletim cita os números corretos, muda quando o estado muda e, sem alertas, diz "tudo sob controle".
- `core/scenarios.spec.ts`: cada cenário altera o estado sem mutar a entrada e é reproduzível; reverter devolve exatamente o estado anterior e preserva itens criados depois.
- `server/api.spec.ts`: banco criado e populado na primeira execução e não repopulado depois; criar, consultar, editar e desativar equipamento e agente persistem entre reinícios; validação das propriedades por tipo; `sync` com histórico e alertas; cenário persistido e revertido; simulação não grava e aplicar grava e audita; reset restaura o estado inicial; toda rota da API está documentada no OpenAPI e o Swagger UI responde; ocorrências (abrir idempotente com 201/200, 400, 404, persistência, dossiê, despacho, encerramento com 409 na segunda vez, relatório com a linha do tempo em ordem, comprovante 409/200/404, link para o celular, página HTML e `.txt`).
- `core/occurrences.spec.ts`: tipo de alerta pela situação; abrir é idempotente por equipamento + tipo e não muta a entrada; snapshot com os mesmos números dos indicadores.
- `core/manuals.spec.ts`: a busca acha o manual do tipo certo, o bônus de fabricante leva o trecho específico ao topo, resultado determinístico e lista vazia sem erro; cada uma das 7 regras decide e cita fonte; sem trecho, confiança baixa.
- `core/investigation.spec.ts`: cada padrão dispara no cenário certo (furtos → vizinhança, degradação → lote, apagão → energia) e não dispara no oposto; o dossiê não altera o estado, é determinístico e funciona sem histórico.
- `core/dispatch.spec.ts`: perfil por tipo de alerta, ordenação por ETA, convocação com penalidade, simular não grava e despachar sim, retorno exato à origem, lista vazia sem agentes livres, fallback para qualquer agente em serviço.
- `core/closure.spec.ts`: encerramento por resolução, recusa do segundo encerramento, relatório com os números da abertura e de agora, linha do tempo ordenada, relatório sem investigação/despacho e texto determinístico.
- `core/comprovante.spec.ts`: cita os números do snapshot e do estado atual, determinístico e sem mutar a entrada, "Detectado" pelo evento do dossiê, formatos de duração, frase da PROMETHEUS diferente por resolução e com a duração, erro tipado para ocorrência aberta, `textoPlano` com todos os campos em até 42 colunas.
- `core/qrcode.spec.ts`: versão mínima que cabe (até a 40, níveis L e M), localizadores, sincronismo, módulo escuro, informação de versão, determinismo e caminho SVG. A leitura em si foi conferida com o decodificador ZXing (versões 1 a 40, L e M, todas as máscaras, com acentos) e no QR lido de screenshots do app.
- `core/comprovante-link.spec.ts`: o link leva o comprovante e a página o reconstrói igual (com e sem `CompressionStream`), cabe num QR legível e link adulterado é recusado.
- `components/comprovante/comprovante-modal.component.spec.ts`: renderiza campos, selo e frase; "Copiar texto" copia o `textoPlano`; "Abrir no celular" troca o cupom pelo QR (desabilitado sem link); ESC fecha o modal.
- `server/manuals.spec.ts`: `gerar-manuais` produz JSON válido e igual ao versionado, com manual para todo tipo de equipamento.
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
- **Ocorrências:** uma ocorrência por equipamento + tipo de alerta enquanto não for encerrada; abrir não exige que o alerta ainda esteja ativo. Cada ocorrência aceita um despacho (um segundo daria 409, para não perder a origem do primeiro agente).
- **Manuais são fictícios**, escritos para a demonstração, e a recuperação é por palavras-chave com regras: entende sinônimos só na medida em que os manuais usam as mesmas palavras.
- **Investigação offline** usa as mudanças de situação registradas no próprio navegador (desde que a página foi aberta) e não tem auditoria; o relatório offline monta a linha do tempo com as datas gravadas na ocorrência.
- **Impacto no relatório** compara a cidade inteira na abertura e agora: a variação inclui tudo o que mudou no período, não só a ocorrência (o próprio relatório avisa).
- **Comprovante:** o encerramento não tem campo "atendido por"; o cupom usa o agente despachado. A cidade "agora" é a do momento da emissão, não a do encerramento (reemitir depois pode mudar esses números). Se o equipamento foi excluído, os dados vêm do dossiê.
- **Comprovante no link:** é uma cópia do cupom no momento da emissão; quem tiver o link vê os dados (é um documento interno de demonstração, sem dados pessoais além do nome do agente). A página `/comprovante` é inicializada à parte em `main.ts`, sem a Central.
- **QR Code e rede (em `localhost`):** o link usa o primeiro IPv4 da rede local (192.168.x antes de 10.x e 172.x, que costumam ser adaptadores virtuais). Se o IP escolhido não for o certo, ou se a API estiver atrás de outro endereço, defina `FOGO_URL_PUBLICA` (ex.: `http://192.168.0.10:3000`). No Windows, o firewall pode pedir permissão para o Node aceitar conexões da rede na primeira vez. A página do celular não exige login, como o resto da API.
- **Testes no Windows / Node 26:** o checkout com CRLF fazia o gerador de manuais achar 0 trechos (corrigido: o parser normaliza as quebras de linha). No Node ≥ 25, o `localStorage` nativo do Node encobre o do jsdom e quebra os testes de serviço; rode `NODE_OPTIONS=--no-experimental-webstorage npm test` (no Node 22/24 não é preciso).
- **Desempenho das recomendações** cresce com o número de candidatas; com milhares de equipamentos em falha, só as 12 manutenções mais urgentes são simuladas por completo.

## Uso de IA no desenvolvimento

O código foi desenvolvido com apoio de assistentes de IA: **Claude** (Claude Code) e **Gemini** (Antigravity). Na etapa final (cenários com reversão, banco SQLite e API, simulador, próxima melhor ação, pontos cegos, rota de manutenção e boletim), o Claude Code (modelo Claude Opus 5.5) escreveu o código e os testes a partir de uma especificação detalhada do autor, que revisou as decisões. As pastas `.agents/` e `.gemini/` guardam a especificação usada como contexto pelas IAs e ficam fora do pacote de entrega (`.gitattributes`).

No fluxo de ocorrências, o Claude Code também escreveu, por especificação do autor, os **manuais sintéticos** em `manuais/` (textos fictícios, sem relação com documentação real de fabricantes), as regras de decisão e os testes. O comprovante de ocorrência (função pura, rotas, cupom, modal, QR Code e testes) também foi escrito pelo Claude Code a partir da especificação e do layout de referência do autor.

A aplicação **não chama nenhuma IA em tempo de execução** e não precisa de chave de API: previsões, recomendações, a investigação, a decisão pelos manuais, o boletim, o relatório e o comprovante são regras e templates explicáveis, com as fórmulas descritas neste README. Em caso de dúvidas, veja [Preciso de chave de API?](#preciso-de-chave-de-api-não).
