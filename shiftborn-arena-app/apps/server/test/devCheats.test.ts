import { BALANCE, Form, Mode } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import {
  decodeDevPayload, parseDevCommand,
} from '../src/dev/cheats.js';

describe('T-029 dev command parser', () => {
  it('AT-SEC-03 accepts all twelve exact commands and ASCII whitespace', () => {
    const cases = [
      ['/flux 0', { kind: 'flux', amount: 0 }],
      [`/flux ${BALANCE.flux.max}`, { kind: 'flux', amount: BALANCE.flux.max }],
      ['/hp .5', { kind: 'hp', fraction: 0.5 }],
      ['/form runner', { kind: 'form', form: Form.Runner }],
      ['/form beast', { kind: 'form', form: Form.Beast }],
      ['/form turret', { kind: 'form', form: Form.Turret }],
      ['/kill', { kind: 'kill' }],
      ['/unlock', { kind: 'unlock' }],
      ['/give pulsePistol', { kind: 'give', gun: 'pulsePistol' }],
      ['/endmatch', { kind: 'endmatch' }],
      [`/bots ${BALANCE.match.seats}`, { kind: 'bots', count: BALANCE.match.seats }],
      ['/difficulty easy', { kind: 'difficulty', difficulty: 'easy' }],
      ['/difficulty normal', { kind: 'difficulty', difficulty: 'normal' }],
      ['/difficulty hard', { kind: 'difficulty', difficulty: 'hard' }],
      ['/mode frenzy', { kind: 'mode', mode: Mode.Frenzy }],
      ['/mode zone', { kind: 'mode', mode: Mode.ZoneFrenzy }],
      ['/freeze', { kind: 'freeze' }],
      ['/tp -1.25 .5', { kind: 'tp', x: -1.25, y: 0.5 }],
    ] as const;
    for (const [input, command] of cases)
      expect(parseDevCommand(` \t${input}\n`)).toEqual({ ok: true, command });
  });

  it('AT-SEC-03 rejects syntax, range, coercion and unsupported commands', () => {
    for (const input of [
      '/give', '/give dagger', '/give pulsePistol extra', '', '   ', '/Flux 1', '/dummies on', '/unknown', '/kill now',
      '/flux', '/flux -1', `/flux ${BALANCE.flux.max + 1}`,
      '/flux NaN', '/flux Infinity', '/flux 0x10', '/flux 1e2', '/flux 1abc',
      '/hp -0.1', '/hp 1.1', '/form Runner', '/form tank',
      '/bots -1', `/bots ${BALANCE.match.seats + 1}`, '/bots 1.5',
      '/difficulty HARD', '/mode zoneFrenzy', '/freeze 1',
      '/tp 1', '/tp 1 2 3', '/tp 1e2 0', '/tp 0x10 0', '/unlock beast',
    ]) expect(parseDevCommand(input).ok).toBe(false);
  });

  it('AT-SEC-03 accepts only an ordinary one-field payload without mutating it', () => {
    const payload = Object.freeze({ cmd: '/kill' });
    expect(decodeDevPayload(payload)).toBe('/kill');
    expect(payload).toEqual({ cmd: '/kill' });
    for (const invalid of [
      null, [], new String('/kill'), Object.create({ cmd: '/kill' }),
      {}, { cmd: 1 }, { cmd: '' }, { cmd: '  ' },
      { cmd: '/kill', target: 'other' },
    ]) expect(decodeDevPayload(invalid)).toBeNull();
  });
});
