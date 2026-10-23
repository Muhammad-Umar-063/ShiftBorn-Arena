import { expect, test, type Page } from '@playwright/test';

test.skip(process.env.SHIFTBORN_LIVE_SERVER !== '1',
  'Run with SHIFTBORN_LIVE_SERVER=1 against a real server');
const port = Number(process.env.SHIFTBORN_TEST_SERVER_PORT ?? 2567);

interface ShotObservation {
  readonly at: number;
  readonly visualId: number;
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly drawnCount?: number;
  readonly inputSeq?: number | null;
  readonly shotIdx?: number | null;
}
interface Confirmation {
  readonly serverId: string | number;
  readonly inputSeq?: number;
  readonly shotIdx?: number;
  readonly before: ShotObservation | null;
  readonly after: ShotObservation | null;
  readonly receiptAt: number;
}

async function join(page: Page, search: string): Promise<void> {
  await page.goto(`http://localhost:5173/${search}`);
  await page.evaluate(async (serverPort) => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:10';
    document.body.append(root);
    const { App } = await import('/src/app/App.ts');
    const { Connection } = await import('/src/net/Connection.ts');
    const connection = new Connection({ endpoint: `ws://127.0.0.1:${serverPort}`,
      search: location.search });
    const app = new App(root, { launch: connection.launch,
      inputTransport: connection,
      serverTickEstimate: () => connection.clock.estimatedTick(),
      onDispose: () => connection.dispose() });
    const observations: { clickAt: number; clickVisual: ShotObservation | null;
      firstFrame: ShotObservation | null; confirmations: Confirmation[];
      trace: Array<Record<string, unknown>> } = {
        clickAt: 0, clickVisual: null, firstFrame: null, confirmations: [],
        trace: [],
      };
    let localId = '';
    let localSeat = -1;
    const renderer = () => (app as unknown as { arenaRenderer: {
      projectiles: { count: number; timeline: {
        entries(): IterableIterator<{ visualId: number; own: boolean;
          inputSeq: number | null; shotIdx: number | null;
          serverId: string | number | null; x: number; y: number }>;
        getByServerId(id: string | number): { visualId: number; x: number;
          y: number } | null } };
      renderer: { domElement: HTMLCanvasElement } } | null }).arenaRenderer;
    const find = (seq: number, shotIdx: number): ShotObservation | null => {
      const view = renderer();
      if (view === null) return null;
      const visual = [...view.projectiles.timeline.entries()].find((entry) =>
        entry.own && entry.inputSeq === seq && entry.shotIdx === shotIdx);
      return visual === undefined ? null : { at: performance.now(),
        visualId: visual.visualId, x: visual.x, y: visual.y,
        count: view.projectiles.count, inputSeq: visual.inputSeq,
        shotIdx: visual.shotIdx };
    };
    connection.subscribe((event) => {
      if (event.kind === 'ready' || event.kind === 'recovered') {
        if (event.kind === 'recovered') {
          app.controller.recovered(); app.resetPrediction();
          app.resetPresentationTimeline();
        }
        localId = event.welcome.playerId;
        localSeat = event.welcome.seat;
        app.setLocalPlayerId(localId);
        app.showAuthoritativeState(event.state);
        app.recoverInput(event.state.players[localId]?.lastInputSeq ?? 0);
      } else if (event.kind === 'state' || event.kind === 'resync') {
        if (event.kind === 'resync') {
          app.resetPrediction(); app.resetPresentationTimeline();
          app.recoverInput(event.lastInputSeq);
        }
        app.showAuthoritativeState(event.state);
      } else if (event.kind === 'events') {
        const spawns = event.batch.events.filter((entry) =>
          entry[0] === 1 && entry[2] === localSeat);
        const prior = spawns.map((entry) => find(entry[9] as number,
          entry[10] as number));
        app.showEventBatch(event.batch);
        spawns.forEach((entry, index) => {
          const linked = renderer()?.projectiles.timeline.getByServerId(
            entry[1] as string | number) ?? null;
          observations.confirmations.push({
            serverId: entry[1] as string | number,
            inputSeq: entry[9] as number, shotIdx: entry[10] as number,
            before: prior[index] ?? null,
            after: linked === null ? null : { at: performance.now(),
              visualId: linked.visualId, x: linked.x, y: linked.y,
              count: renderer()?.projectiles.count ?? -1 },
            receiptAt: performance.now(),
          });
        });
      } else if (event.kind === 'reconnecting') {
        app.suspendInput(); app.resetPrediction();
        app.resetPresentationTimeline(); app.controller.showReconnecting();
      }
    });
    app.controller.start({ kind: 'quick', name: 'ProjectileTester', code: '' });
    Object.assign(window, { __projectileLive: { app, connection, observations,
      renderer, getLocalId: () => localId } });
  }, port);
  await expect.poll(() => page.evaluate(() => {
    const h = (window as unknown as { __projectileLive: { connection: { canUseDevConsole: boolean } } }).__projectileLive;
    return h.connection.canUseDevConsole;
  }), { timeout: 20_000 }).toBe(true);
  await page.evaluate(() => {
    const h = (window as unknown as { __projectileLive: { connection: { sendDevCommand(cmd: string): boolean } } }).__projectileLive;
    if (!h.connection.sendDevCommand('/give pulsePistol')) throw new Error('trusted dev gun grant unavailable');
  });
  await expect.poll(() => page.evaluate(() => {
    const h = (window as unknown as { __projectileLive: {
      app: { state: { kind: string }; prediction: { state: {
        alive: boolean; form: string;
        gunTimers: Record<string, number> } | null } };
      connection: { authoritativeState: { phase: number } | null } }
    }).__projectileLive;
    const predicted = h.app.prediction.state;
    return h.app.state.kind === 'inMatch' &&
      h.connection.authoritativeState?.phase === 1 && predicted?.alive === true &&
      (h.connection as unknown as { authoritativeState: { full: { players: Record<string, { gunOwnedMask: number }> } } }).authoritativeState.full.players[(h as unknown as { getLocalId(): string }).getLocalId()]?.gunOwnedMask === 1 &&
      predicted.gunTimers.pulsePistol <= 0;
  }), { timeout: 20_000 }).toBe(true);
}

