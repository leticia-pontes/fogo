import { STATUS_OCORRENCIA, TIPOS_ALERTA } from '../src/app/core/occurrences';
import { EQUIPMENT_STATUSES, EQUIPMENT_TYPES } from '../src/app/models/equipment-schema';

/** Especificação OpenAPI da API, servida em /api/openapi.json e exibida no Swagger UI em /api/docs. */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const ok = (description: string, schema: object = { type: 'object' }) => ({ description, ...json(schema) });
const erro = (description: string) => ({ description, ...json(ref('Erro')) });
const body = (schema: object, example?: unknown) => ({
  required: true,
  content: { 'application/json': { schema, ...(example === undefined ? {} : { example }) } },
});
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const query = (name: string, description: string, schema: object = { type: 'string' }) => ({ name, in: 'query', required: false, description, schema });
const limite = query('limite', 'Quantidade máxima de registros (padrão 50).', { type: 'integer', default: 50 });

const ESTADO = ok('Estado completo da cidade', ref('Estado'));
const OK = ok('Operação concluída', ref('Ok'));
const INVALIDO = erro('Dados inválidos (lista em `detalhes`)');
const NAO_ENCONTRADO = erro('Não encontrado');

const exemploEquipamento = {
  id: 'eq-exemplo-1',
  serialNumber: 'RAD-0001',
  brand: 'Perkons',
  model: 'PK-500',
  agency: 'SEMOB',
  type: 'radar',
  status: 'operational',
  location: { cep: '13900-100', neighborhood: 'Centro Histórico', cityUf: 'Nova Prometeia/SP', street: 'Rua do Comércio', reference: 'Em frente à Prefeitura', lat: -22.3497, lng: -47.8456 },
  maintenance: { priority: 'none' },
  customProperties: { radarSubtype: 'speed', maxSpeedLimit: 60 },
};

const exemploAgente = {
  id: 'ag-exemplo-1',
  name: 'Maria Souza',
  badgeNumber: 'AT-1001',
  role: 'transit_agent',
  agency: 'SEMOB',
  status: 'active',
  neighborhood: 'Centro Histórico',
  lat: -22.3497,
  lng: -47.8456,
};

