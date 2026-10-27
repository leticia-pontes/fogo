import { buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { calcularIndicadores } from './indicators';
import { abrirOcorrencia, montarSnapshot, proximoIdOcorrencia, tipoAlertaDoEquipamento, validarAbertura } from './occurrences';
import { CityState } from './state';

describe('ocorrências (funções puras)', () => {
  const estado = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });
  const agora = new Date('2026-10-27T12:00:00Z');

  it('deduz o tipo de alerta da situação do equipamento', () => {
    const [base] = buildMockEquipment();
    expect(tipoAlertaDoEquipamento({ ...base, status: 'stolen' })).toBe('furto');
    expect(tipoAlertaDoEquipamento({ ...base, status: 'malfunction' })).toBe('falha');
    expect(tipoAlertaDoEquipamento({ ...base, status: 'operational', maintenance: { priority: 'immediate' } })).toBe('manutencao');
    expect(tipoAlertaDoEquipamento({ ...base, status: 'operational', maintenance: { priority: 'none' } })).toBeNull();
  });

  it('abrir é idempotente por equipamento + tipo e não muta a entrada', () => {
    const s = estado();
    const before = JSON.stringify(s);
    const eq = s.equipment.find((e) => e.status === 'stolen')!;
    const { ocorrencia, criada } = abrirOcorrencia([], s, { equipamentoId: eq.id, tipoAlerta: 'furto' }, agora);
    expect(criada).toBe(true);
    expect(ocorrencia).toMatchObject({ id: 'OC-0001', status: 'aberta', abertaEm: agora.toISOString() });

    const again = abrirOcorrencia([ocorrencia], s, { equipamentoId: eq.id, tipoAlerta: 'furto' }, agora);
    expect(again).toEqual({ ocorrencia, criada: false });
    // Encerrada não bloqueia uma nova.
    const reopened = abrirOcorrencia([{ ...ocorrencia, status: 'encerrada' }], s, { equipamentoId: eq.id, tipoAlerta: 'furto' }, agora);
    expect(reopened.ocorrencia.id).toBe('OC-0002');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('snapshot usa os mesmos números dos indicadores e do bairro', () => {
    const s = estado();
    const bairro = s.equipment[0].location.neighborhood;
    const snap = montarSnapshot(s, bairro);
    expect(snap.indicadores).toEqual(calcularIndicadores(s.equipment, s.agents));
    expect(snap.saude?.neighborhood).toBe(bairro);
    expect(snap.risco?.neighborhood).toBe(bairro);
    expect(snap.cobertura.bairroPct).not.toBeNull();
  });

  it('valida a entrada e numera em sequência', () => {
    expect(validarAbertura(null)).toEqual(['corpo inválido']);
    expect(validarAbertura({ equipamentoId: 'x', tipoAlerta: 'falha' })).toEqual([]);
    expect(proximoIdOcorrencia([{ id: 'OC-0009' }, { id: 'OC-0002' }])).toBe('OC-0010');
    expect(() => abrirOcorrencia([], estado(), { equipamentoId: 'NAO-EXISTE', tipoAlerta: 'falha' }, agora)).toThrow();
  });
});
