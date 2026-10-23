import { CloseCode } from '@shiftborn/shared';
import {
  AppStateController, type AppState, type ConnectionLauncher,
  type TimerApi,
} from './appState.js';
import {
  generateRoomCode, parseRoomQuery, validJoinRoomCode,
  type RoomQuery,
} from '../rooms/roomCode.js';
import {
  SettingsStore, type EntropySource, type Preferences, type StorageProvider,
} from '../settings/settings.js';
import { action, element } from '../ui/dom.js';
import { connectingScreen } from '../ui/screens/connectingScreen.js';
import { errorScreen } from '../ui/screens/errorScreen.js';
import { howToPlayScreen } from '../ui/screens/howToPlayScreen.js';
import { landingScreen } from '../ui/screens/landingScreen.js';
import { reconnectingScreen } from '../ui/screens/reconnectingScreen.js';
import { settingsScreen } from '../ui/screens/settingsScreen.js';
import { InputManager, type InputTransport } from '../input/InputManager.js';
import type { AuthoritativeRead, EventBatch } from '../net/messageValidation.js';
import { ArenaRenderer } from '../render/Renderer.js';
import { readEntitySnapshot } from '../render/entityState.js';
import { staticRenderState } from '../render/stateView.js';
import { Predictor } from '../predict/Predictor.js';
import { readPredictionAuthority } from '../predict/authoritative.js';
import type { LocalFeedback } from '../render/worldEventTimeline.js';
import { DebugOverlay } from '../debug/DebugOverlay.js';
import { DevConsole } from '../debug/DevConsole.js';
import type { Connection } from '../net/Connection.js';
import type { DevResult } from '../net/messageValidation.js';

export interface AppOptions {
  readonly buildId?: string;
  readonly search?: string;
  readonly storage?: StorageProvider;
  readonly entropy?: EntropySource;
  readonly launch?: ConnectionLauncher;
  readonly timers?: TimerApi;
  readonly reload?: () => void;
  readonly onDispose?: () => void;
  readonly inputTransport?: InputTransport;
  readonly serverTickEstimate?: () => number | null;
  readonly debugConnection?: Connection;
}

