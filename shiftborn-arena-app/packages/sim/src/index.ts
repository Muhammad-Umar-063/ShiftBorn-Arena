export { createWorld } from './world.js';
export type {
  ClusterState,
  CoverState,
  MapRuntime,
  PlayerRecord,
  PlayerIdentity,
  PlayerStats,
  PendingDeath,
  Projectile,
  Shard,
  World,
  ZoneState,
} from './world.js';
export { sfc32, nextFloat, nextInt, shuffle, pick } from './rng.js';
export type { Rng } from './rng.js';
export { SIM_EVENT_NAMES, emitEvent } from './events.js';
export type { SimEvent, SimEventName } from './events.js';
export { step, TICK_SYSTEMS } from './step.js';
export type { StepContext } from './step.js';
export { hashWorld } from './hash.js';
export { subtract, dot } from './math/vec2.js';
export type { Vec2 } from './math/vec2.js';
export {
  circleBoxPushOut,
  segmentBoxIntersection,
  segmentCircleIntersection,
} from './math/geometry.js';
export { raycast } from './math/raycast.js';
export type { RaycastShape, RaycastHit } from './math/raycast.js';
export {
  WALL_GRID_CELL_SIZE_M,
  createMapRuntime,
  queryWallIndexes,
  queryCircleWallIndexes,
} from './map/collisionIndex.js';
export type { WallCollisionGrid } from './map/collisionIndex.js';
export { lineOfSight } from './map/lineOfSight.js';
export {
  addPlayer,
  handoffPlayerToBot,
  removePlayer,
  setController,
} from './player.js';
export { chooseSpawnPoint } from './spawns.js';
export { deriveMatchId, setMode } from './match.js';
export { PHASE_POLICY } from './phasePolicy.js';
export { advanceAim } from './aim.js';
export {
  advanceMovement,
  decodeMoveDirection,
  integrateCircleMotion,
  moveTowardVelocity,
  targetVelocity,
} from './movement.js';
export type { MotionResult } from './movement.js';
export { formStats } from './formStats.js';
export type { FormStats } from './formStats.js';
export {
  cancelMorphOnDeath,
  dueMorphCompletion,
  evaluateMorphRequest,
  morphCost,
  morphKnockbackImmune,
  resetMorphForRespawn,
} from './morph.js';
export type { MorphCompletion, MorphDecision } from './morph.js';
export { applyDamage } from './damage.js';
export { counterForm, finalizeDeaths } from './death.js';
export {
  createDeathDrop,
  deathFluxAmounts,
  insideBlockingGeometry,
  nudgeDropPoint,
} from './deathDrops.js';
export { gainFlux, regenerateFlux } from './flux.js';
export {
  ShardKind,
  spawnShard,
  spawnCluster,
  setupClusters,
  pickUpShards,
  expireDroppedShards,
  advanceClusterSchedule,
  advanceFluxAndShards,
} from './shards.js';
export type { ClusterPhase } from './shards.js';
export { respawnPlayer, respawnDuePlayers } from './respawn.js';
export {
  isSpawnProtected,
  grantSpawnProtection,
  endSpawnProtection,
} from './protection.js';
export { calculateDamage } from './damageMath.js';
export type {
  AttackSource,
  DamageCalculation,
  DamageResult,
  DamageTarget,
} from './damageMath.js';
export {
  weaponForForm,
  canFireWeapon,
  advanceWeaponTimers,
  scatterAngles,
  scatterDistanceMul,
  railDistanceMul,
  advanceTurretHeat,
} from './weaponRules.js';
export type { WeaponAbilityBlock } from './weaponRules.js';
export {
  spawnProjectile,
  fireProjectiles,
  advanceProjectile,
  advanceAllProjectiles,
  clearProjectiles,
  removeOwnedProjectiles,
} from './projectiles.js';
export * from './ability.js';
