# MAP_SPEC.md

> **LLM FILE CONTRACT:** Authoritative `greybox_v1` geometry, data and navigation specification. A coordinate change must update map data, pass V1 to V9 and refresh the documented validation results.

The prototype greybox map **`greybox_v1`**: dimensions, walls, destructible cover, spawn points, shard points, zone points, reserved crate points, the data file, bot navigation data and the validation rules.

Related: `docs/GAME_RULES.md` §4, §10, §13, §14; `docs/BOT_SPEC.md` §4; `docs/BALANCE.md` §7 (`mapRules`).

The layout below was checked with the map validator rules in section 10 before this document was written. Results are in section 10.2. If you change any coordinate, re-run `pnpm map:validate` and update this document and the data file together.

---

## 1. Overview

- **Size:** 64 x 64 m including 1 m outer walls; the playable interior runs from -31 to 31 m on both axes (62 x 62 m).
- **Layout:** three north-south lanes separated by two divider walls with three 5 m doorways each.
  - **West lane, "Neon Market"** (x -31 to -11.5): stall rows in a zigzag, tight corridors.
  - **Center lane, "Reactor Core"** (x -10.5 to 10.5): an open central plaza with two reactor pillars (zone Z-0), blocks north and south that break long sightlines.
  - **East lane, "Scrapyard"** (x 11.5 to 31): pile rows in a zigzag, mirroring the market.
- **Symmetry:** walls and cover are mirror-symmetric across both the x and y axes, so no area of the map favors a side. Spawn points SP-9 and SP-10 are point-symmetric.
- **Flat:** one floor level. No ramps, jump pads, raised platforms, hazards or grapple anchors in the prototype (D-022).
- **Heights (visual only; the sim is 2D):** walls 3 m, destructible cover 1.2 m. Everything blocks movement, projectiles and line of sight equally in the sim.

---

## 2. Coordinates and units

- x points east, y points north, meters, origin at the map center (D-046).
- Every box is `[minX, minY, maxX, maxY]`, axis-aligned.
- Three.js mapping: sim `(x, y)` → world `(x, 0, -y)`. Box height is applied in the render only.

---

## 3. Doorways

Both dividers have doorways at the same heights: y from -19 to -14, from -2.5 to 2.5, and from 14 to 19 (5 m wide each). Long horizontal sightlines through aligned doorways are blocked inside the center lane by R-9, R-10 and the reactor pillars R-P1 and R-P2.

---

## 4. Walls

| Id | minX | minY | maxX | maxY | Role |
|---|---|---|---|---|---|
| `B-N` | -32 | 31 | 32 | 32 | Outer boundary |
| `B-S` | -32 | -32 | 32 | -31 | Outer boundary |
| `B-W` | -32 | -32 | -31 | 32 | Outer boundary |
| `B-E` | 31 | -32 | 32 | 32 | Outer boundary |
| `DW-1` | -11.5 | -31 | -10.5 | -19 | West lane divider |
| `DW-2` | -11.5 | -14 | -10.5 | -2.5 | West lane divider |
| `DW-3` | -11.5 | 2.5 | -10.5 | 14 | West lane divider |
| `DW-4` | -11.5 | 19 | -10.5 | 31 | West lane divider |
| `DE-1` | 10.5 | -31 | 11.5 | -19 | East lane divider |
| `DE-2` | 10.5 | -14 | 11.5 | -2.5 | East lane divider |
| `DE-3` | 10.5 | 2.5 | 11.5 | 14 | East lane divider |
| `DE-4` | 10.5 | 19 | 11.5 | 31 | East lane divider |
| `M-1` | -31 | 21 | -18 | 23 | Neon Market stall row |
| `M-2` | -24.5 | 9 | -11.5 | 11 | Neon Market stall row |
| `M-3` | -31 | -2.5 | -18 | 2.5 | Neon Market stall row |
| `M-4` | -24.5 | -11 | -11.5 | -9 | Neon Market stall row |
| `M-5` | -31 | -23 | -18 | -21 | Neon Market stall row |
| `M-6` | -31 | 14 | -24 | 19 | Neon Market stall row |
| `M-7` | -31 | -19 | -24 | -14 | Neon Market stall row |
| `S-1` | 18 | 21 | 31 | 23 | Scrapyard pile row |
| `S-2` | 11.5 | 9 | 24.5 | 11 | Scrapyard pile row |
| `S-3` | 18 | -2.5 | 31 | 2.5 | Scrapyard pile row |
| `S-4` | 11.5 | -11 | 24.5 | -9 | Scrapyard pile row |
| `S-5` | 18 | -23 | 31 | -21 | Scrapyard pile row |
| `S-6` | 24 | 14 | 31 | 19 | Scrapyard pile row |
| `S-7` | 24 | -19 | 31 | -14 | Scrapyard pile row |
| `R-1` | -7 | 7 | 7 | 9 | Reactor Core block |
| `R-2` | -7 | -9 | 7 | -7 | Reactor Core block |
| `R-3` | -10.5 | 10 | -7 | 13 | Reactor Core block |
| `R-4` | 7 | 10 | 10.5 | 13 | Reactor Core block |
| `R-5` | -10.5 | -13 | -7 | -10 | Reactor Core block |
| `R-6` | 7 | -13 | 10.5 | -10 | Reactor Core block |
| `R-7` | -4 | 22 | 4 | 24 | Reactor Core block |
| `R-8` | -4 | -24 | 4 | -22 | Reactor Core block |
| `R-9` | -2 | 14 | 2 | 19 | Reactor Core block |
| `R-10` | -2 | -19 | 2 | -14 | Reactor Core block |
| `R-P1` | -6 | -2.5 | -4 | 2.5 | Reactor pillar (inside the Z-0 zone) |
| `R-P2` | 4 | -2.5 | 6 | 2.5 | Reactor pillar (inside the Z-0 zone) |

