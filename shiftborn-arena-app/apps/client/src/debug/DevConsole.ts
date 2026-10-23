import type { DevResult } from '../net/messageValidation.js';

export interface DevConsoleTransport {
  readonly canUseDevConsole: boolean;
  sendDevCommand(command: string): boolean;
}

/** Backtick UI; the Connection alone owns the authorized transport. */
export class DevConsole {
  readonly element = document.createElement('section');
  readonly input = document.createElement('input');
  readonly output = document.createElement('div');
  private readonly history: string[] = [];
  private historyIndex = 0;
  private readonly lines: HTMLElement[] = [];

  constructor(stage: HTMLElement, private readonly transport: DevConsoleTransport,
    private readonly onOpenChanged: (open: boolean) => void) {
    this.element.className = 'dev-console';
    this.element.dataset.devConsole = '';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Development console');
    this.output.className = 'dev-console-output';
    this.output.setAttribute('role', 'log');
    this.input.className = 'dev-console-input';
    this.input.setAttribute('aria-label', 'Development command');
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.addEventListener('keydown', this.onKeyDown);
    this.element.append(this.output, this.input);
    stage.append(this.element);
  }

  get open(): boolean { return !this.element.hidden; }
  toggle(): void {
    if (this.open) { this.close(); return; }
    if (!this.transport.canUseDevConsole) return;
    this.element.hidden = false;
    this.onOpenChanged(true);
    this.input.focus();
  }
  close(): void {
    if (!this.open) return;
    this.element.hidden = true;
    this.input.value = '';
    this.onOpenChanged(false);
  }
  result(result: DevResult): void {
    if (!this.transport.canUseDevConsole) return;
    this.line(result.text, result.ok ? 'ok' : 'error');
  }
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' || event.code === 'Backquote') {
      event.preventDefault(); event.stopPropagation(); this.close(); return;
    }
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault(); event.stopPropagation();
      this.historyIndex = Math.max(0, Math.min(this.history.length,
        this.historyIndex + (event.code === 'ArrowUp' ? -1 : 1)));
      this.input.value = this.history[this.historyIndex] ?? '';
      return;
    }
    if (event.code !== 'Enter') return;
    event.preventDefault(); event.stopPropagation();
    const command = this.input.value.trim();
    this.input.value = '';
    if (command === '') return;
    if (!this.transport.sendDevCommand(command)) {
      this.line('Command unavailable.', 'error');
      if (!this.transport.canUseDevConsole) this.close();
      return;
    }
    this.history.push(command);
    if (this.history.length > 20) this.history.shift();
    this.historyIndex = this.history.length;
    this.line(`> ${command}`, 'command');
  };
  private line(text: string, kind: string): void {
    const line = document.createElement('p');
    line.className = `dev-console-${kind}`;
    line.textContent = text;
    this.output.append(line);
    this.lines.push(line);
    if (this.lines.length > 40) this.lines.shift()?.remove();
    this.output.scrollTop = this.output.scrollHeight;
  }
  dispose(): void {
    this.close();
    this.input.removeEventListener('keydown', this.onKeyDown);
    this.history.length = 0; this.lines.length = 0;
    this.element.remove();
  }
}
