# F.O.G.O. – Ferramenta Onisciente de Gestão e Operações

> *"Bom dia, gestor. A cidade continua de pé. Por enquanto."* – PROMETHEUS, no primeiro boletim do dia

Solução para a **Etapa Bônus do DSIN Coder Challenge (Protocolo PROMETHEUS)**.

O F.O.G.O. é a central de operações de **Nova Prometeia**, uma cidade fictícia com 6 bairros, radares, câmeras, viaturas e agentes nas ruas. O gestor **cadastra** a frota, **acompanha** a cidade ao vivo, **antecipa** problemas, **testa decisões antes de tomá-las** e **resolve ocorrências** do alerta ao comprovante. A PROMETHEUS, a inteligência da cidade, comenta tudo com alguma ironia e nunca inventa um número.

**Stack:** Angular 21 (standalone + Signals), Tailwind CSS e Leaflet no painel; Node.js com SQLite na API; TypeScript puro nas regras; Vitest nos testes.

**Versão publicada:** [fogo-chi.vercel.app](https://fogo-chi.vercel.app). É um deploy estático, então roda em **modo offline**: os dados ficam no navegador de quem acessa, sem banco nem auditoria.

## Sumário

- [Como rodar](#como-rodar)
- [Navegadores testados](#navegadores-testados)
- [A ideia em uma linha](#a-ideia-em-uma-linha)
- [Funcionalidades e por que cada uma existe](#funcionalidades-e-por-que-cada-uma-existe)
- [Por que regras, e não modelos de IA](#por-que-regras-e-não-modelos-de-ia)
- [Demonstração em 5 minutos](#demonstração-em-5-minutos)
- [Como cada número é calculado](#como-cada-número-é-calculado)
- [Arquitetura, banco e API](#arquitetura-banco-e-api)
- [Agente de voz](#agente-de-voz-prometheus)
- [Testes](#testes)
- [Suposições e limitações](#suposições-e-limitações)
- [Uso de IA no desenvolvimento](#uso-de-ia-no-desenvolvimento)

## Como rodar

**Pré-requisitos:** Node.js ≥ 22.13 (usa o `node:sqlite` nativo) e npm ≥ 10.

```bash
npm install
npm start          # API (porta 3000) + painel em http://localhost:4200
npm run reset      # volta ao cenário inicial (apaga e recria o banco)
npm test           # 159 testes: regras, painel e API
```

| Endereço | O que é |
| --- | --- |
| `http://localhost:4200` | Painel |
| `http://localhost:3000/api/docs` | API documentada e testável pelo navegador (Swagger UI) |

O banco é um arquivo (`data/fogo.db`) criado e populado sozinho na primeira execução: **30 equipamentos de todos os 11 tipos e 14 agentes**, com casos de borda escolhidos para a demonstração. Não há banco nem servidor de mapas para instalar, e **nenhuma chave de API ou variável de ambiente é obrigatória**.

<details>
<summary>Outros comandos, variáveis de ambiente (com exemplos) e o que usa internet</summary>

```bash
npm run serve           # build de produção servido pela própria API em http://localhost:3000
npm run sintetico -- --eventos=5000       # histórico sintético de telemetria
npm run sintetico -- --equipamentos=500   # frota extra no mapa
npm run gerar-manuais   # reindexa manuais/*.md (roda sozinho antes de start, build e test)
```

- **Variáveis de ambiente (todas opcionais):** sem nenhuma delas, o sistema roda com os valores padrão.

  | Variável | Padrão | Lida por | Para que serve |
  | --- | --- | --- | --- |
  | `PORT` | `3000` | API (`server/main.ts`) e `npm run reset` (`server/reset.ts`) | Porta da API. Use com `npm run api` ou `npm run serve`: com `npm start`, o painel de desenvolvimento procura a API sempre na porta 3000 (`proxy.conf.json`) |
  | `FOGO_DB` | `data/fogo.db` | API, `npm run reset` e `npm run sintetico` (`server/db.ts`) | Arquivo do banco SQLite. Caminho relativo à pasta do projeto ou absoluto; o arquivo é criado e populado se não existir |
  | `FOGO_URL_PUBLICA` | IP da máquina na rede local | API (`server/app.ts`, link do QR Code) | Endereço que o celular usa para abrir o comprovante quando o painel está em `localhost`. Útil quando o IP detectado não é o certo (VPN, máquina virtual) |

  Nenhum arquivo `.env` é lido: as variáveis são definidas no terminal, antes do comando.

  ```powershell
  # Windows (PowerShell): valem até o terminal ser fechado
  $env:FOGO_DB = "data/demo.db"
  $env:FOGO_URL_PUBLICA = "http://192.168.0.10:3000"
  npm start

  $env:PORT = "8080"; npm run serve      # painel e API em http://localhost:8080
  ```

  ```bat
  :: Windows (cmd)
  set FOGO_DB=data/demo.db
  npm start
  ```

  ```bash
  # Linux e macOS: valem só para o comando da linha
  FOGO_DB=data/demo.db npm start
  PORT=8080 npm run serve
  FOGO_URL_PUBLICA=http://192.168.0.10:3000 npm start
  ```
- **Internet:** só para as fontes (Google Fonts), o Swagger UI (jsDelivr) e a transcrição do microfone, que é feita pelo próprio navegador (Google no Chrome, Microsoft no Edge). Todo o resto funciona offline.
- **Windows com Node ≥ 25:** o `localStorage` nativo do Node encobre o do ambiente de teste; rode `NODE_OPTIONS=--no-experimental-webstorage npm test`.
- **Pacote de entrega:** `git archive -o fogo.zip HEAD` (sem `node_modules`, `dist`, `.angular`, `.env` e banco).

</details>

## Navegadores testados

> [!IMPORTANT]
> **Recomendado: Chrome** (computador e celular). É o único navegador testado em que todas as funcionalidades funcionam, inclusive o microfone do agente de voz. No **Brave**, o microfone não funciona (veja abaixo).

| Sistema | Navegador | Painel e funcionalidades | Voz falada (boletim e respostas) | Microfone do agente de voz | QR Code pelo link publicado (Vercel) | QR Code pela rede local (`localhost`) |
| --- | --- | :---: | :---: | :---: | :---: | :---: |
| Windows | Chrome | ✅ | ✅ | ✅ | – | – |
| Windows | Brave | ✅ | ✅ | ❌ ¹ | – | – |
| Linux | Chrome | ✅ | ✅ | ✅ | – | – |
| Linux | Brave | ✅ | ✅ | ❌ ¹ | – | – |
| Android | Chrome | – | – | – | ✅ | ❌ ² |
| Android | Brave | – | – | – | ✅ | ⚠️ ³ |

**¹ Microfone no Brave (Windows e Linux):** o Brave oferece a interface de reconhecimento de voz, mas não o serviço que transcreve o áudio. Nos testes, toda tentativa terminou com a mensagem *"O reconhecimento de voz precisa de internet (o navegador transcreve o áudio num serviço online)"*, mesmo com a conexão funcionando. Por isso o sistema identifica o Brave, deixa o microfone desabilitado e explica o motivo no painel de voz. As perguntas podem ser **digitadas**, com a mesma resposta falada.

**² QR Code pela rede local no Chrome do Android:** com o painel aberto em `localhost`, o QR aponta para o IP do computador na rede (ex.: `http://192.168.18.90:3000/…`). O Chrome do Android não abre esse endereço e mostra *"Não é possível acessar esse site"*, porque restringe o acesso a endereços da rede local. Pelo link publicado (`https://fogo-chi.vercel.app`), o mesmo QR abre normalmente.

**³ QR Code pela rede local no Brave do Android:** abre, depois de o Brave pedir permissão para **acessar dispositivos próximos**; basta permitir.

Para demonstrar o QR Code no celular, use a **versão publicada**, que funciona nos dois navegadores e em qualquer rede (inclusive 4G). Além dos testes manuais acima, a impressão em PDF, a página do comprovante no celular e a leitura do QR Code também foram verificadas de forma automatizada no **Microsoft Edge** (modo headless, Windows), com o QR lido por um decodificador independente (ZXing).

## A ideia em uma linha

O desafio faz quatro perguntas à PROMETHEUS, e o sistema foi organizado para responder a cada uma:

```
 PERCEBER ──────▶ ANTECIPAR ──────▶ DECIDIR ──────▶ RESOLVER
"o que está      "o que vai         "o que eu faço  "foi feito,
 acontecendo?"    acontecer?"        e quanto       e está
                                     custa?"         registrado?"
```

Toda funcionalidade é um elo dessa corrente: cada uma ajuda o gestor a perceber, antecipar, decidir ou resolver.

## Funcionalidades e por que cada uma existe

O sistema tem mais funcionalidades do que o mínimo pedido, e isso é deliberado: o enunciado pede uma inteligência que *"perceba"*, *"antecipe"* e *"apoie a tomada de decisão"*. Cada uma dessas palavras exige uma ferramenta diferente.

Elas também **não são ilhas**. Todas usam o mesmo núcleo de regras (`src/app/core/`): o índice de risco do bairro é a mesma função na Central, na Cidade Preditiva, no simulador, no despacho e no comprovante. O simulador "e se…?" é reaproveitado pelas recomendações, pela rota de manutenção, pelo custo colateral do despacho e pelo impacto da investigação. Por isso cada funcionalidade nova custou pouco código e nenhum número diverge de uma tela para outra.

### 1. O que o desafio pede

| Parte | Requisito | Onde está |
| --- | --- | --- |
| 1 – Inventário | Equipamentos com identificação, localização (CEP, rua, bairro, referência, GPS), situação e manutenção | **Inventário** |
| 1 – Inventário | Propriedades específicas por tipo (a câmera tem visão noturna, o radar tem limite de velocidade) | Formulário que muda conforme o tipo |
| 1 – Inventário | Agentes (matrícula, função, órgão, situação, posição) | **Inventário → Agentes** |
| 2 – Central | Mapa com ícone por tipo e cor por situação, detalhes ao clicar | **Central de Operações** |
| 2 – Central | KPIs, filtros (tipo, situação, bairro, órgão), alertas críticos, manutenção imediata e vencendo | Central: KPIs, filtros e aba **Alertas** |
| 2 – Central | Visão consolidada por região | Bairros pintados no mapa (Normal, Atenção, Crítico) |
| 3 – Preditiva | Previsões respondendo *o que é previsto*, *com base em quê* e *qual decisão tomar* | **Cidade Preditiva** (3 previsões, com botão para aplicar) |

### 2. Perceber: o que está acontecendo agora?

| Funcionalidade | Por que é necessária |
| --- | --- |
| **Telemetria em tempo real (simulada)** | A Parte 2 diz que a PROMETHEUS *"passará a receber continuamente informações"*. Sem sensores reais, era preciso simular o fluxo para mostrar o painel reagindo sozinho: falhas, recuperações, veículos andando pelas ruas. |
| **Pontos cegos de cobertura** | Contar equipamentos quebrados não diz *onde a cidade ficou sem olhos*. Uma câmera que é a única de uma avenida importa mais que uma no meio de três radares. A grade de cobertura mede isso e entra no risco do bairro. |
| **Boletim da PROMETHEUS** | Um gestor numa sala de controle não lê oito cards. O boletim resume em um parágrafo o que exige atenção e qual a próxima melhor ação, sempre com os números reais. |
| **Agente de voz** | Para quem está com as mãos ocupadas: "como está o Entroncamento?", "aplicar recomendação". Também anuncia em voz alta as falhas da telemetria. |

### 3. Antecipar: o que vai acontecer?

| Funcionalidade | Por que é necessária |
| --- | --- |
| **Cidade Preditiva** (colapso viário, falha em lote, falta de efetivo) | É a Parte 3. Cada previsão mostra as variáveis que a geraram e uma recomendação que pode ser aplicada com um clique: a previsão vira ação. |
| **Cenários de crise reversíveis** (apagão, onda de furtos, degradação, véspera de pico) | Antecipar exige treinar. Os cenários provocam a crise em segundos, sem estragar os dados, e depois revertem só o que mudaram. Também são a forma mais rápida de quem avalia ver o sistema reagir. |

### 4. Decidir: o que eu faço, e quanto custa?

| Funcionalidade | Por que é necessária |
| --- | --- |
| **Simulador "e se…?" + próxima melhor ação** | A Parte 3 pede *"recomendações para apoiar a tomada de decisão"*. O gestor vê o **antes × depois** de uma decisão **antes** de tomá-la, e o sistema ranqueia as 3 ações de maior ganho, com justificativa e confiança. Simular nunca grava nada. |
| **Rota de manutenção** | Destacar 10 alertas não diz à equipe técnica por onde começar. A rota ordena as paradas (críticas primeiro, depois as mais próximas), desenha no mapa o percurso **pelas ruas** e cada parada concluída atualiza a cidade inteira. |

### 5. Resolver: foi feito e está registrado?

Um alerta diz *"furto detectado"*. A **ocorrência** responde ao resto: por quê, quanto custa, o que fazer, quem vai e como terminou.

```
alerta ──▶ abrir ──▶ investigar ──▶ despachar ──▶ encerrar ──▶ relatório + comprovante
```

| Etapa | Por que é necessária |
| --- | --- |
| **Investigação automática** | Cruza o alerta com o histórico e encontra padrões que mudam a decisão: furtos em série na vizinhança pedem ronda policial, não só reposição; várias falhas do mesmo modelo pedem troca em lote; tudo caindo junto num bairro é queda de energia, não defeito. |
| **Manuais + regras** | Uma recomendação operacional precisa dizer **de onde veio**. Cada decisão cita o manual e a seção que a sustentam (manuais fictícios, escritos para a demonstração). |
| **Despacho do agente mais próximo** | Sugere quem chega primeiro (ETA estimado) e mostra o **custo colateral**: "tirar este agente deixa o bairro de origem com risco ALTO". Ao encerrar, o agente volta à posição de origem. |
| **Relatório pós-ocorrência** | Fecha o ciclo com linha do tempo da auditoria e a cidade **na abertura × agora**. É o documento para arquivar. |
| **Comprovante com QR Code** | O relatório serve ao arquivo; o comprovante serve a quem está na rua. É o registro de uma página que o agente leva ao sair do local: prova de atendimento, documento para o boletim de ocorrência ou para a garantia do fabricante e resumo para a passagem de turno. O QR Code entrega esse registro ao celular sem login, aplicativo ou cadastro. |

### 6. A base que sustenta tudo

| Funcionalidade | Por que é necessária |
| --- | --- |
| **API + SQLite com histórico e auditoria** | A Parte 3 fala em *"dados históricos"*: um painel que esquece tudo ao recarregar não tem histórico. Cada mudança vira evento, e cada decisão tem autor e rastro (quem, quando, antes → depois). |
| **Swagger em `/api/docs`** | O FAQ aceita *"apenas uma API"* como entrega. Quem avalia testa tudo pelo navegador, sem Postman. |
| **Cadastro clicando no mapa** | A Parte 1 pede coordenadas GPS, e digitar latitude à mão é o jeito mais fácil de errar. Clicar numa rua preenche via, bairro, CEP e coordenadas encaixadas no eixo da via. |
| **Modo offline** | Se a API não subir (ou no deploy estático), o painel não vira uma tela branca: as mesmas regras rodam no navegador. |
| **Desempenho com frota grande** | Uma cidade real tem milhares de dispositivos. O mapa atualiza só o que mudou e agrupa marcadores: com 2.000 equipamentos, cada ciclo de telemetria leva cerca de 39 ms de script, contra 216 ms de um redesenho completo. |
| **Missão guiada de 3 passos** | Há muita coisa para descobrir; em três passos, quem nunca viu o sistema encontra cada parte. Quem já conhece pula. |
| **159 testes automatizados** | O desafio pede para *"demonstrar entendimento daquilo que a IA construiu"*. As fórmulas não dependem de confiança: dependem de teste. |

## Por que regras, e não modelos de IA

A PROMETHEUS é apresentada como a inteligência da cidade, mas nenhuma das suas decisões passa por um modelo de linguagem ou por um modelo treinado. Trata-se de uma decisão de projeto: numa central de operações, uma recomendação vale tanto pelo acerto quanto pela possibilidade de entender por que ela foi feita.

**Confiança vem de explicação.** O gestor que remaneja uma viatura ou aciona a concessionária responde por essa decisão. Por isso, cada indicador sai de uma fórmula documentada, cada recomendação mostra os dados que a motivaram e a fonte que a sustenta, e o mesmo estado da cidade produz sempre a mesma resposta. Um modelo generativo redige bem, mas pode variar entre duas execuções e não mostra de onde veio cada número, um risco difícil de aceitar no meio de uma crise.

**Um modelo é tão bom quanto os dados que o treinaram.** Não há histórico real de falhas, furtos ou deslocamentos disponível; os dados do projeto são sintéticos. Um modelo treinado sobre eles apenas reproduziria, de forma mais cara e menos transparente, as regras usadas para gerá-los. Heurísticas explícitas são o ponto de partida mais honesto: ficam visíveis, testáveis e fáceis de calibrar quando houver dados de verdade.

**O tamanho do problema define a ferramenta.** A base de conhecimento consultada na investigação é pequena, e a busca por relevância de termos (BM25) encontra o trecho certo sem embeddings, banco vetorial ou serviço externo. A estrutura, ainda assim, separa a recuperação do trecho da decisão tomada com base nele, e a fonte é sempre citada; uma etapa generativa pode ser acrescentada no futuro sem reescrever o restante.

**Simplicidade operacional também é requisito.** Sem chave de API, custo por chamada, GPU ou dependência de rede, o sistema roda da mesma forma em qualquer máquina, inclusive offline, e os dados da cidade não saem do ambiente em que estão.

O próprio desafio lembra que a avaliação *"não será sobre quem usou mais tecnologia, mais IA ou mais linhas de código"*. Aqui, a inteligência está em cruzar dados, antecipar riscos e transformar isso numa decisão que o gestor consegue verificar.

**Evolução com dados reais:** modelos de previsão de falha por equipamento a partir do histórico de manutenção, calibração dos pesos de risco com as ocorrências registradas e, se fizer sentido, um modelo de linguagem executado localmente apenas para redigir relatórios a partir dos números já calculados, com a decisão mantida nas regras.

## Demonstração em 5 minutos

Partindo de um banco limpo: `npm run reset` e depois `npm start`. Os números abaixo valem para a seed padrão (horários variam).

| # | Faça | O que aparece |
| --- | --- | --- |
| 1 | Abra `http://localhost:4200` e clique em **Pular Calibração / Modo Livre** | Cabeçalho **Banco conectado**; disponibilidade **67,9%**; 11 alertas; Orla do Rio e Entroncamento com risco **ALTO** |
| 2 | Leia o **Boletim da PROMETHEUS** (abaixo dos KPIs) e clique em **Ouvir** | Resumo do que exige atenção, lido em voz alta |
| 3 | **Simular Cenários → Falha de Energia (Entroncamento)** | Faixa vermelha de cenário ativo; disponibilidade **67,9% → 57,1%**; saúde do Entroncamento **53 → 10**; alertas críticos **5 → 8** |
| 4 | Aba **Simulador · ações** → **Simular esta** na 1ª sugestão | 1ª sugestão: **rota de manutenção com 6 paradas críticas (~7,2 km, ~137 min)**. Antes × depois na tela; **nada é gravado** |
| 5 | Aba **Rota de manutenção → Gerar rota** e **Concluir** uma parada | O percurso aparece no mapa **pelas ruas**, da base às paradas numeradas; disponibilidade, saúde e boletim melhoram na hora |
| 6 | **Cidade Preditiva** | Cada previsão mostra o que prevê, os dados usados e **Aplicar recomendação** |
| 7 | Volte à Central, **Reverter cenário** e aplique **Onda de Furto e Vandalismo** | Câmeras `CAM-902-0017` e `CAM-902-0018` furtadas no Entroncamento |
| 8 | Aba **Alertas → Abrir ocorrência** no furto de `CAM-902-0017` → **Investigar** | Padrão **ocorrências na vizinhança** (a outra câmera); hipótese **ação coordenada de furto**; decisão **acionar Guarda e PM**, citando `procedimento-furto.md` |
| 9 | **Sugerir agentes mais próximos → Despachar** o 1º | **Bruno Vasconcelos** (Guarda Municipal), 0,91 km, ~2 min, com o custo colateral de tirá-lo do Centro Histórico |
| 10 | **Encerrar ocorrência** como "Equipamento reposto" | Câmera volta a **Operacional**, o agente volta à origem e o **comprovante** sai da "impressora" |
| 11 | **Abrir no celular** e aponte a câmera para o QR; depois **Imprimir ou salvar PDF** | O cupom abre no celular; o PDF sai com uma página, só com o cupom |

<details>
<summary>O mesmo roteiro pela API (Swagger)</summary>

Em `http://localhost:3000/api/docs`, com **Try it out**:

| # | Chamada | Resultado esperado |
| --- | --- | --- |
| 1 | `POST /api/reset` | Estado inicial: 30 equipamentos, 14 agentes |
| 2 | `GET /api/analise` | Disponibilidade 67,9; Entroncamento com `health: 53` |
| 3 | `POST /api/cenarios/power_outage` | `label: "Falha de energia em Entroncamento"` |
| 4 | `GET /api/analise` | Disponibilidade 57,1; Entroncamento com `health: 10` |
| 5 | `GET /api/recomendacoes` | 3 recomendações; a 1ª é a rota de manutenção com 6 paradas |
| 6 | `POST /api/simulacao` com `{ "acao": { "tipo": "DESATIVAR_EQUIPAMENTO", "equipamentoId": "EQ-003" } }` | Antes × depois; `GET /api/auditoria` continua igual (simular não grava) |
| 7 | `POST /api/equipamentos` com o exemplo do Swagger, duas vezes | **201** e depois **409** (id repetido) |
| 8 | `POST /api/equipamentos` com `{ "id": "x" }` | **400** com a lista de campos inválidos |
| 9 | `POST /api/cenarios/reverter` | Estado sem o apagão; repetir dá **409** |
| 10 | `POST /api/ocorrencias` → `GET …/dossie` → `GET …/despacho` → `POST …/despachar` → `POST …/encerrar` → `GET …/relatorio?formato=md` → `GET …/comprovante` | O fluxo completo da ocorrência |

</details>

## Como cada número é calculado

Todos os números são **estimativas por regras**, com pesos escolhidos por bom senso (não calibrados com dados reais). As fórmulas ficam em funções puras em `src/app/core/`, usadas pelo painel e pela API.

<details>
<summary><b>Saúde e risco do bairro</b></summary>

```txt
saúde (0–100) = 40 × disponibilidade + 20 × manutenção + 15 × alertas + 25 × efetivo
```

| Componente | Cálculo |
| --- | --- |
| disponibilidade | operacionais ÷ instalados |
| manutenção | 1 − (vencidas + imediatas + 0,5 × próximas em até 7 dias) ÷ instalados |
| alertas | 1 − (0,2 × críticos + 0,1 × altos) |
| efetivo | agentes em serviço ÷ necessários no pico (máx. 1) |

```txt
risco (0–100) = escore de colapso viário + 20 × fração do bairro em ponto cego
escore de colapso = 15 × fiscalização indisponível (máx. 45) + fluxo no pico relativo (máx. 30) + 10 × déficit de agentes (máx. 25)
```

Nível: **ALTO** ≥ 55, **MÉDIO** ≥ 35, **BAIXO** abaixo. A região no mapa fica Normal (< 15% indisponível), Atenção (15–30%) ou Crítica (≥ 30%).

</details>

<details>
<summary><b>Cidade Preditiva</b></summary>

| Previsão | Base de dados | Ação aplicada |
| --- | --- | --- |
| Colapso viário | radares, câmeras e cancelas indisponíveis + fluxo histórico no pico + déficit de agentes | OS imediata e convocação ou realocação de agentes |
| Falha em lote | taxa de falha de um fabricante/modelo comparada ao restante da frota | OS imediata nas unidades em falha e preventiva antecipada nas demais |
| Reforço de efetivo | efetivo atual × necessário no pico + ocorrências por semana | convoca agentes de folga ou realoca excedentes |

Os pesos estão em `prediction.service.ts` e aparecem na própria tela, em "Como as previsões são calculadas".

</details>

<details>
<summary><b>Pontos cegos de cobertura</b></summary>

A cidade é dividida em células de **250 m**. Uma célula está coberta se o centro dela fica a até R metros de um **equipamento operacional** ou de um **agente em serviço**. Raios de referência: viatura 600 m, moto 500 m, câmera 450 m, agente e veículo autônomo 400 m, radar 300 m, balança/cancela/outro 150 m, totem 120 m; veículos de transporte e patinetes não fiscalizam. Não considera obstáculos nem o ângulo das câmeras.

</details>

<details>
<summary><b>Simulador e próxima melhor ação</b></summary>

- `simular(estado, acao)` copia o estado, aplica a ação na cópia e compara antes × depois: indicadores, saúde e risco de cada bairro e pontos cegos. Nada é gravado.
- Ações: falha de equipamento, desativar, realocar agentes, antecipar manutenção, executar rota e despachar agente.
- `recomendarAcoes` simula cada candidata (manutenções urgentes, convocar agentes de folga, realocar excedentes, rota de manutenção) e ordena pelo **ganho = Σ queda de risco + 0,5 × Σ alta de saúde + 0,5 × pontos cegos recuperados**. No máximo 2 sugestões do mesmo tipo no top 3; cada uma traz impacto, justificativa e confiança.
- Aplicar grava no banco e registra na auditoria quem, quando e o antes → depois.

</details>

<details>
<summary><b>Rota de manutenção</b></summary>

1. **Seleção:** imediata (falha ou manutenção imediata), vencida e próxima (até 7 dias). Furtados ficam fora: pedem reposição, não manutenção.
2. **Distâncias pelas vias:** as ruas do mapa formam um grafo (vértices das vias e cruzamentos), e a distância entre dois pontos é o caminho mais curto nele (Dijkstra). Esse caminho é o traçado desenhado no mapa.
3. **Ordem:** a partir da base, a parada de menor **distância ÷ peso** (imediata 6, vencida 2,5, próxima 1). Enquanto houver imediata pendente, só imediatas são elegíveis.
4. **Estimativa:** tempo = distância pelas vias ÷ 25 km/h + 20 min por parada (sem trânsito, semáforos nem mão de direção).

</details>

<details>
<summary><b>Investigação, manuais e despacho</b></summary>

**Padrões da investigação**

| Padrão | Dispara quando |
| --- | --- |
| **Lote** | Outras unidades do mesmo fabricante e modelo estão em falha (não vale para furto) |
| **Vizinhança** | Furtos, falhas ou ocorrências a até **1 km** nas últimas **24 h** |
| **Possível energia** | Pelo menos **3** equipamentos fixos do bairro caem em **30 min** e são ao menos **75%** dos que operavam (separa apagão de degradação) |

**Busca nos manuais:** BM25 (k1 = 1,2; b = 0,75) sobre seção, tópicos e texto, sem acentos e sem stopwords, com bônus quando o tipo (+1) ou o fabricante (+1,5) coincidem.

**Decisão:** a primeira regra que casa decide, e as fontes são os trechos recuperados sobre o tópico dela.

| Regra | Quando | Decisão |
| --- | --- | --- |
| `EQUIPAMENTO_DESATIVADO` | desativado | Planejar a reposição |
| `FURTO_REINCIDENTE` | furto + vizinhança | Acionar Guarda e PM e registrar BO |
| `FURTO_ISOLADO` | furto | BO, bloquear o equipamento e pedir reposição |
| `QUEDA_DE_ENERGIA` | falha + energia | Acionar a concessionária |
| `FALHA_EM_LOTE` | falha + lote | Troca em lote e preventiva antecipada |
| `FALHA_ISOLADA` | falha | OS corretiva imediata |
| `MANUTENCAO` | demais casos | Executar a preventiva pendente |

Sem trecho que sustente a decisão, a confiança cai para **baixa** e isso é dito.

**Despacho:** furto pede Guarda ou PM; falha e manutenção pedem agente de trânsito. `ETA = distância em linha reta ÷ 30 km/h + 15 min se estiver de folga`. Ranking por ETA; o custo colateral é medido pelo simulador no bairro de origem.

**Encerramento:** reposto e consertado voltam o equipamento a "Operacional" com nova preventiva em 90 dias; falso alarme só limpa a pendência; "outro" mantém a situação. Encerrar duas vezes dá **409**.

</details>

<details>
<summary><b>Boletim da PROMETHEUS</b></summary>

Templates preenchidos com os números do estado: saudação pelo horário, disponibilidade, regiões que exigem atenção (saúde < 60 ou risco ALTO) e o motivo, alertas críticos, preventivas das próximas 48 h, pontos cegos, maior risco no próximo pico e a próxima melhor ação. Sem nada crítico: "Tudo sob controle". O mesmo estado gera sempre o mesmo texto.

</details>

### Comprovante e QR Code

O comprovante é emitido quando a ocorrência é **encerrada**: um cupom com número, selo ENCERRADA, equipamento, local, horários, duração, quem atendeu, resolução, a cidade **na abertura → agora** e uma frase da PROMETHEUS (3 variações por resolução, só com números reais).

**Para que serve.** O relatório pós-ocorrência é completo e foi feito para o arquivo da central. O trabalho de campo, porém, acontece longe do painel, e quem está lá precisa de outra coisa: um registro curto, oficial e à mão.

- **Agente em campo:** sai do local com a prova de que o atendimento aconteceu, com número da ocorrência, equipamento, horário e resolução. Em caso de furto, esses são exatamente os dados pedidos para registrar o boletim de ocorrência, que é a própria recomendação do manual.
- **Equipe técnica e fornecedor:** número de série, fabricante, data e tipo de falha formam o registro exigido para acionar a garantia, especialmente quando a investigação aponta defeito de lote.
- **Gestor:** tem um resumo de uma página para a passagem de turno ou para a prestação de contas à secretaria. O bloco **abertura → agora** mostra o efeito do atendimento na disponibilidade, na saúde e no risco do bairro: a ocorrência fecha com o resultado medido, não só com "resolvido".
- **Por que QR Code:** agentes e técnicos não têm acesso ao painel. Apontar a câmera transfere o comprovante para o celular sem login, aplicativo, cadastro ou troca de e-mail, e a página permite salvar em PDF ou em texto para encaminhar a quem precisar.

- **Imprimir ou salvar PDF:** sai uma página, só com o cupom, com o papel creme preservado.
- **Copiar texto:** versão em texto puro, até 42 colunas.
- **Abrir no celular:** mostra um QR Code grande. O link depende de onde o painel está aberto:
  - **Publicado (Vercel) ou aberto por um IP:** o **comprovante vai dentro do próprio link** (`/comprovante#…`, comprimido). A página lê os dados do link, sem servidor, e funciona de qualquer rede. O trecho depois do `#` não é enviado a servidor nenhum.
  - **Em `localhost` com a API:** link para a página servida pela API no IP da rede local (o celular precisa estar no mesmo Wi-Fi).
- **Sem dependências:** o QR Code é gerado por um codificador próprio (`core/qrcode.ts`, versões 1 a 40), conferido com o leitor ZXing.

## Arquitetura, banco e API

```
Painel Angular ──(HTTP)──▶ API Node (node:http) ──▶ Repositório ──▶ SQLite (data/fogo.db)
      │                           │
      └─────────── regras puras em src/app/core/ (as mesmas nos dois lados) ───────────┘
```

- **Regras puras** (`src/app/core/`): sem Angular, sem banco, sem rede. Recebem o estado e devolvem resultados, sem mutar a entrada. Por isso rodam igual no painel, na API e no modo offline, e são testadas isoladamente.
- **Repositório** (`server/repository.ts`): a única camada que fala com o banco.
- **Painel ↔ API:** o painel carrega `GET /api/estado` e envia em lote (`POST /api/sync`) só o que mudou. Sem servidor, entra em **modo offline** com o estado no `localStorage`.

| Tecnologia | Por quê |
| --- | --- |
| **Angular 21 + Signals** | Um filtro muda e só o que depende dele é recalculado, sem biblioteca extra de estado |
| **Leaflet** | Leve, sem chave nem conta; desenha a cidade fictícia em vetor |
| **Node `node:http` + SQLite (`node:sqlite`)** | ~40 rotas simples não pedem framework; o banco é um arquivo, sem instalação nem compilação nativa |
| **Vitest** | O mesmo runner do `ng test`, rápido |

A stack sugerida citava PostgreSQL/PostGIS e modelos de ML. Para um projeto que precisa rodar com `npm install && npm start` em qualquer máquina, SQLite e regras explicáveis entregam o mesmo valor demonstrativo sem infraestrutura.

<details>
<summary>Tabelas e rotas da API</summary>

**Tabelas** (`server/db.ts`): `equipamentos` (propriedades específicas em JSON validado), `agentes`, `eventos_situacao` (histórico), `alertas`, `auditoria` (quem, quando, antes → depois), `cenarios_aplicados` (para reverter), `ocorrencias` e `estado_cidade`.

| Rota | O que faz |
| --- | --- |
| `GET /api/estado`, `POST /api/sync`, `POST /api/reset` | Estado completo, gravação em lote, recriar o banco |
| `GET/POST /api/equipamentos`, `GET/PUT/DELETE /api/equipamentos/:id`, `PATCH …/situacao` | CRUD de equipamentos |
| `GET/POST /api/agentes`, `GET/PUT/DELETE /api/agentes/:id`, `PATCH …/situacao` | CRUD de agentes |
| `GET /api/alertas`, `GET /api/eventos`, `GET /api/auditoria` | Alertas, histórico e auditoria |
| `GET /api/analise`, `GET /api/cobertura`, `GET /api/boletim` | Indicadores, saúde, risco, cobertura e boletim |
| `POST /api/simulacao`, `GET /api/recomendacoes`, `POST /api/acoes/aplicar` | Simular (não grava), recomendar, aplicar |
| `GET /api/rota-manutencao` | Rota de manutenção |
| `POST /api/cenarios/:id`, `POST /api/cenarios/reverter` | Cenários de crise |
| `POST/GET /api/ocorrencias`, `GET /api/ocorrencias/:id` | Abrir (idempotente), listar, consultar |
| `GET …/:id/dossie`, `GET …/:id/despacho`, `POST …/:id/despachar`, `POST …/:id/encerrar` | Investigar, sugerir agentes, despachar, encerrar |
| `GET …/:id/relatorio`, `GET …/:id/comprovante`, `GET …/:id/comprovante/link`, `GET /api/comprovantes/:id` | Relatório, comprovante, link do QR, página do celular |
| `GET /api/manuais/busca` | Busca nos manuais |
| `GET /api/docs`, `GET /api/openapi.json` | Swagger UI e OpenAPI 3 (um teste garante que toda rota está documentada) |

</details>

<details>
<summary>Estrutura de pastas</summary>

```txt
server/                     API: rotas (app.ts), OpenAPI, banco, repositório, seed e testes
manuais/                    Manuais FICTÍCIOS em Markdown (um por tipo + furto, lote e energia)
src/app/
├── core/                   Regras puras: indicadores, saúde e risco, cobertura, simulação,
│                           recomendações, rota, cenários, ocorrências, investigação, manuais,
│                           despacho, relatório, boletim, comprovante e QR Code
├── data/                   Mapa da cidade fictícia e seed (30 equipamentos, 14 agentes)
├── models/                 Tipos do domínio e schema dos campos por tipo de equipamento
├── services/               Estado em Signals, API, previsões, cenários, simulador, ocorrências, voz
└── components/             Central, Inventário, Cidade Preditiva, simulador, rota, ocorrências,
                            comprovante, boletim e voz
```

</details>

## Agente de voz PROMETHEUS

O botão do **microfone**, no canto da tela, abre o painel de voz. Pergunte falando ou digitando; a resposta vem em texto e em voz alta, com os números atuais. Enquanto a PROMETHEUS fala, o botão **■ Parar** interrompe a resposta (fazer outra pergunta pelo microfone também interrompe). As perguntas são interpretadas por palavras-chave, sem LLM.

| Pergunte algo como | Resposta |
| --- | --- |
| "Resumo da cidade" | Equipamentos, disponibilidade, alertas e previsões |
| "Quais os alertas?" | Total, críticos e o primeiro da lista |
| "Qual o maior risco?" | A previsão mais crítica e a recomendação |
| "Como está o Entroncamento?" (qualquer bairro) | Situação do bairro e previsão dele |
| "Aplicar recomendação" | Aplica a recomendação mais crítica |
| "Iniciar telemetria" / "parar telemetria" | Liga ou desliga a telemetria |

<details>
<summary>Requisitos e solução de problemas</summary>

A voz usa a **Web Speech API** do navegador:

- **Fala** (texto → voz): feita pelo próprio navegador, funciona offline.
- **Escuta** (voz → texto): o navegador envia o áudio ao serviço dele (Google no Chrome, Microsoft no Edge). Precisa de internet, permissão de microfone e página em `localhost` ou HTTPS. Firefox não tem; o Brave tem a interface mas não o serviço, então o microfone aparece desabilitado nele (veja [Navegadores testados](#navegadores-testados)).

Sem microfone, sem internet ou noutro navegador, **digite** a pergunta: a resposta sai igual.

| Problema | O que fazer |
| --- | --- |
| Botão do microfone desabilitado | Use Chrome ou Edge, ou digite |
| "Permissão de microfone negada" | Cadeado da barra de endereço → Microfone → Permitir, e recarregue |
| "O serviço de transcrição do navegador não respondeu" | Sem internet, ou navegador sem o serviço: use Chrome ou Edge, ou digite |
| Microfone desabilitado no Brave | O Brave não oferece o serviço de transcrição: use Chrome ou digite |
| Nada acontece pelo IP da rede (`http://192.168…`) | O microfone só funciona em `localhost` ou HTTPS |

</details>

## Testes

`npm test` roda **159 testes** (Vitest): 135 das regras e do painel e 24 da API com o banco.

| Área | O que é garantido |
| --- | --- |
| Simulador e recomendações | Simular não altera o estado; desativar nunca melhora indicadores; recomendações ordenadas por ganho e a 1ª realmente melhora a cidade |
| Cobertura e rota | Raios respeitados; críticos sempre antes; distância total = soma dos trechos; o percurso fica sobre as ruas e nunca é menor que a linha reta |
| Cenários | Reverter devolve exatamente o estado anterior e preserva o que foi criado depois |
| Ocorrências | Abrir é idempotente; cada padrão dispara no cenário certo e não no oposto; cada regra cita fonte; o agente volta exatamente à origem |
| Relatório, boletim e comprovante | Citam os números corretos, são determinísticos e nunca mostram "undefined" ou "NaN" |
| QR Code | Estrutura da norma em todas as versões; leitura conferida com o decodificador ZXing |
| API e banco | Persistência entre reinícios, validação (400), id repetido (409), auditoria, e **toda rota documentada no OpenAPI** |
| Painel | KPIs, filtros, alertas, previsões, mapa incremental e o modal do comprovante (cópia, QR e tecla ESC) |

**Teste de carga:** abra `http://localhost:4200/?stress=2000` (máximo 5000) para somar uma frota sintética só em memória. Com 2.072 equipamentos, a atualização incremental do mapa leva cerca de 39 ms de script por ciclo de telemetria, sem recriar nenhum marcador (um redesenho completo levaria 216 ms).

## Suposições e limitações

- **Cidade fictícia.** O desafio pedia bairros reais; foi mantida a cidade fictícia **Nova Prometeia** porque o mapa é desenhado em vetor, sem servidor de mapas, e todos os pontos ficam sobre as vias desenhadas. CEPs seguem o formato brasileiro, mas nenhum endereço é real.
- **Números são estimativas por regras**, com fórmulas documentadas acima e pesos não calibrados com dados reais. O histórico de fluxo por bairro é simulado.
- **Distâncias:** a rota de manutenção usa o caminho pelas vias do mapa, sem trânsito, semáforos nem mão de direção; o ETA do despacho usa linha reta, e a tela diz isso.
- **Manuais são fictícios**, escritos para a demonstração; a busca entende sinônimos só na medida em que os manuais usam as mesmas palavras.
- **Seed:** as datas de manutenção são relativas ao dia do reset ("vence amanhã"); mesma seed no mesmo dia, mesmo resultado.
- **Sem autenticação:** a auditoria registra o autor pelo cabeçalho `x-usuario` (o painel envia "gestor (painel)").
- **Modo offline** (incluindo a versão publicada): tudo funciona com as mesmas regras, mas sem banco, histórico nem auditoria; a investigação usa só as mudanças registradas no próprio navegador.
- **Ocorrências:** uma por equipamento + tipo de alerta enquanto aberta; um despacho por ocorrência.
- **Relatório e comprovante** comparam a cidade inteira na abertura e agora: a variação inclui tudo o que mudou no período, não só a ocorrência. O "atendido por" é o agente despachado.
- **Comprovante no link:** é uma cópia do cupom no momento da emissão; quem tiver o link vê os dados (documento interno de demonstração, sem dados pessoais além do nome do agente).
- **QR Code em `localhost`:** o link usa o IP da rede local; se o escolhido não for o certo (VPN, máquina virtual), defina `FOGO_URL_PUBLICA`. O Chrome do Android não abre endereços da rede local, e o Brave pede permissão para acessar dispositivos próximos; pela versão publicada isso não acontece (veja [Navegadores testados](#navegadores-testados)).

## Uso de IA no desenvolvimento

O código foi desenvolvido com apoio de assistentes de IA: **Claude** (Claude Code) e **Gemini** (Antigravity). Na etapa final, o Claude Code (modelo Claude Opus 5.5) escreveu o código e os testes a partir de especificações detalhadas, com as decisões revisadas a cada etapa: cenários com reversão, banco SQLite e API, simulador, próxima melhor ação, pontos cegos, rota de manutenção, boletim, fluxo de ocorrências, comprovante e QR Code. Os **manuais** em `manuais/` também foram escritos pelo Claude Code, por especificação: são textos fictícios, sem relação com documentação real de fabricantes. As pastas `.agents/` e `.gemini/` guardam a especificação usada como contexto pelas IAs e ficam fora do pacote de entrega.

A IA foi usada para **construir** o sistema, não para **operá-lo**: a aplicação não chama nenhuma IA em tempo de execução e não precisa de chave de API. Previsões, recomendações, investigação, decisões, boletim, relatório e comprovante são regras e templates explicáveis, descritos neste README e verificados pelos testes.