/** T-030: one screen at a time; T-031 supplies the connection launcher. */
export class App {
  readonly settings: SettingsStore;
  readonly controller: AppStateController;
  readonly prediction = new Predictor();
  private query: RoomQuery;
  private draftName: string;
  private draftCode: string;
  private panel: 'settings' | 'howToPlay' | null = null;
  private returnFocus: 'settings' | 'howToPlay' | null = null;
  private serverTick: number | null = null;
  private localPlayerId: string | null = null;
  private latestState: AuthoritativeRead | null = null;
  private arenaRenderer: ArenaRenderer | null = null;
  private inputManager: InputManager | null = null;
  private debugOverlay: DebugOverlay | null = null;
  private devConsole: DevConsole | null = null;
  private predictionUnavailable = false;
  private readonly localFeedbackListeners = new Set<(event: LocalFeedback) => void>();
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.panel !== null) {
      event.preventDefault();
      this.closePanel();
    } else if (this.controller.state.kind === 'connecting') {
      event.preventDefault();
      this.controller.cancel();
    }
  };

  constructor(private readonly root: HTMLElement, private readonly options: AppOptions = {}) {
    this.settings = new SettingsStore(options.storage, options.entropy);
    this.draftName = this.settings.snapshot().displayName;
    this.query = parseRoomQuery(options.search ?? window.location.search);
    this.draftCode = this.query.kind === 'invalid' ? this.query.entered : '';
    this.controller = new AppStateController(
      () => this.render(), options.launch, options.timers,
    );
    document.addEventListener('keydown', this.onKeyDown);
    this.render();
  }

  get state(): AppState { return this.controller.state; }
  get input(): InputManager | null { return this.inputManager; }
  get isPredictionUnavailable(): boolean { return this.predictionUnavailable; }

  subscribeLocalFeedback(listener: (event: LocalFeedback) => void): () => void {
    this.localFeedbackListeners.add(listener);
    return () => { this.localFeedbackListeners.delete(listener); };
  }

  private emitLocalFeedback(event: LocalFeedback): void {
    for (const listener of this.localFeedbackListeners) listener(event);
  }

  setLocalPlayerId(id: string): void {
    if (id !== this.localPlayerId) {
      this.prediction.reset();
      this.arenaRenderer?.resetTimeline();
      this.inputManager?.resetShotIntents();
    }
    this.localPlayerId = id;
    this.applyRenderState();
  }

  showAuthoritativeState(state: AuthoritativeRead): void {
    if (this.latestState !== null && this.latestState.matchId !== state.matchId)
      this.inputManager?.resetShotIntents();
    this.latestState = state;
    // Schema phase 1 is PLAYING; RESULTS may clear flights without expire events.
    this.arenaRenderer?.setProjectilesEnabled(state.phase === 1);
    const local = this.localPlayerId === null ? undefined : state.players[this.localPlayerId];
    if (local !== undefined && !local.alive) this.inputManager?.resetShotIntents();
    if (local !== undefined) this.emitLocalFeedback({ kind: 'vitals', tick: state.tick,
      hpFrac: local.hpFrac, flux: local.flux, alive: local.alive });
    if (this.localPlayerId !== null) {
      const authority = readPredictionAuthority(state, this.localPlayerId);
      this.predictionUnavailable = authority === null;
      if (authority === null) this.prediction.reset();
      else this.prediction.adopt(authority, performance.now());
    }
    this.showServerTick(state.tick);
    this.applyRenderState();
  }

  showEventBatch(batch: EventBatch): void {
    for (const feedback of this.arenaRenderer?.ingestEventBatch(batch,
      (seq) => this.inputManager?.confirmShotIntent(seq)) ?? [])
      this.emitLocalFeedback(feedback);
  }
  showDevResult(result: DevResult): void { this.devConsole?.result(result); }

  suspendInput(): void { this.inputManager?.suspend(); }
  recoverInput(lastInputSeq: number): void { this.inputManager?.recover(lastInputSeq); }
  resetPrediction(): void {
    this.prediction.reset();
    this.inputManager?.resetShotIntents();
  }
  resetPresentationTimeline(): void { this.arenaRenderer?.resetTimeline(); }

  showServerTick(tick: number): void {
    if (!Number.isInteger(tick) || tick < 0) return;
    this.serverTick = tick;
    const readout = this.root.querySelector<HTMLElement>('[data-server-tick]');
    if (readout !== null) readout.textContent = `Server tick ${tick}`;
  }

  private toggleCameraView(): void {
    const current = this.settings.snapshot().preferences.cameraView;
    const next = current === 'tpp' ? 'fpp' : 'tpp';
    this.settings.update('cameraView', next);
    this.updateCameraViewLabel();
    this.inputManager?.refreshPointerPresentation();
    this.applyRenderState();
  }

  private updateCameraViewLabel(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-camera-view]');
    if (button === null) return;
    const view = this.settings.snapshot().preferences.cameraView.toUpperCase();
    const mouseAimDisabled = view === 'FPP';
    button.textContent = `View: ${view} (V)${mouseAimDisabled ? ' · mouse aim off' : ''}`;
    button.setAttribute('aria-label', `Switch camera view, current ${view}${
      mouseAimDisabled ? ', mouse aim disabled' : ''}`);
  }

  /** T-031 may surface a normalized close code after joining. */
  reportClose(code?: number): void {
    this.controller.showCloseError(code);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.inputManager?.dispose();
    this.debugOverlay?.dispose();
    this.devConsole?.dispose();
    this.inputManager = null;
    this.arenaRenderer?.dispose();
    this.arenaRenderer = null;
    this.prediction.dispose();
    this.localFeedbackListeners.clear();
    this.controller.dispose();
    this.options.onDispose?.();
    this.root.replaceChildren();
  }

  private saveName(value: string): boolean {
    if (!this.settings.setName(value)) return false;
    this.draftName = this.settings.snapshot().displayName;
    return true;
  }

  private openPanel(panel: 'settings' | 'howToPlay'): void {
    this.panel = panel;
    this.render();
  }

  private closePanel(): void {
    this.returnFocus = this.panel;
    this.panel = null;
    this.render();
  }

  private render(): void {
    this.debugOverlay?.dispose(); this.debugOverlay = null;
    this.devConsole?.dispose(); this.devConsole = null;
    this.inputManager?.detach();
    this.arenaRenderer?.dispose();
    this.arenaRenderer = null;
    let view: { readonly screen: HTMLElement; readonly primary: HTMLElement };
    let stage: HTMLElement | null = null;
    const state = this.controller.state;
    if (state.kind !== 'inMatch' && state.kind !== 'reconnecting') {
      this.inputManager?.dispose();
      this.inputManager = null;
    } else if (state.kind === 'reconnecting') this.inputManager?.suspend();
    if (state.kind === 'connecting') {
      this.prediction.reset();
      this.latestState = null;
      this.localPlayerId = null;
      this.serverTick = null;
    }
    if (state.kind === 'landing' && this.panel === 'settings') {
      view = settingsScreen(this.settings.snapshot(), {
        update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
          this.settings.update(key, value);
        },
        back: () => this.closePanel(),
      });
    } else if (state.kind === 'landing' && this.panel === 'howToPlay') {
      view = howToPlayScreen(() => this.closePanel());
    } else if (state.kind === 'landing') {
      view = landingScreen(
        this.draftName, this.draftCode, this.query, this.options.buildId ?? 'dev',
        {
          nameChanged: (name) => { this.draftName = name; },
          codeChanged: (code) => { this.draftCode = code; },
          saveName: (name) => this.saveName(name),
          play: (name) => this.controller.start({ kind: 'quick', name, code: '' }),
          create: (name) => this.controller.start({
            kind: 'create', name, code: generateRoomCode(this.options.entropy),
          }),
          join: (name, entered) => {
            const code = validJoinRoomCode(entered);
            if (code === null) return false;
            this.draftCode = code;
            this.controller.start({ kind: 'join', name, code });
            return true;
          },
          howToPlay: () => this.openPanel('howToPlay'),
          settings: () => this.openPanel('settings'),
        },
      );
    } else if (state.kind === 'connecting') {
      view = connectingScreen(state.intent, () => this.controller.cancel());
    } else if (state.kind === 'reconnecting') {
      view = reconnectingScreen();
    } else if (state.kind === 'error') {
      const leaveInvalidRoom = (): void => {
        if (state.closeCode === CloseCode.InvalidRoomCode) {
          this.query = { kind: 'none' };
          this.draftCode = state.intent.code;
        }
      };
      view = errorScreen(state, () => {
        leaveInvalidRoom();
        this.controller.actOnError(this.options.reload ?? (() => window.location.reload()));
      }, () => {
        leaveInvalidRoom();
        this.controller.home();
      });
    } else {
      const screen = element('main', 'match-screen');
      screen.setAttribute('aria-label', 'Arena match');
      stage = element('div', 'arena-stage');
      stage.setAttribute('aria-label', 'Greybox arena map');
      const overlay = element('div', 'match-overlay');
      const tick = element('p', 'match-tick', this.serverTick === null
        ? 'Waiting for server state' : `Server tick ${this.serverTick}`);
      tick.dataset.serverTick = '';
      tick.setAttribute('role', 'status');
      const primary = action('Back to menu', 'button button-secondary match-exit');
      primary.addEventListener('click', () => this.controller.home());
      const cameraView = action('', 'button button-secondary match-view');
      cameraView.dataset.cameraView = '';
      cameraView.addEventListener('click', () => this.toggleCameraView());
      const actions = element('div', 'match-actions');
      actions.append(cameraView, primary);
      overlay.append(tick, actions);
      screen.append(stage, overlay);
      view = { screen, primary };
    }
    this.root.replaceChildren(view.screen);
    if (stage !== null) this.updateCameraViewLabel();
    if (stage !== null) {
      try {
        this.arenaRenderer = new ArenaRenderer(stage, () => {
          this.arenaRenderer = null;
          this.controller.showCloseError(CloseCode.InternalRoomError);
        });
        this.arenaRenderer.setLocalPresentation(() =>
          this.prediction.presentation(performance.now()));
        this.arenaRenderer.setClockEstimate(this.options.serverTickEstimate ?? null);
        if (import.meta.env.DEV) this.debugOverlay = new DebugOverlay(stage);
        if (this.options.debugConnection !== undefined)
          this.devConsole = new DevConsole(stage, this.options.debugConnection,
            (open) => {
              this.inputManager?.setModalOpen(open);
              if (!open) this.arenaRenderer?.renderer.domElement.focus();
            });
        this.arenaRenderer.setFrameObserver((at, frameMs) => {
          const renderer = this.arenaRenderer;
          const overlay = this.debugOverlay;
          if (renderer === null || overlay === null) return;
          const local = this.localPlayerId === null ? undefined :
            this.latestState?.players[this.localPlayerId];
          const prediction = this.prediction.metrics(at);
          const counts = renderer.debugCounts;
          overlay.updateFrame(at, frameMs, {
            rttMs: this.options.debugConnection?.clock.medianRttMs() ?? null,
            serverTick: this.serverTick,
            localTick: this.prediction.localTick,
            lastErrorM: prediction.lastErrorM,
            averageErrorM: prediction.averageErrorM,
            correctionsPerMinute: this.prediction.localTick === null ? null :
              prediction.correctionsPerMinute,
            bufferDepthTicks: counts.bufferDepthTicks,
            players: this.latestState === null ? null : counts.players,
            shards: this.latestState === null ? null : counts.shards,
            projectiles: this.latestState === null ? null : counts.projectiles,
            inputScheme: this.inputManager?.sampledFrame?.aimSource ?? null,
            hpFrac: local?.hpFrac ?? null, flux: local?.flux ?? null,
          });
        });
        this.applyRenderState();
        if (this.inputManager === null) {
          this.inputManager = new InputManager({
            transport: this.options.inputTransport ?? { sendInput: () => true },
            fireMode: () => this.settings.snapshot().preferences.fireMode,
            player: () => {
              if (this.localPlayerId === null) return null;
              const predicted = this.prediction.presentation(performance.now());
              if (predicted !== null) return {
                x: predicted.x, y: predicted.y, aim: predicted.aim };
              const player = this.latestState?.players[this.localPlayerId];
              return player === undefined ? null :
                { x: player.x, y: player.y, aim: player.aim };
            },
            camera: () => this.arenaRenderer?.camera ?? null,
            perspective: () => this.settings.snapshot().preferences.cameraView,
            onAim: (radians, distanceM) =>
              this.arenaRenderer?.setLocalAim(radians, distanceM),
            onFrame: (frame) => {
              const shots = this.prediction.onFrame(frame);
              if (shots.length > 0) {
                this.inputManager?.rememberShotIntents(shots, performance.now());
                this.arenaRenderer?.startPredictedShots(shots, performance.now());
              }
            },
            onUrgentInput: () => this.arenaRenderer?.sampleInputNow(),
            onAction: (action) => {
              if (action === 'cameraView') this.toggleCameraView();
              else if (action === 'debugOverlay') this.debugOverlay?.toggle();
              else if (action === 'hitboxView')
                this.arenaRenderer?.hitboxes.setVisible(!this.arenaRenderer.hitboxes.visible);
              else if (action === 'devConsole') this.devConsole?.toggle();
            },
            devBuild: import.meta.env.DEV,
            serverCheatsAllowed: () =>
              this.options.debugConnection?.canUseDevConsole === true,
          });
        }
        this.inputManager.attach(this.arenaRenderer.renderer.domElement, stage);
        this.inputManager.setActive(true);
        this.arenaRenderer.setFixedStep(() => { this.inputManager?.tick(); });
      } catch {
        this.controller.showCloseError(CloseCode.InternalRoomError);
        return;
      }
    }
    const returning = state.kind === 'landing' && this.panel === null && this.returnFocus !== null
      ? view.screen.querySelector<HTMLButtonElement>(`button[data-action="${this.returnFocus}"]`)
      : null;
    const firstSetting = state.kind === 'landing' && this.panel === 'settings'
      ? view.screen.querySelector<HTMLInputElement>('input') : null;
    (returning ?? firstSetting ?? view.primary).focus();
    this.returnFocus = null;
  }

  private applyRenderState(): void {
    if (this.arenaRenderer === null || this.latestState === null ||
      this.localPlayerId === null) return;
    const state = staticRenderState(this.latestState, this.localPlayerId,
      this.settings.snapshot().preferences.reducedMotion,
      this.settings.snapshot().preferences.cameraView);
    if (state === null) return;
    this.arenaRenderer.setProjectilesEnabled(this.latestState.phase === 1);
    this.arenaRenderer.setView(state.view);
    this.arenaRenderer.setEntities(readEntitySnapshot(this.latestState, this.localPlayerId));
  }
}