---

## 5. Destructible cover

10 boxes, 1 m deep and 3 m long. They block like walls while intact. Only Ram Charge destroys them; they rebuild 30 s later when nothing overlaps them (GR-14). The validator placed them to cut the longest remaining sightlines while keeping at least 2.6 m of clearance from every wall, so they never close a passage.

| Id | minX | minY | maxX | maxY | Placement |
|---|---|---|---|---|---|
| `DC-1` | -15 | 15 | -14 | 18 | West north doorway shield |
| `DC-2` | 14 | 15 | 15 | 18 | East north doorway shield |
| `DC-3` | -15 | -1.5 | -14 | 1.5 | West middle doorway shield |
| `DC-4` | 14 | -1.5 | 15 | 1.5 | East middle doorway shield |
| `DC-5` | -15 | -18 | -14 | -15 | West south doorway shield |
| `DC-6` | 14 | -18 | 15 | -15 | East south doorway shield |
| `DC-7` | -6 | 15.5 | -5 | 18.5 | Center north, west side |
| `DC-8` | 5 | 15.5 | 6 | 18.5 | Center north, east side |
| `DC-9` | -6 | -18.5 | -5 | -15.5 | Center south, west side |
| `DC-10` | 5 | -18.5 | 6 | -15.5 | Center south, east side |

---

## 6. Shard points

10 points; 3 clusters active at a time (GR-10.5). A cluster is one large shard at the point and four small shards 1.5 m north, south, east and west of it. Every point has at least 2.5 m clearance, so all five shards sit in open floor.

| Id | x | y | Location |
|---|---|---|---|
| `SH-1` | -21 | 6 | West lane, middle band |
| `SH-2` | 21 | -6 | East lane, middle band |
| `SH-3` | -21 | -6 | West lane, middle band |
| `SH-4` | 21 | 6 | East lane, middle band |
| `SH-5` | 0 | 11.5 | Center, between R-1 and R-9 |
| `SH-6` | 0 | -11.5 | Center, between R-2 and R-10 |
| `SH-7` | -14 | 26 | West lane, north by the divider |
| `SH-8` | 14 | -26 | East lane, south by the divider |
| `SH-9` | -27 | -11.5 | West lane, south-west pocket |
| `SH-10` | 27 | 11.5 | East lane, north-east pocket |

---

## 7. Zone points (Zone Frenzy)

5 points for the Surge Zone (radius 6 m, GR-13). Z-0 is always first. The others sit at the doorway areas where two lanes meet, so a held zone can be contested from more than one direction.

| Id | x | y | Location |
|---|---|---|---|
| `Z-0` | 0 | 0 | Reactor Core plaza (walkable 73% of the 6 m circle; pillars R-P1 and R-P2 inside) |
| `Z-1` | -17 | 17 | North-west, at the west north doorway (walkable 80%) |
| `Z-2` | 17 | 17 | North-east, at the east north doorway (walkable 80%) |
| `Z-3` | -17 | -17 | South-west, at the west south doorway (walkable 80%) |
| `Z-4` | 17 | -17 | South-east, at the east south doorway (walkable 80%) |

---

## 8. Spawn points and crate points

### 8.1 Spawn points

10 points with 3 m clearance; the closest pair is 14 m apart; the closest spawn to any zone point is 14.9 m away. Facing is not stored: players spawn aiming at the map center (GR-11.6).

