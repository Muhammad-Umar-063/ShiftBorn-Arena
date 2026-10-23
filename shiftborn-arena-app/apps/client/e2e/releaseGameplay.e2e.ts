import { expect, test } from '@playwright/test';

// This suite intentionally fails when the trusted local server is unavailable.
for (const search of ['', '?lag=150&jitter=20&loss=2']) {
  test(`T-057 real browser loot, KO unlocks, ammunition, death and reconnect ${search || 'normal'}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`http://localhost:5173/${search}`);
    const evidence = await page.evaluate(async ({ port, search }) => {
      const { Connection } = await import('/src/net/Connection.ts');
      type Player = { alive: boolean; kos: number; unlockedMask: number; gunOwnedMask: number;
        gunMag: number[]; gunReserve: number[]; reloadGun: number; reloadEndTick: number;
        form: number; protectedEndTick: number; lastInputSeq: number };
      const first = new Connection({ endpoint: `ws://127.0.0.1:${port}`, search, frames: null });
      const second = new Connection({ endpoint: `ws://127.0.0.1:${port}`, search, frames: null });
      const traces: string[] = []; const errors: string[] = [];
      const inputs = new Map([[first, { seq: 0, buttons: 0 }], [second, { seq: 0, buttons: 0 }]]);
      const results = new Map([[first, [] as { ok: boolean; text: string }[]], [second, [] as { ok: boolean; text: string }[]]]);
      const ids = new Map<typeof first, string>(); let recovered = false;
      const abort = new AbortController();
      const read = (c: typeof first): Player | undefined => {
        const full = c.authoritativeState?.full;
        return (full?.players as Record<string, Player> | undefined)?.[ids.get(c) ?? ''];
      };
      const until = async (label: string, check: () => boolean, limit = 10000): Promise<void> => {
        const end = performance.now() + limit;
        while (!check()) {
          if (errors.length) throw new Error(`${label}: ${errors.join('; ')}`);
          if (performance.now() > end) throw new Error(`${label}: timeout; ${JSON.stringify(read(first))}; ${JSON.stringify(read(second))}`);
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      };
      for (const c of [first, second]) c.subscribe(event => {
        if (event.kind === 'ready' || event.kind === 'recovered') {
          ids.set(c, event.welcome.playerId);
          const input = inputs.get(c); if (input) input.seq = Math.max(input.seq, event.state.players[event.welcome.playerId]?.lastInputSeq ?? 0);
          if (c === first && event.kind === 'recovered') recovered = true;
        }
        if (event.kind === 'devResult') results.get(c)?.push(event.result);
        if (event.kind === 'terminal' || event.kind === 'lost') errors.push(event.kind);
      });
      const start = (c: typeof first, kind: 'create' | 'join') => c.launch({ kind, name: kind, code: search ? 'DEF234' : 'ABC234' },
        { signal: abort.signal, joined: () => undefined, failed: code => errors.push(`join ${code}`) });
      const command = async (c: typeof first, cmd: string): Promise<void> => {
        const rows = results.get(c); if (!rows) throw new Error('missing results'); const count = rows.length;
        if (!c.sendDevCommand(cmd)) throw new Error(`trusted command unavailable: ${cmd}`);
        await until(cmd, () => rows.length > count);
        if (!rows[count]?.ok) throw new Error(`${cmd}: ${rows[count]?.text}`);
      };
      let timer: ReturnType<typeof setInterval> | undefined;
      try {
        start(first, 'create'); await until('first ready', () => ids.has(first));
        start(second, 'join'); await until('second ready', () => ids.has(second));
        await command(first, '/bots 0');
        await until('playing', () => first.authoritativeState?.phase === 1);
        timer = setInterval(() => {
          for (const c of [first, second]) {
            const input = inputs.get(c); if (!input || !c.activeRoom) continue;
            c.sendInput([++input.seq, 0, 0, 0, input.buttons, 0, 120, 0, 0, 0, 0, 0, 0, 0, 0]);
          }
        }, 1000 / 30);
        const loot = first.authoritativeState?.full.loot as Record<string, { gun: number; x: number; y: number }>;
        const pulse = Object.entries(loot).find(([, item]) => item.gun === 0);
        const stored = Object.entries(loot).find(([, item]) => item.gun === 3);
        if (!pulse || !stored) throw new Error('required random loot absent');
        await command(first, `/tp ${stored[1].x} ${stored[1].y}`);
        await until('locked gun pickup', () => ((read(first)?.gunOwnedMask ?? 0) & 8) !== 0);
        if (read(first)?.unlockedMask !== 1 || read(first)?.form !== 0) throw new Error('pickup unlocked/morphed a player');
        await command(first, `/tp ${pulse[1].x} ${pulse[1].y}`);
        await until('pulse pickup', () => ((read(first)?.gunOwnedMask ?? 0) & 1) !== 0);
        await until('loot removed', () => !(first.authoritativeState?.full.loot as Record<string, unknown>)[pulse[0]]);
        traces.push('Random floor loot collected, including a locked-form Slug; pickup removed authoritatively.');
        await command(first, '/tp 0 0');
        for (let kill = 1; kill <= 6; kill++) {
          await until('victim respawn', () => read(second)?.alive === true);
          await command(second, '/tp 2 0'); await command(second, '/hp .01');
          await until('protection ended', () => (second.authoritativeState?.tick ?? 0) >= (read(second)?.protectedEndTick ?? Infinity));
          const input = inputs.get(first); if (!input) throw new Error('no first input'); input.buttons = 1;
          await until('credited kill', () => (read(first)?.kos ?? 0) >= kill); input.buttons = 0;
          const mask = read(first)?.unlockedMask;
          if (mask !== (kill < 3 ? 1 : kill < 6 ? 3 : 7)) throw new Error(`incorrect unlock at ${kill}: ${mask}`);
        }
        traces.push('Six genuine gun KOs: Beast unlocks exactly at 3, Turret exactly at 6.');
        const beforeReload = read(first); if (!beforeReload) throw new Error('no player');
        const ammoTotal = (beforeReload.gunMag[0] ?? 0) + (beforeReload.gunReserve[0] ?? 0);
        const input = inputs.get(first); if (!input) throw new Error('no first input'); input.buttons = 256;
        await until('reload started', () => read(first)?.reloadGun === 0); input.buttons = 0;
        await until('reload completed', () => read(first)?.reloadGun === -1 && read(first)?.gunMag[0] === 20);
        if ((read(first)?.gunMag[0] ?? 0) + (read(first)?.gunReserve[0] ?? 0) !== ammoTotal) throw new Error('reload created ammo');
        input.buttons = 1; await until('round spent', () => (read(first)?.gunMag[0] ?? 20) < 20); input.buttons = 0;
        // Allow the neutral frame to reach authority before capturing exact retained counts.
        const neutralSeq = input.seq + 2;
        await until('neutral applied', () => (read(first)?.lastInputSeq ?? 0) >= neutralSeq);
        const beforeDeath = read(first); if (!beforeDeath) throw new Error('missing pre-death state');
        const exact = JSON.stringify([beforeDeath.gunOwnedMask, beforeDeath.gunMag, beforeDeath.gunReserve, beforeDeath.unlockedMask, beforeDeath.kos]);
        await command(first, '/kill'); await until('dead', () => read(first)?.alive === false);
        await until('respawn', () => read(first)?.alive === true);
        const afterDeath = read(first); if (!afterDeath) throw new Error('missing respawn');
        if (JSON.stringify([afterDeath.gunOwnedMask, afterDeath.gunMag, afterDeath.gunReserve, afterDeath.unlockedMask, afterDeath.kos]) !== exact) throw new Error('death changed durable inventory');
        traces.push('Reload transfers exact rounds; death/respawn retain all owned-gun ammo and unlocks.');
        const id = ids.get(first); first.activeRoom?.connection.close(3001);
        await until('same-seat reconnect', () => recovered, 15000);
        const afterReconnect = read(first); if (!afterReconnect || ids.get(first) !== id) throw new Error('identity changed');
        if (JSON.stringify([afterReconnect.gunOwnedMask, afterReconnect.gunMag, afterReconnect.gunReserve, afterReconnect.unlockedMask, afterReconnect.kos]) !== exact) throw new Error('reconnect changed durable inventory');
        traces.push('Socket reconnect restores the same identity, unlocks and exact ammunition.');
        return traces;
      } finally { if (timer) clearInterval(timer); abort.abort(); first.dispose(); second.dispose(); }
    }, { port: Number(process.env.SHIFTBORN_TEST_SERVER_PORT ?? 2567), search });
    expect(evidence).toHaveLength(4);
    await test.info().attach('gameplay-evidence', { body: evidence.join('\n'), contentType: 'text/plain' });
  });
}
