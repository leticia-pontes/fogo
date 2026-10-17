# F.O.G.O. (Ferramenta Onisciente de Gestão e Operações) — Nexus Urbano

Solução completa desenvolvida para a **Etapa Bônus do Coder Challenge 2026 (Protocolo PROMETHEUS)** em **Angular 21+**, **Tailwind CSS**, **Leaflet (Carto Dark Matter)** e **Vercel AI SDK (`@ai-sdk/google` + Gemini)**.

---

## 🚀 Arquitetura & Pilha Tecnológica

- **Framework**: Angular 21 (100% Standalone Components, Signals, Computed, Effects, Control Flow `@if`/`@for`, sem módulos legados).
- **Tipagem Estrita**: União Discriminada (`CityDevice = RadarDevice | CameraDevice | GenericIoTDevice`) em `models/fogo.models.ts` sem uso de `any`.
- **Estilização**: Tailwind CSS + Lucide Icons (`@lucide/angular`) + `uuid@11`, tema Central de Comando Tática (`#0d1117` / `#161b22`).
- **Visualização Espacial**: Leaflet com tiles **OpenStreetMap Escuro** (visual tático/cyberpunk via CSS filter, 100% livre de API key e sem marcas d'água), inicializado com segurança para SSR/Vercel em `ngAfterViewInit` após validação `isPlatformBrowser`.
- **Camada de IA & Backend**: Serverless Function em `api/prometheus-triage.ts` utilizando `@ai-sdk/google` (`gemini-2.0-flash`) com fallback heurístico determinístico.

---

## 🧩 As 3 Etapas Implementadas

### Parte 1 – Inventário Inteligente (`InventoryComponent` & `DeviceInventoryService`)

- **Seed Pré-carregado**: **84 equipamentos IoT** cobrindo todas as 9 categorias (`radar`, `camera`, `truck_scale`, `autonomous_patrol`, `automated_barrier`, `transit_vehicle`, `parking_totem`, `shared_micromobility`, `police_vehicle`) e **24 agentes de campo** (`traffic_agent`, `civil_guard`, `military_police`).
- **Busca Reativa em Tempo Real**: Filtro instantâneo por número de série, logradouro/rua, bairro, fabricante, modelo e ponto de referência.
- **Chips de Status**: Filtros rápidos para `Operacional`, `Mau Funcionamento`, `Furtado`, `Urgência Imediata` e `Em Manutenção`.
- **Modal de Cadastro Dinâmico (`<dialog closedby="any">`)**: Renderiza campos técnicos específicos conforme a categoria selecionada (velocidade/faixas/infração para radares; resolução 4K/1080p, visão noturna, RTSP/HLS e PTZ para câmeras; telemetria customizada para os demais sensores).

### Parte 2 – Central de Operações em Tempo Real (`OpsCenterComponent`)

- **Mapa Leaflet Fullscreen**: Tiles escuros Carto Dark Matter com marcadores SVG customizados por categoria e anel luminoso de status (`verde = operacional`, `vermelho = falha crítica`, `âmbar = manutenção`, `roxo/preto = furtado`).
- **Barra Superior de KPIs Reativos (Signals)**: Total de Dispositivos, % de Disponibilidade de Rede, Equipamentos em Falha Crítica e Agentes Ativos em Campo.
- **Feed Lateral de Alertas**: Lista de anomalias críticas ordenadas por severidade. Clicar em um alerta move suavemente a câmera (`flyTo`) até o equipamento, abre o popup de telemetria e permite despachar a viatura mais próxima com 1 clique.
- **Clusters Dinâmicos de Saúde Regional**: Cálculo em tempo real da saúde percentual da malha e do Índice de Risco Territorial (IRT) por bairro/zona.

### Parte 3 – Cidade Preditiva & Explicabilidade XAI (`PredictiveEngineComponent`)

- **Índice de Risco Territorial (IRT)**: Monitoramento por bairro com score de 0 a 100.
- **Módulo de Explicabilidade de IA (XAI)**: Cada incidente preditivo apresenta explicitamente:
  1. **O que foi previsto** (evento crítico, janela temporal e grau de confiança);
  2. **Fatores de entrada e pesos percentuais** (`xaiFactors`);
  3. **Ação recomendada** com botão **"Executar Ação de Mitigação"**, que sincroniza corredores de Onda Verde no mapa, desloca efetivo e reduz o score de risco do bairro imediatamente.

---

## ⚡ Barra de Cenários da Banca Avaliadora (Rodapé Fixo)

1. **`[ Simular Chuva Torrencial ]`**: Altera o estado meteorológico para tempestade severa, coloca 4 sensores da Zona Sul em alerta de alagamento, eleva o IRT da Zona Sul para **92/100** e traça rota de desvio tático.
2. **`[ Simular Furto de Radar ]`**: Interrompe a telemetria de um radar operacional, altera o status para `stolen` (`Furtado`), emite alerta sonoro/visual crítico na central e sugere o despacho imediato da viatura mais próxima.
3. **`[ Resetar Dados ]`**: Restaura instantaneamente o seed original sem recarregar a página.

---

## 🛠️ Como Executar Localmente

```bash
npm install
npm start
```

Para gerar o bundle de produção (compatível com Vercel):

```bash
npm run build
```