| Id | x | y | Location |
|---|---|---|---|
| `SP-1` | -28 | 28 | Corner |
| `SP-2` | -7 | 28 | Center lane, north |
| `SP-3` | 7 | 28 | Center lane, north |
| `SP-4` | 28 | 28 | Corner |
| `SP-5` | -28 | -28 | Corner |
| `SP-6` | -7 | -28 | Center lane, south |
| `SP-7` | 7 | -28 | Center lane, south |
| `SP-8` | 28 | -28 | Corner |
| `SP-9` | -28 | 6 | West lane, middle |
| `SP-10` | 28 | -6 | East lane, middle |

### 8.2 Crate points (reserved)

Kept in the data so production crates do not need a new layout pass. The prototype ignores them.

| Id | x | y | Note |
|---|---|---|---|
| `CR-1` | -27 | 12 | Reserved for production crates; unused in the prototype |
| `CR-2` | 27 | -12 | Reserved for production crates; unused in the prototype |
| `CR-3` | -8.5 | 4.5 | Reserved for production crates; unused in the prototype |
| `CR-4` | 8.5 | -4.5 | Reserved for production crates; unused in the prototype |
| `CR-5` | 21 | 26.5 | Reserved for production crates; unused in the prototype |
| `CR-6` | -21 | -26.5 | Reserved for production crates; unused in the prototype |

---

## 9. Map data file

`packages/shared/src/maps/greybox_v1.ts` (typed TypeScript, so the compiler checks it). `types.ts` defines:

```ts
export type Box = readonly [minX: number, minY: number, maxX: number, maxY: number];
export interface MapPoint { readonly id: string; readonly x: number; readonly y: number; }
export interface MapData {
  readonly id: string;
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };
  readonly playable: { minX: number; minY: number; maxX: number; maxY: number };
  readonly walls: readonly { id: string; box: Box }[];
  readonly cover: readonly { id: string; box: Box }[];
  readonly spawnPoints: readonly MapPoint[];
  readonly shardPoints: readonly MapPoint[];
  readonly zonePoints: readonly MapPoint[];
  readonly cratePoints: readonly MapPoint[];
}
```

Starting content:

