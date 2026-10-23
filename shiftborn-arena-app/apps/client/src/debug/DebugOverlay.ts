export interface DebugMetrics {
  readonly rttMs: number | null;
  readonly serverTick: number | null;
  readonly localTick: number | null;
  readonly lastErrorM: number | null;
  readonly averageErrorM: number | null;
  readonly correctionsPerMinute: number | null;
  readonly bufferDepthTicks: number | null;
  readonly players: number | null;
  readonly shards: number | null;
  readonly projectiles: number | null;
  readonly inputScheme: string | null;
  readonly hpFrac: number | null;
  readonly flux: number | null;
}

function value(number: number | null, digits = 0): string {
  return number === null || !Number.isFinite(number) ? 'unavailable' :
    number.toFixed(digits);
}
function exact(number: number | null): string {
  return number === null || !Number.isFinite(number) ? 'unavailable' : String(number);
}

/** F3 diagnostics are measured from the existing renderer RAF, never a timer. */
export class DebugOverlay {
  readonly element = document.createElement('aside');
  private readonly frameMs: number[] = [];
  private lastPaintAt = -Infinity;

  constructor(stage: HTMLElement) {
    this.element.className = 'debug-overlay';
    this.element.dataset.debugOverlay = '';
    this.element.setAttribute('aria-label', 'Debug metrics');
    this.element.hidden = true;
    stage.append(this.element);
  }

  toggle(): void { this.element.hidden = !this.element.hidden; }

  updateFrame(atMs: number, durationMs: number | null, metrics: DebugMetrics): void {
    if (durationMs !== null && Number.isFinite(durationMs) && durationMs > 0) {
      this.frameMs.push(durationMs);
      if (this.frameMs.length > 60) this.frameMs.shift();
    }
    if (this.element.hidden || atMs - this.lastPaintAt < 250) return;
    this.lastPaintAt = atMs;
    const averageFrameMs = this.frameMs.length === 0 ? null :
      this.frameMs.reduce((sum, sample) => sum + sample, 0) / this.frameMs.length;
    const lines = [
      `FPS ${averageFrameMs === null ? 'unavailable' : value(1000 / averageFrameMs, 1)}`,
      `Frame ${value(averageFrameMs, 2)} ms`,
      `RTT ${value(metrics.rttMs, 1)} ms`,
      `Server tick ${value(metrics.serverTick)}`,
      `Local tick ${value(metrics.localTick)}`,
      `Prediction error last ${value(metrics.lastErrorM, 3)} m`,
      `Prediction error avg ${value(metrics.averageErrorM, 3)} m`,
      `Corrections/min ${value(metrics.correctionsPerMinute)}`,
      `Interpolation buffer ${value(metrics.bufferDepthTicks)} ticks`,
      `Entities players ${value(metrics.players)} · shards ${value(metrics.shards)} · projectiles ${value(metrics.projectiles)}`,
      `Input ${metrics.inputScheme ?? 'unavailable'}`,
      `hpFrac ${exact(metrics.hpFrac)} · Flux ${exact(metrics.flux)}`,
    ];
    this.element.textContent = lines.join('\n');
  }

  dispose(): void { this.element.remove(); this.frameMs.length = 0; }
}
