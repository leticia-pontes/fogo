/// <reference types="leaflet.markercluster" />
import type * as Leaflet from 'leaflet';

/** Descrição de um marcador a exibir; `iconKey` identifica ícones visualmente idênticos. */
export interface MarkerSpec {
  key: string;
  lat: number;
  lng: number;
  iconKey: string;
  zIndex: number;
  buildIcon: () => { html: string; size: number };
  tooltip: string;
  onClick: () => void;
  /** Gravidade da situação (maior = pior); usada pelo agrupamento para colorir o grupo. */
  rank?: number;
}

interface RankedMarkerOptions extends Leaflet.MarkerOptions {
  rank?: number;
}

/** Gravidade gravada no marcador por MarkerSync. */
export function markerRank(marker: Leaflet.Marker): number {
  return (marker.options as RankedMarkerOptions).rank ?? 0;
}

interface MarkerEntry {
  marker: Leaflet.Marker;
  iconKey: string;
  tooltip: string;
}

/**
 * Atualização incremental dos marcadores: cada um é criado uma vez e depois só move,
 * troca de ícone ou de tooltip quando algo muda. Ícones idênticos são compartilhados (cache).
 *
 * Numa camada agrupada (leaflet.markercluster), as mudanças são aplicadas em lote: o plugin
 * não reposiciona um marcador já agrupado, então os que se moveram saem e voltam ao grupo.
 * Quem está dentro de um grupo visível não aparece sozinho na tela: a nova posição fica
 * pendente até `flush()` (chamado no zoom), evitando redesenhar os grupos a cada ciclo.
 */
export class MarkerSync {
  private readonly entries = new Map<string, MarkerEntry>();
  private readonly iconCache = new Map<string, Leaflet.DivIcon>();
  private readonly cluster: Leaflet.MarkerClusterGroup | null;
  private readonly pending = new Map<Leaflet.Marker, [number, number]>();

  constructor(
    private readonly L: typeof Leaflet,
    private readonly layer: Leaflet.LayerGroup,
    options: { clustered?: boolean } = {}
  ) {
    this.cluster = options.clustered ? (layer as Leaflet.MarkerClusterGroup) : null;
  }

  sync(specs: MarkerSpec[]): void {
    const created: Leaflet.Marker[] = [];
    const moved: { marker: Leaflet.Marker; lat: number; lng: number }[] = [];
    const restyled: Leaflet.Marker[] = [];
    const seen = new Set<string>();
    for (const spec of specs) {
      seen.add(spec.key);
      this.upsert(spec, created, moved, restyled);
    }

    // Remove o que saiu do filtro ou foi excluído.
    const removed: Leaflet.Marker[] = [];
    for (const [key, entry] of this.entries) {
      if (seen.has(key)) continue;
      removed.push(entry.marker);
      this.entries.delete(key);
      this.pending.delete(entry.marker);
    }

    if (!this.cluster) {
      removed.forEach((m) => this.layer.removeLayer(m));
      created.forEach((m) => m.addTo(this.layer));
      moved.forEach(({ marker, lat, lng }) => marker.setLatLng([lat, lng]));
      return;
    }

    const now: typeof moved = [];
    for (const m of moved) {
      if (this.insideVisibleCluster(m.marker)) {
        this.pending.set(m.marker, [m.lat, m.lng]);
      } else {
        this.pending.delete(m.marker);
        now.push(m);
      }
    }
    this.relocate(now, removed, created);
    // Situação mudou: a cor do grupo que contém o marcador precisa ser recalculada.
    if (restyled.length) this.cluster.refreshClusters(restyled);
  }

  /** Aplica as posições pendentes (chamar quando o zoom muda e os grupos se refazem). */
  flush(): void {
    if (!this.cluster || !this.pending.size) return;
    const moved = [...this.pending].map(([marker, [lat, lng]]) => ({ marker, lat, lng }));
    this.pending.clear();
    this.relocate(moved, [], []);
  }

  private relocate(moved: { marker: Leaflet.Marker; lat: number; lng: number }[], removed: Leaflet.Marker[], created: Leaflet.Marker[]): void {
    const cluster = this.cluster!;
    const relocated = moved.map((m) => m.marker);
    if (removed.length || relocated.length) cluster.removeLayers([...removed, ...relocated]);
    moved.forEach(({ marker, lat, lng }) => marker.setLatLng([lat, lng]));
    if (created.length || relocated.length) cluster.addLayers([...created, ...relocated]);
  }

  private insideVisibleCluster(marker: Leaflet.Marker): boolean {
    const parent = this.cluster!.getVisibleParent(marker);
    return !!parent && parent !== marker;
  }

  /** Posição atual ou, se houver, a pendente. */
  position(key: string): [number, number] | undefined {
    const marker = this.entries.get(key)?.marker;
    if (!marker) return undefined;
    const { lat, lng } = marker.getLatLng();
    return this.pending.get(marker) ?? [lat, lng];
  }

  get(key: string): Leaflet.Marker | undefined {
    return this.entries.get(key)?.marker;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.layer.clearLayers();
    this.entries.clear();
    this.pending.clear();
  }

  private upsert(
    spec: MarkerSpec,
    created: Leaflet.Marker[],
    moved: { marker: Leaflet.Marker; lat: number; lng: number }[],
    restyled: Leaflet.Marker[]
  ): void {
    const entry = this.entries.get(spec.key);
    if (!entry) {
      const options: RankedMarkerOptions = { icon: this.icon(spec), zIndexOffset: spec.zIndex, rank: spec.rank };
      const marker = this.L.marker([spec.lat, spec.lng], options)
        .bindTooltip(spec.tooltip, { direction: 'top' })
        .on('click', spec.onClick);
      created.push(marker);
      this.entries.set(spec.key, { marker, iconKey: spec.iconKey, tooltip: spec.tooltip });
      return;
    }

    const { lat, lng } = entry.marker.getLatLng();
    const [curLat, curLng] = this.pending.get(entry.marker) ?? [lat, lng];
    if (curLat !== spec.lat || curLng !== spec.lng) moved.push({ marker: entry.marker, lat: spec.lat, lng: spec.lng });
    if (entry.iconKey !== spec.iconKey) {
      entry.marker.setIcon(this.icon(spec));
      entry.marker.setZIndexOffset(spec.zIndex);
      (entry.marker.options as RankedMarkerOptions).rank = spec.rank;
      entry.iconKey = spec.iconKey;
      restyled.push(entry.marker);
    }
    if (entry.tooltip !== spec.tooltip) {
      entry.marker.setTooltipContent(spec.tooltip);
      entry.tooltip = spec.tooltip;
    }
  }

  private icon(spec: MarkerSpec): Leaflet.DivIcon {
    let cached = this.iconCache.get(spec.iconKey);
    if (!cached) {
      const { html, size } = spec.buildIcon();
      cached = this.L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html });
      this.iconCache.set(spec.iconKey, cached);
    }
    return cached;
  }
}
