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
import { settingsScreen } from '../ui/screens/settingsScreen.js';

export interface AppOptions {
  readonly buildId?: string;
  readonly search?: string;
  readonly storage?: StorageProvider;
  readonly entropy?: EntropySource;
  readonly launch?: ConnectionLauncher;
  readonly timers?: TimerApi;
  readonly reload?: () => void;
}

/** T-030: one screen at a time; T-031 supplies the connection launcher. */
export class App {
  readonly settings: SettingsStore;
  readonly controller: AppStateController;
  private query: RoomQuery;
  private draftName: string;
  private draftCode: string;
  private panel: 'settings' | 'howToPlay' | null = null;
  private returnFocus: 'settings' | 'howToPlay' | null = null;
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

  /** T-031 may surface a normalized close code after joining. */
  reportClose(code?: number): void {
    this.controller.showCloseError(code);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.controller.dispose();
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
    let view: { readonly screen: HTMLElement; readonly primary: HTMLElement };
    const state = this.controller.state;
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
      const screen = element('main', 'screen compact-screen');
      const frame = element('section', 'arena-frame compact-frame');
      frame.append(element('p', 'eyebrow', 'Arena access'),
        element('h1', 'screen-title', 'Match ready'));
      const primary = action('Back to menu', 'button button-secondary');
      primary.addEventListener('click', () => this.controller.home());
      frame.append(primary);
      screen.append(frame);
      view = { screen, primary };
    }
    this.root.replaceChildren(view.screen);
    const returning = state.kind === 'landing' && this.panel === null && this.returnFocus !== null
      ? view.screen.querySelector<HTMLButtonElement>(`button[data-action="${this.returnFocus}"]`)
      : null;
    const firstSetting = state.kind === 'landing' && this.panel === 'settings'
      ? view.screen.querySelector<HTMLInputElement>('input') : null;
    (returning ?? firstSetting ?? view.primary).focus();
    this.returnFocus = null;
  }
}
