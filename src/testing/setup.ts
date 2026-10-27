/**
 * Preparação dos testes do painel (angular.json → test.options.setupFiles).
 *
 * No Node 25+, o próprio Node define um `localStorage` global que fica `undefined` sem a opção
 * `--localstorage-file` e encobre o do jsdom. Quando isso acontece, entra um Storage em memória,
 * para `npm test` funcionar em qualquer versão do Node sem variável de ambiente.
 */
class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const atual = (globalThis as { localStorage?: Storage }).localStorage;
if (!atual || typeof atual.clear !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
}
