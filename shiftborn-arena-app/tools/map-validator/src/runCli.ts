import type { MapData } from '@shiftborn/shared';
import { formatReport, reportsExitCode } from './report.js';
import { validateMap } from './validate.js';

export function runValidationCli(
  maps: readonly MapData[],
  write: (message: string) => void,
): number {
  const reports = maps.map(validateMap);
  for (const report of reports) write(formatReport(report));
  return reportsExitCode(reports);
}