```ts
// packages/shared/src/maps/greybox_v1.ts
// Generated from docs/MAP_SPEC.md. Boxes are [minX, minY, maxX, maxY] in meters; x east, y north, origin at center.
import type { MapData } from './types';

export const GREYBOX_V1: MapData = {
  id: 'greybox_v1',
  bounds: { minX: -32, minY: -32, maxX: 32, maxY: 32 },
  playable: { minX: -31, minY: -31, maxX: 31, maxY: 31 },
  walls: [
    { id: 'B-N', box: [-32, 31, 32, 32] },
    { id: 'B-S', box: [-32, -32, 32, -31] },
    { id: 'B-W', box: [-32, -32, -31, 32] },
    { id: 'B-E', box: [31, -32, 32, 32] },
    { id: 'DW-1', box: [-11.5, -31, -10.5, -19] },
    { id: 'DW-2', box: [-11.5, -14, -10.5, -2.5] },
    { id: 'DW-3', box: [-11.5, 2.5, -10.5, 14] },
    { id: 'DW-4', box: [-11.5, 19, -10.5, 31] },
    { id: 'DE-1', box: [10.5, -31, 11.5, -19] },
    { id: 'DE-2', box: [10.5, -14, 11.5, -2.5] },
    { id: 'DE-3', box: [10.5, 2.5, 11.5, 14] },
    { id: 'DE-4', box: [10.5, 19, 11.5, 31] },
    { id: 'M-1', box: [-31, 21, -18, 23] },
    { id: 'M-2', box: [-24.5, 9, -11.5, 11] },
    { id: 'M-3', box: [-31, -2.5, -18, 2.5] },
    { id: 'M-4', box: [-24.5, -11, -11.5, -9] },
    { id: 'M-5', box: [-31, -23, -18, -21] },
    { id: 'M-6', box: [-31, 14, -24, 19] },
    { id: 'M-7', box: [-31, -19, -24, -14] },
    { id: 'S-1', box: [18, 21, 31, 23] },
    { id: 'S-2', box: [11.5, 9, 24.5, 11] },
    { id: 'S-3', box: [18, -2.5, 31, 2.5] },
    { id: 'S-4', box: [11.5, -11, 24.5, -9] },
    { id: 'S-5', box: [18, -23, 31, -21] },
    { id: 'S-6', box: [24, 14, 31, 19] },
    { id: 'S-7', box: [24, -19, 31, -14] },
    { id: 'R-1', box: [-7, 7, 7, 9] },
    { id: 'R-2', box: [-7, -9, 7, -7] },
    { id: 'R-3', box: [-10.5, 10, -7, 13] },
    { id: 'R-4', box: [7, 10, 10.5, 13] },
    { id: 'R-5', box: [-10.5, -13, -7, -10] },
    { id: 'R-6', box: [7, -13, 10.5, -10] },
    { id: 'R-7', box: [-4, 22, 4, 24] },
    { id: 'R-8', box: [-4, -24, 4, -22] },
    { id: 'R-9', box: [-2, 14, 2, 19] },
    { id: 'R-10', box: [-2, -19, 2, -14] },
    { id: 'R-P1', box: [-6, -2.5, -4, 2.5] },
    { id: 'R-P2', box: [4, -2.5, 6, 2.5] },
  ],
  cover: [
    { id: 'DC-1', box: [-15, 15, -14, 18] },
    { id: 'DC-2', box: [14, 15, 15, 18] },
    { id: 'DC-3', box: [-15, -1.5, -14, 1.5] },
    { id: 'DC-4', box: [14, -1.5, 15, 1.5] },
    { id: 'DC-5', box: [-15, -18, -14, -15] },
    { id: 'DC-6', box: [14, -18, 15, -15] },
    { id: 'DC-7', box: [-6, 15.5, -5, 18.5] },
    { id: 'DC-8', box: [5, 15.5, 6, 18.5] },
    { id: 'DC-9', box: [-6, -18.5, -5, -15.5] },
    { id: 'DC-10', box: [5, -18.5, 6, -15.5] },
  ],
  spawnPoints: [
    { id: 'SP-1', x: -28, y: 28 },
    { id: 'SP-2', x: -7, y: 28 },
    { id: 'SP-3', x: 7, y: 28 },
    { id: 'SP-4', x: 28, y: 28 },
    { id: 'SP-5', x: -28, y: -28 },
    { id: 'SP-6', x: -7, y: -28 },
    { id: 'SP-7', x: 7, y: -28 },
    { id: 'SP-8', x: 28, y: -28 },
    { id: 'SP-9', x: -28, y: 6 },
    { id: 'SP-10', x: 28, y: -6 },
  ],
  shardPoints: [
    { id: 'SH-1', x: -21, y: 6 },
    { id: 'SH-2', x: 21, y: -6 },
    { id: 'SH-3', x: -21, y: -6 },
    { id: 'SH-4', x: 21, y: 6 },
    { id: 'SH-5', x: 0, y: 11.5 },
    { id: 'SH-6', x: 0, y: -11.5 },
    { id: 'SH-7', x: -14, y: 26 },
    { id: 'SH-8', x: 14, y: -26 },
    { id: 'SH-9', x: -27, y: -11.5 },
    { id: 'SH-10', x: 27, y: 11.5 },
  ],
  zonePoints: [
    { id: 'Z-0', x: 0, y: 0 },
    { id: 'Z-1', x: -17, y: 17 },
    { id: 'Z-2', x: 17, y: 17 },
    { id: 'Z-3', x: -17, y: -17 },
    { id: 'Z-4', x: 17, y: -17 },
  ],
  cratePoints: [
    { id: 'CR-1', x: -27, y: 12 },
    { id: 'CR-2', x: 27, y: -12 },
    { id: 'CR-3', x: -8.5, y: 4.5 },
    { id: 'CR-4', x: 8.5, y: -4.5 },
    { id: 'CR-5', x: 21, y: 26.5 },
    { id: 'CR-6', x: -21, y: -26.5 },
  ],
};
```

The order of every array is significant: indexes are used in the protocol (cover index, zone point index, spawn index) and in seeded random choices.

---

## 10. Validation

### 10.1 Rules (`pnpm map:validate`, `tools/map-validator`)

| Rule | Check | Limit |
|---|---|---|
| V1 Bounds | Every box and point is inside `bounds`; every point is inside `playable` | |
| V2 Point clearance | Distance from every spawn, shard, zone and crate point to the nearest wall or cover box | at least 1.5 m (`mapRules.minPointClearanceM`); shard points at least 2.0 m |
| V3 Connectivity | Flood fill on a 0.5 m grid of cells whose center is at least the radius away from every box, for radius 0.6 m (Runner) and 1.0 m (Beast) | exactly one connected region each, containing every spawn, shard and zone point |
| V4 Sightlines | From every free point on a 1 m grid (offset by 0.25 m), in 16 directions, the free length forward plus backward, with boxes inflated by 0.15 m | longest at most 34 m (`mapRules.maxSightlineM`); at most 5% of samples above 22.5 m (`mapRules.longSightlineM`, `mapRules.maxShareOverLong`) |
| V5 Spawn spread | Minimum distance between spawn points | at least 10 m |
| V6 Spawn to zone | Minimum distance from any spawn point to any zone point | at least 10 m |
| V7 Zone floor | Walkable share of each zone circle (cells with Runner clearance) | at least 70% |
| V8 Cover clearance | Distance from each cover box to the nearest wall | at least 2.6 m |
| V9 Ids | All ids unique; arrays non-empty; exactly 10 spawn, 10 shard, 5 zone points | |

