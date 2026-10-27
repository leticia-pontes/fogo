import L from 'leaflet';
import { MarkerSpec, MarkerSync, markerRank } from './marker-sync';

describe('MarkerSync', () => {
  let layer: L.LayerGroup;
  let sync: MarkerSync;
  let iconsBuilt: number;

  const spec = (key: string, overrides: Partial<MarkerSpec> = {}): MarkerSpec => ({
    key,
    lat: -22.35,
    lng: -47.85,
    iconKey: 'eq|radar|operational|false',
    zIndex: 0,
    buildIcon: () => {
      iconsBuilt++;
      return { html: '<div></div>', size: 30 };
    },
    tooltip: `Radar ${key}`,
    onClick: () => undefined,
    ...overrides,
  });

  beforeEach(() => {
    layer = L.layerGroup();
    sync = new MarkerSync(L, layer);
    iconsBuilt = 0;
  });

  it('cria um marcador por item', () => {
    sync.sync([spec('a'), spec('b'), spec('c')]);
    expect(sync.size).toBe(3);
    expect(layer.getLayers()).toHaveLength(3);
  });

  it('mantém os mesmos marcadores quando nada muda', () => {
    sync.sync([spec('a'), spec('b')]);
    const before = [sync.get('a'), sync.get('b')];
    sync.sync([spec('a'), spec('b')]);
    expect([sync.get('a'), sync.get('b')]).toEqual(before);
    expect(sync.get('a')).toBe(before[0]);
  });

  it('só move o marcador cuja posição mudou', () => {
    sync.sync([spec('a'), spec('b')]);
    const a = sync.get('a')!;
    const b = sync.get('b')!;
    const setLatLngA = vi.spyOn(a, 'setLatLng');
    const setLatLngB = vi.spyOn(b, 'setLatLng');

    sync.sync([spec('a', { lat: -22.36 }), spec('b')]);

    expect(sync.get('a')).toBe(a);
    expect(a.getLatLng().lat).toBe(-22.36);
    expect(setLatLngA).toHaveBeenCalledTimes(1);
    expect(setLatLngB).not.toHaveBeenCalled();
  });

  it('só troca o ícone do marcador cuja situação mudou, compartilhando ícones iguais', () => {
    sync.sync([spec('a'), spec('b')]);
    expect(iconsBuilt).toBe(1);
    expect(sync.get('a')!.options.icon).toBe(sync.get('b')!.options.icon);

    const setIconB = vi.spyOn(sync.get('b')!, 'setIcon');
    sync.sync([spec('a', { iconKey: 'eq|radar|stolen|false', tooltip: 'Radar furtado' }), spec('b')]);

    expect(iconsBuilt).toBe(2);
    expect(sync.get('a')!.options.icon).not.toBe(sync.get('b')!.options.icon);
    expect(sync.get('a')!.getTooltip()!.getContent()).toBe('Radar furtado');
    expect(setIconB).not.toHaveBeenCalled();

    // Voltar ao ícone anterior reaproveita o cache, sem construir de novo.
    sync.sync([spec('a'), spec('b')]);
    expect(iconsBuilt).toBe(2);
    expect(sync.get('a')!.options.icon).toBe(sync.get('b')!.options.icon);
  });

  it('remove o marcador de item que saiu da lista', () => {
    sync.sync([spec('a'), spec('b')]);
    const b = sync.get('b')!;
    sync.sync([spec('a')]);
    expect(sync.size).toBe(1);
    expect(sync.get('b')).toBeUndefined();
    expect(layer.hasLayer(b)).toBe(false);
  });

  it('dispara o clique do item', () => {
    const onClick = vi.fn();
    sync.sync([spec('a', { onClick })]);
    sync.get('a')!.fire('click');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('camada agrupada (markercluster)', () => {
    let group: L.MarkerClusterGroup;

    beforeAll(async () => {
      // O plugin (UMD) estende o `L` global, como no componente.
      (globalThis as { L?: typeof L }).L = L;
      await import('leaflet.markercluster');
    });

    beforeEach(() => {
      group = L.markerClusterGroup();
      sync = new MarkerSync(L, group, { clustered: true });
    });

    it('adiciona em lote e grava a gravidade no marcador', () => {
      const addLayers = vi.spyOn(group, 'addLayers');
      sync.sync([spec('a', { rank: 4 }), spec('b')]);
      expect(addLayers).toHaveBeenCalledTimes(1);
      expect(group.getLayers()).toHaveLength(2);
      expect(markerRank(sync.get('a')!)).toBe(4);
      expect(markerRank(sync.get('b')!)).toBe(0);
    });

    it('reposiciona movendo o mesmo marcador para fora e de volta ao grupo', () => {
      sync.sync([spec('a'), spec('b')]);
      const a = sync.get('a')!;
      const removeLayers = vi.spyOn(group, 'removeLayers');
      const addLayers = vi.spyOn(group, 'addLayers');

      sync.sync([spec('a', { lng: -47.86 }), spec('b')]);

      expect(sync.get('a')).toBe(a);
      expect(a.getLatLng().lng).toBe(-47.86);
      expect(removeLayers).toHaveBeenCalledWith([a]);
      expect(addLayers).toHaveBeenCalledWith([a]);
      expect(group.hasLayer(a)).toBe(true);
    });

    it('não mexe no grupo quando nada muda', () => {
      sync.sync([spec('a'), spec('b')]);
      const spies = [vi.spyOn(group, 'addLayers'), vi.spyOn(group, 'removeLayers'), vi.spyOn(group, 'refreshClusters')];
      sync.sync([spec('a'), spec('b')]);
      spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    });

    it('recalcula o grupo quando a situação muda', () => {
      sync.sync([spec('a'), spec('b')]);
      const refresh = vi.spyOn(group, 'refreshClusters');
      sync.sync([spec('a', { iconKey: 'eq|radar|stolen|false', rank: 5 }), spec('b')]);
      expect(refresh).toHaveBeenCalledWith([sync.get('a')]);
      expect(markerRank(sync.get('a')!)).toBe(5);
    });

    it('adia a nova posição de quem está dentro de um grupo visível até o flush', () => {
      sync.sync([spec('a'), spec('b')]);
      const a = sync.get('a')!;
      const fakeCluster = {} as L.MarkerCluster;
      vi.spyOn(group, 'getVisibleParent').mockReturnValue(fakeCluster);
      const removeLayers = vi.spyOn(group, 'removeLayers');

      sync.sync([spec('a', { lat: -22.36 }), spec('b')]);
      expect(removeLayers).not.toHaveBeenCalled();
      expect(a.getLatLng().lat).toBe(-22.35);
      expect(sync.position('a')).toEqual([-22.36, -47.85]);

      // O mesmo destino no ciclo seguinte não gera trabalho novo.
      sync.sync([spec('a', { lat: -22.36 }), spec('b')]);
      expect(removeLayers).not.toHaveBeenCalled();

      sync.flush();
      expect(removeLayers).toHaveBeenCalledWith([a]);
      expect(a.getLatLng().lat).toBe(-22.36);
      expect(group.hasLayer(a)).toBe(true);
    });

    it('reposiciona na hora quem aparece sozinho no mapa', () => {
      sync.sync([spec('a')]);
      const a = sync.get('a')!;
      vi.spyOn(group, 'getVisibleParent').mockReturnValue(a as unknown as L.MarkerCluster);
      sync.sync([spec('a', { lat: -22.36 })]);
      expect(a.getLatLng().lat).toBe(-22.36);
    });

    it('remove do grupo o item que saiu da lista', () => {
      sync.sync([spec('a'), spec('b')]);
      const b = sync.get('b')!;
      sync.sync([spec('a')]);
      expect(group.hasLayer(b)).toBe(false);
      expect(group.getLayers()).toHaveLength(1);
    });
  });
});
