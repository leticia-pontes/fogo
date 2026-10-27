import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Comprovante } from '../../core/comprovante';
import { ComprovanteModalComponent } from './comprovante-modal.component';

const COMPROVANTE: Comprovante = {
  id: 'OC-0042',
  selo: 'ENCERRADA',
  subtitulo: 'FURTO · CÂMERA DE MONITORAMENTO',
  campos: [
    { rotulo: 'Equipamento', valor: 'HK-20417 · Hikvision' },
    { rotulo: 'Bairro', valor: 'Entroncamento' },
    { rotulo: 'Duração', valor: '47 min' },
  ],
  cidade: [
    { rotulo: 'Disponibilidade', antes: '75%', agora: '76%' },
    { rotulo: 'Saúde do bairro', antes: '47', agora: '49' },
  ],
  prometheus: 'Furto resolvido em 47 minutos. Não precisa agradecer.',
  emitidoEm: 'Emitido em 27/10/2026 às 15:19',
  aviso: 'Documento interno de demonstração. Valores estimados por regras.',
  textoPlano: 'TEXTO PLANO DO CUPOM\n',
};

@Component({
  standalone: true,
  imports: [ComprovanteModalComponent],
  template: `
    @if (aberto()) {
      <app-comprovante-modal [comprovante]="comprovante" [linkCelular]="link()" (fechar)="aberto.set(false)" />
    }
  `,
})
class HostComponent {
  readonly aberto = signal(true);
  readonly link = signal<string | null>(null);
  readonly comprovante = COMPROVANTE;
}

describe('ComprovanteModalComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renderiza todos os campos, o selo e a frase da PROMETHEUS', () => {
    const { el } = render();
    const texto = el.textContent ?? '';
    expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    for (const l of COMPROVANTE.campos) {
      expect(texto).toContain(l.rotulo);
      expect(texto).toContain(l.valor);
    }
    for (const l of COMPROVANTE.cidade) expect(texto).toContain(`${l.antes} → ${l.agora}`);
    expect(el.querySelector('.tk-seal')?.textContent).toBe('ENCERRADA');
    expect(texto).toContain(COMPROVANTE.prometheus);
    expect(texto).toContain(COMPROVANTE.aviso);
    expect(document.activeElement?.textContent).toContain('Imprimir ou salvar PDF');
  });

  it('"Copiar texto" copia o textoPlano e mostra o feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { fixture, el } = render();
    const botao = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Copiar texto'))!;
    botao.click();
    await new Promise((r) => queueMicrotask(() => r(null))); // só a cópia; whenStable esperaria o timer de 2 s
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(COMPROVANTE.textoPlano);
    expect(botao.textContent).toContain('Copiado!');
  });

  it('mostra o QR Code com o link do celular; sem link (offline), só o aviso', () => {
    const { fixture, el } = render();
    expect(el.querySelector('.cm-qr-code')).toBeNull();
    expect(el.textContent).toContain('disponível com o servidor conectado');
    fixture.componentInstance.link.set('http://192.168.0.10:3000/api/comprovantes/OC-0042');
    fixture.detectChanges();
    const qr = el.querySelector('.cm-qr-code')!;
    expect(qr.getAttribute('href')).toBe('http://192.168.0.10:3000/api/comprovantes/OC-0042');
    expect(qr.querySelector('path')!.getAttribute('d')).toMatch(/^M4 4h1v1h-1z/);
  });

  it('ESC fecha o modal', () => {
    const { fixture, el } = render();
    el.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.aberto()).toBe(false);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
