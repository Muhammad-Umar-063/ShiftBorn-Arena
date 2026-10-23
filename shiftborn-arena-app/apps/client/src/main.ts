import { clientEnv } from './clientEnv.js';
import { mountClient } from './app/bootstrap.js';
import type { App } from './app/App.js';
import { Connection } from './net/Connection.js';
import './ui/styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (root === null) throw new Error('Missing application mount point');
let app: App | null = null;
const connection = new Connection({ endpoint: clientEnv.serverUrl });
connection.subscribe((event) => {
  if (event.kind === 'reconnecting') {
    app?.suspendInput();
    app?.resetPrediction();
    app?.resetPresentationTimeline();
    app?.controller.showReconnecting();
  }
  else if (event.kind === 'recovered') {
    app?.controller.recovered();
    app?.resetPrediction();
    app?.resetPresentationTimeline();
    app?.setLocalPlayerId(event.welcome.playerId);
    app?.showAuthoritativeState(event.state);
    app?.recoverInput(event.state.players[event.welcome.playerId]?.lastInputSeq ?? 0);
  }
  else if (event.kind === 'ready') {
    app?.setLocalPlayerId(event.welcome.playerId);
    app?.showAuthoritativeState(event.state);
    app?.recoverInput(event.state.players[event.welcome.playerId]?.lastInputSeq ?? 0);
  }
  else if (event.kind === 'lost') { app?.suspendInput(); app?.controller.connectionLost(); }
  else if (event.kind === 'terminal') { app?.suspendInput(); app?.reportClose(event.code); }
  else if (event.kind === 'state')
    app?.showAuthoritativeState(event.state);
  else if (event.kind === 'resync') {
    app?.resetPrediction();
    app?.resetPresentationTimeline();
    app?.showAuthoritativeState(event.state);
    app?.recoverInput(event.lastInputSeq);
  }
  else if (event.kind === 'events') app?.showEventBatch(event.batch);
  else if (event.kind === 'devResult') app?.showDevResult(event.result);
});
app = mountClient(root, {
  buildId: clientEnv.buildId,
  launch: connection.launch,
  inputTransport: connection,
  debugConnection: connection,
  serverTickEstimate: () => connection.clock.estimatedTick(),
  onDispose: () => connection.dispose(),
});
if (app === null) connection.dispose();
