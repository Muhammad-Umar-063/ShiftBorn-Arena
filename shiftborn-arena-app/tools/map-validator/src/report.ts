import type { MapReport } from './validate.js';

function distance(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(2)} m`;
}

export function reportsExitCode(reports: readonly MapReport[]): number {
  return reports.length > 0 && reports.every((report) => report.passed) ? 0 : 1;
}

export function formatReport(report: MapReport): string {
  const lines = [`Map ${report.mapId}: ${report.passed ? 'PASS' : 'FAIL'}`];
  for (const rule of report.rules) {
    lines.push(`${rule.id} ${rule.name}: ${rule.passed ? 'PASS' : 'FAIL'}`);
    for (const message of rule.messages) lines.push(`  ${message}`);
  }
  const metrics = report.metrics;
  lines.push('Calculated measurements (MAP_SPEC §10.2):');
  lines.push(
    `  Connected regions: Runner ${metrics.connectedRegions.runner}, Beast ${metrics.connectedRegions.beast}`,
  );
  lines.push(
    `  Point clearance: spawn ${distance(metrics.minimumClearanceM.spawn)}, shard ${distance(metrics.minimumClearanceM.shard)}, zone ${distance(metrics.minimumClearanceM.zone)}, crate ${distance(metrics.minimumClearanceM.crate)}`,
  );
  lines.push(
    `  Intact longest sightline: ${distance(metrics.sightlines.intactLongestM)}`,
  );
  lines.push(
    `  Intact share over 22.5 m: ${(metrics.sightlines.shareOverLong * 100).toFixed(2)}%`,
  );
  lines.push(
    `  Intact share over 30 m: ${(metrics.sightlines.shareOver30 * 100).toFixed(2)}%`,
  );
  lines.push(
    `  Destroyed-cover longest sightline (information only): ${distance(metrics.sightlines.destroyedLongestM)}`,
  );
  lines.push(`  Sightline samples: ${metrics.sightlines.sampleCount}`);
  lines.push(
    `  Minimum spawn spread: ${distance(metrics.minimumSpawnSpreadM)}`,
  );
  lines.push(
    `  Minimum spawn-to-zone distance: ${distance(metrics.minimumSpawnZoneM)}`,
  );
  lines.push(
    `  Zone walkable floor: ${Object.entries(metrics.zoneWalkableShare)
      .map(([id, share]) => `${id} ${(share * 100).toFixed(1)}%`)
      .join(', ')}`,
  );
  lines.push(
    `  Minimum cover-to-wall clearance: ${distance(metrics.minimumCoverWallClearanceM)}`,
  );
  lines.push(
    `  Entity IDs: ${metrics.uniqueIds} unique / ${metrics.totalIds} total`,
  );
  lines.push('ASCII render (MAP_SPEC §11):', report.ascii);
  return lines.join('\n');
}
