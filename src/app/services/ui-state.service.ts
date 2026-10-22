import { Injectable, signal } from '@angular/core';

export type ActiveModuleTab = 'ops' | 'predictive';

/** Pedido para o inventário ao abrir: criar um item novo ou editar um existente. */
export type InventoryRequest =
  | { mode: 'create'; kind: 'equipment' | 'agent'; hintAutofill?: boolean }
  | { mode: 'edit'; kind: 'equipment' | 'agent'; id: string }
  | null;

/** Foco do mapa disparado de fora da Central (missão, cenários, voz). */
export type MapFocus =
  | { kind: 'district'; name: string; seq: number }
  | { kind: 'point'; lat: number; lng: number; seq: number }
  | null;

/** Estado de navegação compartilhado entre o app, a missão de calibração e os cenários. */
@Injectable({ providedIn: 'root' })
export class UiStateService {
  readonly activeTab = signal<ActiveModuleTab>('ops');
  readonly inventoryOpen = signal(false);
  readonly inventoryRequest = signal<InventoryRequest>(null);
  readonly mapFocus = signal<MapFocus>(null);
  readonly toast = signal<{ id: number; text: string; tone: 'good' | 'bad' | 'info' } | null>(null);

  private seq = 0;

  /** Mensagem curta no topo da tela, que some sozinha. */
  notify(text: string, tone: 'good' | 'bad' | 'info' = 'info', ms = 3200): void {
    const id = ++this.seq;
    this.toast.set({ id, text, tone });
    setTimeout(() => {
      if (this.toast()?.id === id) this.toast.set(null);
    }, ms);
  }

  openInventory(request: InventoryRequest = null): void {
    this.inventoryRequest.set(request);
    this.inventoryOpen.set(true);
  }

  closeInventory(): void {
    this.inventoryOpen.set(false);
    this.inventoryRequest.set(null);
  }

  /** Fecha o inventário (se aberto) e leva o usuário à Central. */
  goToMap(): void {
    this.closeInventory();
    this.activeTab.set('ops');
  }

  focusDistrict(name: string): void {
    this.mapFocus.set({ kind: 'district', name, seq: ++this.seq });
  }

  focusPoint(lat: number, lng: number): void {
    this.mapFocus.set({ kind: 'point', lat, lng, seq: ++this.seq });
  }
}
