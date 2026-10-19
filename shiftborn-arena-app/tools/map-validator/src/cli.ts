import { GREYBOX_V1 } from '@shiftborn/shared';
import { runValidationCli } from './runCli.js';

declare const console: { log(message: string): void };
declare const process: { exitCode: number };

// Production maps are registered here; TEST_OPEN remains test-only.
const productionMaps = [GREYBOX_V1];
process.exitCode = runValidationCli(productionMaps, (message) =>
  console.log(message),
);
