import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloseCode } from '@shiftborn/shared';
import {
  AppStateController, CONNECTION_TIMEOUT_MS, errorPresentation,
  type AppState, type ConnectionAttempt, type ConnectionIntent,
} from '../src/app/appState.js';

const quick: ConnectionIntent = { kind: 'quick', name: 'Player_1', code: '' };
const join: ConnectionIntent = { kind: 'join', name: 'Player_1', code: 'ABC234' };
const create: ConnectionIntent = { kind: 'create', name: 'Player_1', code: 'ABC234' };

function harness() {
  const attempts: { intent: ConnectionIntent; attempt: ConnectionAttempt }[] = [];
  const states: AppState[] = [];
  const controller = new AppStateController(
    (state) => states.push(state),
    (intent, attempt) => { attempts.push({ intent, attempt }); },
  );
  return { attempts, states, controller };
}

afterEach(() => vi.useRealTimers());

describe('AppStateController', () => {
  it('transitions through landing, connecting, inMatch, error and home', () => {
    vi.useFakeTimers();
    const { attempts, states, controller } = harness();
    expect(controller.state).toEqual({ kind: 'landing' });
    controller.start(quick);
    expect(controller.state).toEqual({ kind: 'connecting', intent: quick });
    attempts[0]?.attempt.joined();
    expect(controller.state).toEqual({ kind: 'inMatch', intent: quick });
    vi.advanceTimersByTime(CONNECTION_TIMEOUT_MS + 1);
    expect(controller.state.kind).toBe('inMatch');
    controller.showCloseError(CloseCode.InvalidInput);
    expect(controller.state).toEqual({
      kind: 'error', reason: 'close', closeCode: CloseCode.InvalidInput, intent: quick,
    });
    expect(attempts[0]?.attempt.signal.aborted).toBe(true);
    controller.home();
    expect(controller.state).toEqual({ kind: 'landing' });
    expect(states.map((state) => state.kind)).toEqual(['connecting', 'inMatch', 'error', 'landing']);
  });

  it('cancel aborts, clears timeout, and ignores stale callbacks', () => {
    vi.useFakeTimers();
    const { attempts, controller } = harness();
    controller.start(join);
    controller.cancel();
    expect(attempts[0]?.attempt.signal.aborted).toBe(true);
    expect(controller.state.kind).toBe('landing');
    attempts[0]?.attempt.joined();
    attempts[0]?.attempt.failed(CloseCode.RoomFull);
    vi.advanceTimersByTime(CONNECTION_TIMEOUT_MS);
    expect(controller.state.kind).toBe('landing');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces active attempts and ignores old completion or rejection', async () => {
    vi.useFakeTimers();
    let rejectOld: ((reason?: unknown) => void) | undefined;
    const attempts: ConnectionAttempt[] = [];
    const controller = new AppStateController(() => undefined, (_intent, attempt) => {
      attempts.push(attempt);
      return attempts.length === 1 ? new Promise<void>((_resolve, reject) => { rejectOld = reject; }) : undefined;
    });
    controller.start(quick);
    controller.start(create);
    expect(attempts[0]?.signal.aborted).toBe(true);
    attempts[0]?.joined();
    rejectOld?.(new Error('stale'));
    await Promise.resolve();
    expect(controller.state).toEqual({ kind: 'connecting', intent: create });
    attempts[1]?.joined();
    expect(controller.state).toEqual({ kind: 'inMatch', intent: create });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out at exactly 10,000 ms and retries a copied request', () => {
    vi.useFakeTimers();
    const { attempts, controller } = harness();
    controller.start(join);
    vi.advanceTimersByTime(CONNECTION_TIMEOUT_MS - 1);
    expect(controller.state.kind).toBe('connecting');
    vi.advanceTimersByTime(1);
    expect(controller.state).toEqual({ kind: 'error', reason: 'timeout', intent: join });
    expect(attempts[0]?.attempt.signal.aborted).toBe(true);
    attempts[0]?.attempt.joined();
    expect(controller.state.kind).toBe('error');
    controller.actOnError(() => { throw new Error('must not reload'); });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.intent).toEqual(join);
    expect(attempts[1]?.intent).not.toBe(join);
    expect(attempts[1]?.attempt.signal).not.toBe(attempts[0]?.attempt.signal);
    controller.dispose();
    expect(attempts[1]?.attempt.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    attempts[1]?.attempt.joined();
    expect(controller.state.kind).toBe('connecting');
  });

  it('handles launch failure without exposing exception text', async () => {
    const thrown = new AppStateController(() => undefined, () => { throw new Error('secret'); });
    thrown.start(quick);
    expect(thrown.state.kind).toBe('error');
    if (thrown.state.kind === 'error')
      expect(errorPresentation(thrown.state).message).toBe('Something went wrong.');

    const rejected = new AppStateController(() => undefined,
      () => Promise.reject(new Error('secret')));
    rejected.start(quick);
    await Promise.resolve();
    await Promise.resolve();
    expect(rejected.state.kind).toBe('error');
  });

  it('rejects invalid intents before starting timers', () => {
    vi.useFakeTimers();
    const { controller } = harness();
    expect(() => controller.start({ kind: 'join', name: 'Player_1', code: 'BAD' })).toThrow(TypeError);
    expect(() => controller.start({ kind: 'quick', name: '<bad>', code: '' })).toThrow(TypeError);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('close-code actions', () => {
  const cases: [number, string, string, 'reload' | 'quick' | 'home' | 'retry'][] = [
    [CloseCode.VersionMismatch, 'A new version is available.', 'Reload', 'reload'],
    [CloseCode.RoomFull, 'That room is full.', 'Play', 'quick'],
    [CloseCode.InvalidRoomCode, 'Room code not found.', 'Back to join', 'home'],
    [CloseCode.InvalidInput, 'Disconnected.', 'Play again', 'retry'],
    [CloseCode.ServerShuttingDown, 'The server is restarting.', 'Play again', 'retry'],
    [CloseCode.InternalRoomError, 'Something went wrong.', 'Play again', 'retry'],
    [4999, 'Something went wrong.', 'Play again', 'retry'],
  ];

  it.each(cases)('maps close code %i to its safe presentation and action', (code, message, label, action) => {
    vi.useFakeTimers();
    const { controller, attempts } = harness();
    controller.start(join);
    attempts[0]?.attempt.failed(code);
    expect(controller.state.kind).toBe('error');
    if (controller.state.kind !== 'error') throw new Error('expected error state');
    expect(errorPresentation(controller.state)).toEqual({ message, label, action });
    let reloads = 0;
    controller.actOnError(() => { reloads += 1; });
    if (action === 'reload') {
      expect(reloads).toBe(1);
      expect(controller.state.kind).toBe('error');
    } else if (action === 'home') {
      expect(controller.state.kind).toBe('landing');
    } else {
      expect(controller.state).toEqual({
        kind: 'connecting', intent: action === 'quick' ? quick : join,
      });
      expect(attempts[1]?.attempt.signal).not.toBe(attempts[0]?.attempt.signal);
    }
    controller.dispose();
  });
});