The validator prints a report and an ASCII render (section 11), and exits non-zero if any rule fails. CI runs it.

### 10.2 Results for `greybox_v1` (checked 2026-10-14)

| Rule | Result |
|---|---|
| V3 Connectivity | One region at radius 0.6 m and one at 1.0 m |
| V4 Sightlines, cover intact | Longest 33.2 m (diagonals); 3.3% of samples above 22.5 m; 0.2% above 30 m |
| V4 Sightlines, all cover destroyed | Longest 35.7 m (reported for information; the limit applies with cover intact) |
| V2 Point clearance | Spawns 3.0 m; shards 2.5 to 3.0 m; crates 2.0 to 3.5 m |
| V5 Spawn spread | 14.0 m |
| V6 Spawn to zone | 14.9 m |
| V7 Zone floor | Z-0 73%; Z-1 to Z-4 80% |

The longest remaining lines are diagonals across the center lane and the lane corners. The GDD's 22 m target for the production map is a soft limit here; playtests decide whether the greybox needs more blockers (`docs/PLAYTEST_PLAN.md` §7).

---

## 11. ASCII render

One character = 1 m wide and 2 m tall, north up. `#` wall, `%` destructible cover, `P` spawn point, `*` shard point, `Z` zone point, `c` reserved crate point, `.` floor.

```text
################################################################
#...P...............##...P.............P..##................P..#
#.................*.##....................##.........c.........#
#...................##....................##...................#
##############......##......########......##......##############
##############......##....................##......##############
########............##....%...####...%....##............########
########.......Z.%........%...####...%........%..Z......########
########.........%........%...####...%........%.........########
#....c..............#####..............#####...................#
#......##################.......*......##################..*...#
#......###############...##############...###############......#
#...P......*........##...##############...##.........*.........#
#...................##.c..................##...................#
##############......##....##........##....##......##############
##############...%........##....Z...##........%...##############
##############...%........##........##........%...##############
##############......##....##........##....##......##############
#..........*........##..................c.##.........*......P..#
#...................##...##############...##...................#
#......###############...##############...###############......#
#....*.##################.......*......##################..c...#
#...................#####..............#####...................#
########.........%........%...####...%........%.........########
########.......Z.%........%...####...%........%..Z......########
########............##....%...####...%....##............########
##############......##....................##......##############
##############......##......########......##......##############
#...................##....................##..*................#
#...P......c........##...P.............P..##................P..#
#...................##....................##...................#
################################################################
```

---

## 12. Bot navigation data

- Built at server start from the map data (not stored in the file): a 0.5 m grid, one grid per moving radius (0.6 m Runner, 1.0 m Beast). A cell is walkable if its center is at least the radius away from every wall and cover box.
- Intact cover is treated as blocked. When cover is destroyed, bots do not path through the gap in the prototype; the grid stays static (simpler, and the gap reopens in 30 s anyway).
- Path search: A* with 8-way moves and octile distance, followed by line-of-sight smoothing (`docs/BOT_SPEC.md` §4).
- Precomputed per map: for each grid cell, the nearest spawn, shard and zone point are not needed; bots search on demand (fast enough at 124 x 124 cells).

---

## 13. Greybox dressing

- Lane floor brightness: market slightly warmer, scrapyard slightly cooler, center neutral (subtle; never stronger than the team colors).
- Lane names painted on the floor near each doorway in large light text ("MARKET", "CORE", "SCRAPYARD") to help players talk about places in playtests.
- Zone points marked on the floor with a small purple ring and their id ("Z-1") in Zone Frenzy only.
- Shard points marked with a faint green dot when no cluster is active there.

---

## 14. Changing the map

1. Edit `packages/shared/src/maps/greybox_v1.ts` and this document in the same commit.
2. Run `pnpm map:validate`; paste the new results into section 10.2 and the new ASCII render into section 11.
3. If the change came from playtest findings, record it in `DECISIONS.md` and bump `BALANCE.version` so analysis can separate before and after.
