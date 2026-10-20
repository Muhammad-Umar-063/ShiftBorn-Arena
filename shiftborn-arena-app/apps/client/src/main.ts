import { clientEnv } from './clientEnv.js';
import { mountClient } from './app/bootstrap.js';
import './ui/styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (root === null) throw new Error('Missing application mount point');
mountClient(root, { buildId: clientEnv.buildId });
