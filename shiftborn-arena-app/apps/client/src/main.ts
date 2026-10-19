import { clientEnv } from './clientEnv.js';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing application mount point');
}

// AT-REPO-05: this is the temporary shell; the play flow belongs to T-030.
const page = document.createElement('main');
page.className = 'shell';

const eyebrow = document.createElement('p');
eyebrow.className = 'eyebrow';
eyebrow.textContent = 'PROTOTYPE / LOCAL DEVELOPMENT';

const heading = document.createElement('h1');
heading.textContent = 'Shiftborn Arena';

const detail = document.createElement('p');
detail.className = 'detail';
detail.textContent = 'Development landing shell';

const build = document.createElement('p');
build.className = 'build';
build.textContent = `Build ${clientEnv.buildId}`;

page.append(eyebrow, heading, detail, build);
app.append(page);
