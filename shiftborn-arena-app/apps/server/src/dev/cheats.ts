import { BALANCE, Form, Mode, Phase } from '@shiftborn/shared';
import {
  administrativelyEliminate, administrativelyTeleport, setAdministrativeFlux,
  setAdministrativeForm, setAdministrativeHealth, type PlayerRecord, type World,
} from '@shiftborn/sim';
import type { BotDifficulty } from '../config.js';

export type DevCommand =
  | { readonly kind: 'flux'; readonly amount: number }
  | { readonly kind: 'hp'; readonly fraction: number }
  | { readonly kind: 'form'; readonly form: Form }
  | { readonly kind: 'kill' }
  | { readonly kind: 'endmatch' }
  | { readonly kind: 'bots'; readonly count: number }
  | { readonly kind: 'difficulty'; readonly difficulty: BotDifficulty }
  | { readonly kind: 'mode'; readonly mode: Mode }
  | { readonly kind: 'freeze' }
  | { readonly kind: 'tp'; readonly x: number; readonly y: number };

export interface DevResult {
  readonly ok: boolean;
  readonly text: string;
}

export interface DevExecution extends DevResult {
  readonly mutated: boolean;
}

export interface DevEnvironment {
  readonly world: World;
  readonly player: PlayerRecord;
  setBotCount(count: number): boolean;
  setDifficulty(value: BotDifficulty): void;
  setMode(value: Mode): void;
  toggleFreeze(): boolean;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

/** NETWORK_PROTOCOL §5.1: no coercion, inherited fields, or extra payload data. */
export function decodeDevPayload(value: unknown): string | null {
  if (!plainRecord(value) || Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, 'cmd') || typeof value.cmd !== 'string' ||
    value.cmd.trim().length === 0) return null;
  return value.cmd;
}

const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const UNSIGNED_INTEGER = /^\d+$/;

function decimal(token: string | undefined): number | null {
  if (token === undefined || !DECIMAL.test(token)) return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

function integer(token: string | undefined): number | null {
  if (token === undefined || !UNSIGNED_INTEGER.test(token)) return null;
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : null;
}

export type DevParseResult =
  | { readonly ok: true; readonly command: DevCommand }
  | { readonly ok: false; readonly text: string };

function invalid(): DevParseResult {
  return { ok: false, text: 'Invalid command or arguments.' };
}

/** T-029: exact lowercase grammar; command text is never evaluated. */
export function parseDevCommand(text: string): DevParseResult {
  const tokens = text.trim().split(/[\t\n\v\f\r ]+/);
  const [name, first, second] = tokens;
  switch (name) {
    case '/flux': {
      const amount = decimal(first);
      return tokens.length === 2 && amount !== null &&
        amount >= 0 && amount <= BALANCE.flux.max
        ? { ok: true, command: { kind: 'flux', amount } } : invalid();
    }
    case '/hp': {
      const fraction = decimal(first);
      return tokens.length === 2 && fraction !== null &&
        fraction >= 0 && fraction <= 1
        ? { ok: true, command: { kind: 'hp', fraction } } : invalid();
    }
    case '/form': {
      const form = first === 'runner' ? Form.Runner : first === 'beast' ?
        Form.Beast : first === 'turret' ? Form.Turret : null;
      return tokens.length === 2 && form !== null
        ? { ok: true, command: { kind: 'form', form } } : invalid();
    }
    case '/kill':
      return tokens.length === 1 ? { ok: true, command: { kind: 'kill' } } : invalid();
    case '/endmatch':
      return tokens.length === 1 ? { ok: true, command: { kind: 'endmatch' } } : invalid();
    case '/bots': {
      const count = integer(first);
      return tokens.length === 2 && count !== null && count <= BALANCE.match.seats
        ? { ok: true, command: { kind: 'bots', count } } : invalid();
    }
    case '/difficulty': {
      const difficulty = first === 'easy' ? 'easy' : first === 'normal' ?
        'normal' : first === 'hard' ? 'hard' : null;
      return tokens.length === 2 && difficulty !== null
        ? { ok: true, command: { kind: 'difficulty', difficulty } } : invalid();
    }
    case '/mode': {
      const mode = first === 'frenzy' ? Mode.Frenzy :
        first === 'zone' ? Mode.ZoneFrenzy : null;
      return tokens.length === 2 && mode !== null
        ? { ok: true, command: { kind: 'mode', mode } } : invalid();
    }
    case '/freeze':
      return tokens.length === 1 ? { ok: true, command: { kind: 'freeze' } } : invalid();
    case '/tp': {
      const x = decimal(first);
      const y = decimal(second);
      return tokens.length === 3 && x !== null && y !== null
        ? { ok: true, command: { kind: 'tp', x, y } } : invalid();
    }
    default:
      return { ok: false, text: 'Unknown command.' };
  }
}

function success(text: string, mutated = true): DevExecution {
  return { ok: true, text, mutated };
}

function failure(text: string): DevExecution {
  return { ok: false, text, mutated: false };
}

/** T-029: execute a previously parsed command at the room tick boundary. */
export function executeDevCommand(command: DevCommand, env: DevEnvironment): DevExecution {
  const { world, player } = env;
  switch (command.kind) {
    case 'flux':
      setAdministrativeFlux(player, command.amount);
      return success(`Flux set to ${command.amount}.`);
    case 'hp':
      return setAdministrativeHealth(world, player, command.fraction)
        ? success(command.fraction === 0 ? 'Player eliminated.' :
          `Health set to ${command.fraction}.`)
        : failure('Player is not alive.');
    case 'form':
      return setAdministrativeForm(world, player, command.form)
        ? success(`Form set to ${command.form}.`)
        : failure('Player is not alive.');
    case 'kill':
      return administrativelyEliminate(world, player)
        ? success('Player eliminated.') : failure('Player is not alive.');
    case 'endmatch':
      if (world.phase !== Phase.Playing) return failure('Match is not playing.');
      world.phaseEndTick = world.tick;
      return success('Match ending.');
    case 'bots':
      return env.setBotCount(command.count)
        ? success(`Bot count set to ${command.count}.`)
        : failure('Bot count cannot fit beside human players.');
    case 'difficulty':
      env.setDifficulty(command.difficulty);
      return success(`Bot difficulty set to ${command.difficulty}.`);
    case 'mode':
      env.setMode(command.mode);
      return success('Mode applies at the next countdown.');
    case 'freeze':
      return success(`Bots frozen ${env.toggleFreeze() ? 'on' : 'off'}.`);
    case 'tp': {
      const pos = administrativelyTeleport(world, player, command.x, command.y);
      return pos === null ? failure('No safe teleport position.') :
        success(`Teleported to ${pos.x}, ${pos.y}.`);
    }
  }
}