const conditions = [
  { label: '0 ms', search: '' },
  { label: '100 ms', search: '?lag=100' },
  { label: '200 ms', search: '?lag=200' },
  { label: '150 ms plus 2% HOL loss', search: '?lag=150&loss=2' },
  { label: '150 ms plus jitter and 2% HOL loss',
    search: '?lag=150&jitter=20&loss=2' },
] as const;

for (const condition of conditions) test(`AT-NET-09 ${condition.label}`,
  async ({ page }, testInfo) => {
    test.setTimeout(45_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 800, height: 450 });
    await join(page, condition.search);
    const canvas = page.locator('.arena-canvas');
    await expect(canvas).toBeVisible();
    await page.evaluate(() => {
      const h = (window as unknown as { __projectileLive: {
        renderer(): { projectiles: { count: number; timeline: {
          entries(): IterableIterator<{ visualId: number; own: boolean;
            inputSeq: number | null; shotIdx: number | null;
            serverId: string | number | null; weapon: string;
            x: number; y: number }>;
          getByServerId(id: string | number): { visualId: number; x: number;
            y: number } | null };
          onReceipt(delivery: { event: readonly unknown[];
            projectileOwnerId: string | null }, atMs: number): number | null };
          renderer: { domElement: HTMLCanvasElement };
          scene: { getObjectByName(name: string): { count: number } | undefined }
        } | null;
        app: { prediction: {
          state: { form: string; gunTimers: Record<string, number>;
            lastInputSeq: number; lastShotInputSeq: number;
            nextShotIdx: number } | null;
          pendingSequences: readonly number[];
          onFrame(frame: { seq: number; buttons: number }): readonly {
            inputSeq: number; shotIdx: number }[];
          adopt(authority: { tick: number; state: { lastInputSeq: number } },
            atMs: number, reset?: boolean): void;
        } };
        getLocalId(): string;
        observations: { clickAt: number; clickVisual: ShotObservation | null;
          firstFrame: ShotObservation | null;
          confirmations: Confirmation[]; trace: Array<Record<string, unknown>> } }
      }).__projectileLive;
      const view = h.renderer();
      if (view === null) return;
      const prediction = h.app.prediction;
      const record = (entry: Record<string, unknown>): void => {
        const at = performance.now();
        if (h.observations.clickAt > 0 && at > h.observations.clickAt + 2000)
          return;
        h.observations.trace.push({ at, ...entry });
        if (h.observations.clickAt === 0 && h.observations.trace.length > 40)
          h.observations.trace.shift();
      };
      const originalOnFrame = prediction.onFrame.bind(prediction);
      prediction.onFrame = (frame) => {
        const before = prediction.state;
        const shots = originalOnFrame(frame);
        const after = prediction.state;
        record({ kind: 'sample', seq: frame.seq, buttons: frame.buttons,
          shotIntents: (frame as { shotIntents?: readonly number[] }).shotIntents ?? [],
          pending: prediction.pendingSequences.slice(),
          preTimer: before?.gunTimers.pulsePistol,
          postTimer: after?.gunTimers.pulsePistol,
          preLastShotInputSeq: before?.lastShotInputSeq,
          preNextShotIdx: before?.nextShotIdx,
          postLastShotInputSeq: after?.lastShotInputSeq,
          postNextShotIdx: after?.nextShotIdx,
          shotTags: shots.map((shot) => [shot.inputSeq, shot.shotIdx]) });
        return shots;
      };
      const originalAdopt = prediction.adopt.bind(prediction);
      prediction.adopt = (authority, atMs, reset) => {
        const before = prediction.state;
        const pendingBefore = prediction.pendingSequences.slice();
        originalAdopt(authority, atMs, reset);
        const after = prediction.state;
        record({ kind: 'replay', tick: authority.tick,
          ackSeq: authority.state.lastInputSeq, pendingBefore,
          pendingAfter: prediction.pendingSequences.slice(),
          preTimer: before?.gunTimers.pulsePistol,
          postTimer: after?.gunTimers.pulsePistol,
          postLastShotInputSeq: after?.lastShotInputSeq,
          postNextShotIdx: after?.nextShotIdx });
      };
      const originalReceipt = view.projectiles.onReceipt.bind(view.projectiles);
      view.projectiles.onReceipt = (delivery, atMs) => {
        const event = delivery.event;
        if (event[0] !== 1 || delivery.projectileOwnerId !== h.getLocalId())
          return originalReceipt(delivery, atMs);
        const beforeVisual = [...view.projectiles.timeline.entries()].find((entry) =>
          entry.own && entry.inputSeq === event[9] && entry.shotIdx === event[10]);
        const before = beforeVisual === undefined ? null : { at: performance.now(),
          visualId: beforeVisual.visualId, x: beforeVisual.x, y: beforeVisual.y,
          count: view.projectiles.count, inputSeq: beforeVisual.inputSeq,
          shotIdx: beforeVisual.shotIdx };
        const result = originalReceipt(delivery, atMs);
        const afterVisual = view.projectiles.timeline.getByServerId(
          event[1] as string | number);
        const after = afterVisual === null ? null : { at: performance.now(),
          visualId: afterVisual.visualId, x: afterVisual.x, y: afterVisual.y,
          count: view.projectiles.count };
        h.observations.confirmations.push({ serverId: event[1] as string | number,
          inputSeq: event[9] as number, shotIdx: event[10] as number,
          before, after, receiptAt: performance.now() });
        return result;
      };
      view.renderer.domElement.addEventListener('pointerdown', () => {
        h.observations.clickAt = performance.now();
        const shot = [...view.projectiles.timeline.entries()].find((entry) =>
          entry.own && entry.serverId === null);
        h.observations.clickVisual = shot === undefined ? null : {
          at: performance.now(), visualId: shot.visualId, x: shot.x, y: shot.y,
          count: view.projectiles.count, inputSeq: shot.inputSeq,
          shotIdx: shot.shotIdx,
          drawnCount: view.scene.getObjectByName(`projectiles-own-${shot.weapon}`)?.count };
        requestAnimationFrame(() => {
          const first = [...view.projectiles.timeline.entries()].find((entry) =>
            entry.visualId === shot?.visualId);
          h.observations.firstFrame = first === undefined ? null : {
            at: performance.now(), visualId: first.visualId,
            x: first.x, y: first.y, count: view.projectiles.count,
            drawnCount: view.scene.getObjectByName(`projectiles-own-${first.weapon}`)?.count };
        });
      }, { once: true });
    });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2,
      box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
    try {
      await expect.poll(() => page.evaluate(() => (window as unknown as {
        __projectileLive: { observations: {
          confirmations: Confirmation[] } } }).__projectileLive.observations.confirmations.length),
      { timeout: 10_000 }).toBeGreaterThan(0);
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const h = (window as unknown as { __projectileLive: {
          observations: unknown;
          app: { prediction: { state: { lastInputSeq: number } | null };
            input: { sampledFrame: { seq: number; buttons: number } | null } | null };
          connection: { authoritativeState: { tick: number; phase: number;
            players: Record<string, { lastInputSeq: number; alive: boolean }> } | null };
          getLocalId(): string }
        }).__projectileLive;
        return { observations: h.observations,
          sampledFrame: h.app.input?.sampledFrame,
          predictionSeq: h.app.prediction.state?.lastInputSeq,
          serverTick: h.connection.authoritativeState?.tick,
          phase: h.connection.authoritativeState?.phase,
          serverPlayer: h.connection.authoritativeState?.players[h.getLocalId()] };
      });
      console.log('AT-NET-09 missing confirmation', condition.label,
        JSON.stringify(diagnostics));
      throw error;
    }
    const measurement = await page.evaluate(() => {
      const h = (window as unknown as { __projectileLive: {
        app: { dispose(): void }; observations: {
          clickAt: number; clickVisual: ShotObservation | null;
          firstFrame: ShotObservation | null;
          confirmations: Confirmation[]; trace: Array<Record<string, unknown>> } } }).__projectileLive;
      const result = { ...h.observations };
      h.app.dispose();
      return result;
    });
    await testInfo.attach(`AT-NET-09 ${condition.label}`, {
      body: JSON.stringify(measurement), contentType: 'application/json' });
    console.log('AT-NET-09 measurement', condition.label,
      JSON.stringify(measurement));
    expect(errors).toEqual([]);
    expect(measurement.clickVisual).not.toBeNull();
    expect(measurement.firstFrame).not.toBeNull();
    expect(measurement.firstFrame?.count).toBeGreaterThan(0);
    expect(measurement.firstFrame?.drawnCount).toBeGreaterThan(0);
    expect(measurement.firstFrame?.visualId)
      .toBe(measurement.clickVisual?.visualId);
    expect(measurement.firstFrame!.at).toBeGreaterThanOrEqual(measurement.clickAt);
    const linked = measurement.confirmations.find((entry) =>
      entry.before?.visualId === measurement.clickVisual?.visualId &&
      entry.after?.visualId === measurement.clickVisual?.visualId);
    expect(linked).toBeDefined();
    expect(linked?.after?.visualId).toBe(measurement.clickVisual?.visualId);
    expect(linked?.after?.count).toBe(linked?.before?.count);
    expect(linked?.after?.x).toBeCloseTo(linked!.before!.x, 6);
    expect(linked?.after?.y).toBeCloseTo(linked!.before!.y, 6);
  });