export const OPENAPI = {
  openapi: '3.0.3',
  info: {
    title: 'F.O.G.O. API',
    version: '1.0.0',
    description:
      'API do painel F.O.G.O. (Node + SQLite). Todas as escritas registram auditoria; o autor vem do cabeçalho `x-usuario` (padrão: `gestor`).',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Estado', description: 'Leitura e sincronização do estado completo' },
    { name: 'Equipamentos' },
    { name: 'Agentes' },
    { name: 'Cenários', description: 'Cenários de crise e reset do banco' },
    { name: 'Simulação', description: 'Simulador, recomendações e aplicação de ações' },
    { name: 'Consultas', description: 'Análises, boletim, rota de manutenção e histórico' },
    { name: 'Ocorrências', description: 'Fluxo alerta → ocorrência → investigação → despacho → encerramento' },
  ],
  components: {
    parameters: {
      usuario: { name: 'x-usuario', in: 'header', required: false, description: 'Autor registrado na auditoria.', schema: { type: 'string', default: 'gestor' } },
    },
    schemas: {
      Ok: { type: 'object', properties: { ok: { type: 'boolean', example: true } } },
      Erro: { type: 'object', properties: { erro: { type: 'string' }, detalhes: {} } },
      Localizacao: {
        type: 'object',
        required: ['cep', 'neighborhood', 'cityUf', 'street', 'lat', 'lng'],
        properties: {
          cep: { type: 'string', pattern: '^\\d{5}-?\\d{3}$', example: '13900-100' },
          neighborhood: { type: 'string' },
          cityUf: { type: 'string' },
          street: { type: 'string' },
          reference: { type: 'string' },
          lat: { type: 'number', minimum: -90, maximum: 90 },
          lng: { type: 'number', minimum: -180, maximum: 180 },
        },
      },
      Equipamento: {
        type: 'object',
        required: ['id', 'serialNumber', 'brand', 'model', 'agency', 'type', 'status', 'location', 'maintenance', 'customProperties'],
        properties: {
          id: { type: 'string' },
          serialNumber: { type: 'string' },
          brand: { type: 'string' },
          model: { type: 'string' },
          agency: { type: 'string', description: 'Órgão responsável' },
          type: { type: 'string', enum: EQUIPMENT_TYPES },
          status: { type: 'string', enum: EQUIPMENT_STATUSES },
          location: ref('Localizacao'),
          maintenance: {
            type: 'object',
            required: ['priority'],
            properties: {
              priority: { type: 'string', enum: ['none', 'scheduled', 'immediate'] },
              nextDate: { type: 'string', format: 'date' },
            },
          },
          customProperties: { type: 'object', description: 'Propriedades específicas do `type` (ex.: radar → `radarSubtype`, `maxSpeedLimit`).' },
        },
        example: exemploEquipamento,
      },
      Agente: {
        type: 'object',
        required: ['id', 'name', 'badgeNumber', 'role', 'agency', 'status', 'neighborhood', 'lat', 'lng'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          badgeNumber: { type: 'string' },
          role: { type: 'string', enum: ['transit_agent', 'municipal_guard', 'military_police'] },
          agency: { type: 'string' },
          status: { type: 'string', enum: ['active', 'off_duty', 'in_dispatch'] },
          neighborhood: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
        example: exemploAgente,
      },
      Estado: {
        type: 'object',
        properties: {
          equipment: { type: 'array', items: ref('Equipamento') },
          agents: { type: 'array', items: ref('Agente') },
          peakSurge: { type: 'string', nullable: true },
          scenarioSnapshot: { type: 'object', nullable: true, description: 'Cenário(s) ativo(s), se houver' },
        },
      },
      Acao: {
        type: 'object',
        required: ['tipo'],
        description:
          'Uma das ações: `FALHA_EQUIPAMENTO` / `DESATIVAR_EQUIPAMENTO` { equipamentoId }, `REALOCAR_AGENTES` { agentes[], regiaoDestino }, ' +
          '`ANTECIPAR_MANUTENCAO` { equipamentoId, novaData }, `EXECUTAR_ROTA_MANUTENCAO` { equipamentoIds[] }.',
        properties: {
          tipo: { type: 'string', enum: ['FALHA_EQUIPAMENTO', 'DESATIVAR_EQUIPAMENTO', 'REALOCAR_AGENTES', 'ANTECIPAR_MANUTENCAO', 'EXECUTAR_ROTA_MANUTENCAO'] },
          equipamentoId: { type: 'string' },
          equipamentoIds: { type: 'array', items: { type: 'string' } },
          agentes: { type: 'array', items: { type: 'string' } },
          regiaoDestino: { type: 'string' },
          novaData: { type: 'string', format: 'date' },
        },
      },
      Situacao: { type: 'object', required: ['situacao'], properties: { situacao: { type: 'string' } } },
      Ocorrencia: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'OC-0001' },
          equipamentoId: { type: 'string' },
          tipoAlerta: { type: 'string', enum: TIPOS_ALERTA },
          status: { type: 'string', enum: STATUS_OCORRENCIA },
          abertaEm: { type: 'string', format: 'date-time' },
          encerradaEm: { type: 'string', format: 'date-time', nullable: true },
          snapshotAbertura: {
            type: 'object',
            description: 'Indicadores gerais, saúde, risco e cobertura do bairro no momento da abertura',
            properties: {
              indicadores: { type: 'object' },
              bairro: { type: 'string' },
              saude: { type: 'object', nullable: true },
              risco: { type: 'object', nullable: true },
              cobertura: { type: 'object', properties: { cidadePct: { type: 'number' }, bairroPct: { type: 'number', nullable: true }, pontosCegos: { type: 'integer' } } },
            },
          },
          dossie: { type: 'object', nullable: true },
          despacho: { type: 'object', nullable: true },
          encerramento: { type: 'object', nullable: true },
        },
      },
    },
  },
  paths: {
    '/api/saude': { get: { tags: ['Estado'], summary: 'Verifica se a API está no ar', responses: { 200: OK } } },
    '/api/estado': { get: { tags: ['Estado'], summary: 'Estado completo (equipamentos, agentes, pico e cenário ativo)', responses: { 200: ESTADO } } },
    '/api/sync': {
      post: {
        tags: ['Estado'],
        summary: 'Grava em lote o que mudou no painel',
        description: 'Mudanças de situação viram histórico; com `origem: usuario` também vão para a auditoria.',
        parameters: [{ $ref: '#/components/parameters/usuario' }],
        requestBody: body({
          type: 'object',
          properties: {
            equipment: { type: 'array', items: ref('Equipamento') },
            agents: { type: 'array', items: ref('Agente') },
            removed: { type: 'object', properties: { equipment: { type: 'array', items: { type: 'string' } }, agents: { type: 'array', items: { type: 'string' } } } },
            peakSurge: { type: 'string', nullable: true },
            origem: { type: 'string', enum: ['usuario', 'telemetria'], default: 'usuario' },
          },
        }),
        responses: { 200: OK, 400: INVALIDO },
      },
    },

    '/api/equipamentos': {
      get: {
        tags: ['Equipamentos'],
        summary: 'Lista equipamentos',
        parameters: [
          query('tipo', 'Filtra por tipo', { type: 'string', enum: EQUIPMENT_TYPES }),
          query('situacao', 'Filtra por situação', { type: 'string', enum: EQUIPMENT_STATUSES }),
          query('bairro', 'Filtra por bairro'),
        ],
        responses: { 200: ok('Equipamentos', { type: 'array', items: ref('Equipamento') }) },
      },
      post: {
        tags: ['Equipamentos'],
        summary: 'Cadastra equipamento',
        parameters: [{ $ref: '#/components/parameters/usuario' }],
        requestBody: body(ref('Equipamento'), exemploEquipamento),
        responses: { 201: ok('Criado', ref('Equipamento')), 400: INVALIDO, 409: erro('Já existe equipamento com esse id') },
      },
    },
    '/api/equipamentos/{id}': {
      get: { tags: ['Equipamentos'], summary: 'Consulta equipamento', parameters: [idParam], responses: { 200: ok('Equipamento', ref('Equipamento')), 404: NAO_ENCONTRADO } },
      put: {
        tags: ['Equipamentos'],
        summary: 'Edita equipamento (o `id` da URL prevalece)',
        parameters: [idParam, { $ref: '#/components/parameters/usuario' }],
        requestBody: body(ref('Equipamento'), exemploEquipamento),
        responses: { 200: ok('Atualizado', ref('Equipamento')), 400: INVALIDO, 404: NAO_ENCONTRADO },
      },
      delete: { tags: ['Equipamentos'], summary: 'Exclui equipamento', parameters: [idParam, { $ref: '#/components/parameters/usuario' }], responses: { 200: OK, 404: NAO_ENCONTRADO } },
    },
    '/api/equipamentos/{id}/situacao': {
      patch: {
        tags: ['Equipamentos'],
        summary: 'Troca só a situação (ex.: desativar)',
        parameters: [idParam, { $ref: '#/components/parameters/usuario' }],
        requestBody: body(ref('Situacao'), { situacao: 'deactivated' }),
        responses: { 200: ok('Atualizado', ref('Equipamento')), 400: INVALIDO, 404: NAO_ENCONTRADO },
      },
    },

    '/api/agentes': {
      get: {
        tags: ['Agentes'],
        summary: 'Lista agentes',
        parameters: [query('situacao', 'Filtra por situação', { type: 'string', enum: ['active', 'off_duty', 'in_dispatch'] }), query('bairro', 'Filtra por bairro')],
        responses: { 200: ok('Agentes', { type: 'array', items: ref('Agente') }) },
      },
      post: {
        tags: ['Agentes'],
        summary: 'Cadastra agente',
        parameters: [{ $ref: '#/components/parameters/usuario' }],
        requestBody: body(ref('Agente'), exemploAgente),
        responses: { 201: ok('Criado', ref('Agente')), 400: INVALIDO, 409: erro('Já existe agente com esse id') },
      },
    },
    '/api/agentes/{id}': {
      get: { tags: ['Agentes'], summary: 'Consulta agente', parameters: [idParam], responses: { 200: ok('Agente', ref('Agente')), 404: NAO_ENCONTRADO } },
      put: {
        tags: ['Agentes'],
        summary: 'Edita agente (o `id` da URL prevalece)',
        parameters: [idParam, { $ref: '#/components/parameters/usuario' }],
        requestBody: body(ref('Agente'), exemploAgente),
        responses: { 200: ok('Atualizado', ref('Agente')), 400: INVALIDO, 404: NAO_ENCONTRADO },
      },
      delete: { tags: ['Agentes'], summary: 'Exclui agente', parameters: [idParam, { $ref: '#/components/parameters/usuario' }], responses: { 200: OK, 404: NAO_ENCONTRADO } },
    },
    '/api/agentes/{id}/situacao': {
      patch: {
        tags: ['Agentes'],
        summary: 'Troca só a situação do agente',
        parameters: [idParam, { $ref: '#/components/parameters/usuario' }],
        requestBody: body(ref('Situacao'), { situacao: 'off_duty' }),
        responses: { 200: ok('Atualizado', ref('Agente')), 400: INVALIDO, 404: NAO_ENCONTRADO },
      },
    },

    '/api/cenarios/{id}': {
      post: {
        tags: ['Cenários'],
        summary: 'Aplica um cenário de crise (acumula com os já ativos)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', enum: ['theft_wave', 'north_degradation', 'south_peak', 'power_outage'] } },
          { $ref: '#/components/parameters/usuario' },
        ],
        responses: { 200: ok('Estado após o cenário, com `label`, `focus` e `messages`'), 404: erro('Cenário desconhecido') },
      },
    },
    '/api/cenarios/reverter': {
      post: { tags: ['Cenários'], summary: 'Reverte todos os cenários ativos', parameters: [{ $ref: '#/components/parameters/usuario' }], responses: { 200: ESTADO, 409: erro('Nenhum cenário ativo') } },
    },
    '/api/reset': {
      post: { tags: ['Cenários'], summary: 'Recria o banco com a seed de exemplo', parameters: [{ $ref: '#/components/parameters/usuario' }], responses: { 200: ESTADO } },
    },

    '/api/simulacao': {
      post: {
        tags: ['Simulação'],
        summary: 'Simula uma ação sobre o estado atual, sem gravar',
        requestBody: body({ type: 'object', required: ['acao'], properties: { acao: ref('Acao') } }, { acao: { tipo: 'FALHA_EQUIPAMENTO', equipamentoId: 'eq-exemplo-1' } }),
        responses: { 200: ok('Indicadores antes × depois e diferenças'), 400: erro('Ação inválida') },
      },
    },
    '/api/recomendacoes': {
      get: {
        tags: ['Simulação'],
        summary: 'Próximas melhores ações, ordenadas por impacto',
        parameters: [query('topN', 'Quantidade de recomendações (padrão 3)', { type: 'integer', default: 3 })],
        responses: { 200: ok('Recomendações', { type: 'array', items: { type: 'object' } }) },
      },
    },
    '/api/acoes/aplicar': {
      post: {
        tags: ['Simulação'],
        summary: 'Aplica uma ação de verdade (grava e audita)',
        parameters: [{ $ref: '#/components/parameters/usuario' }],
        requestBody: body(
          {
            type: 'object',
            required: ['acao'],
            properties: { acao: ref('Acao'), contexto: { type: 'string', enum: ['rota'], description: '`rota` marca a conclusão de uma parada da rota de manutenção' } },
          },
          { acao: { tipo: 'DESATIVAR_EQUIPAMENTO', equipamentoId: 'eq-exemplo-1' } }
        ),
        responses: { 200: ok('Novo estado completo com `simulacao`'), 400: erro('Ação inválida') },
      },
    },

    '/api/rota-manutencao': {
      get: {
        tags: ['Consultas'],
        summary: 'Rota de manutenção (vizinho mais próximo ponderado pela criticidade)',
        parameters: [
          query('bairro', 'Restringe a um bairro'),
          query('tipo', 'Restringe a um tipo', { type: 'string', enum: EQUIPMENT_TYPES }),
          query('apenasCriticos', 'Só equipamentos críticos', { type: 'string', enum: ['1', 'true'] }),
          query('limite', 'Número máximo de paradas', { type: 'integer' }),
        ],
        responses: { 200: ok('Rota') },
      },
    },
    '/api/boletim': { get: { tags: ['Consultas'], summary: 'Boletim da PROMETHEUS (templates determinísticos)', responses: { 200: ok('Boletim') } } },
    '/api/cobertura': { get: { tags: ['Consultas'], summary: 'Cobertura por bairro e pontos cegos', responses: { 200: ok('Cobertura') } } },
    '/api/analise': { get: { tags: ['Consultas'], summary: 'Indicadores, saúde, risco e cobertura', responses: { 200: ok('Análise') } } },
    '/api/auditoria': { get: { tags: ['Consultas'], summary: 'Registros de auditoria (mais recentes primeiro)', parameters: [limite], responses: { 200: ok('Auditoria', { type: 'array', items: { type: 'object' } }) } } },
    '/api/alertas': { get: { tags: ['Consultas'], summary: 'Alertas abertos', responses: { 200: ok('Alertas', { type: 'array', items: { type: 'object' } }) } } },
    '/api/ocorrencias': {
      post: {
        tags: ['Ocorrências'],
        summary: 'Abre uma ocorrência a partir de um alerta (idempotente)',
        description: 'Se já existir ocorrência não encerrada para o mesmo equipamento e tipo de alerta, devolve a existente com 200.',
        parameters: [{ $ref: '#/components/parameters/usuario' }],
        requestBody: body(
          { type: 'object', required: ['equipamentoId', 'tipoAlerta'], properties: { equipamentoId: { type: 'string' }, tipoAlerta: { type: 'string', enum: TIPOS_ALERTA } } },
          { equipamentoId: 'eq-exemplo-1', tipoAlerta: 'furto' }
        ),
        responses: {
          201: ok('Ocorrência criada', ref('Ocorrencia')),
          200: ok('Já existia ocorrência em aberto para o mesmo equipamento e tipo', ref('Ocorrencia')),
          400: INVALIDO,
          404: erro('Equipamento não encontrado'),
        },
      },
      get: {
        tags: ['Ocorrências'],
        summary: 'Lista ocorrências (mais recentes primeiro)',
        parameters: [query('status', 'Filtra por status', { type: 'string', enum: STATUS_OCORRENCIA })],
        responses: { 200: ok('Ocorrências', { type: 'array', items: ref('Ocorrencia') }), 400: erro('Status inválido') },
      },
    },
    '/api/ocorrencias/{id}': {
      get: { tags: ['Ocorrências'], summary: 'Consulta uma ocorrência', parameters: [idParam], responses: { 200: ok('Ocorrência', ref('Ocorrencia')), 404: NAO_ENCONTRADO } },
    },
    '/api/eventos': { get: { tags: ['Consultas'], summary: 'Histórico de mudanças de situação', parameters: [limite], responses: { 200: ok('Eventos', { type: 'array', items: { type: 'object' } }) } } },
  },
};

export const SWAGGER_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>F.O.G.O. API · Swagger</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true });</script>
</body>
</html>`;
