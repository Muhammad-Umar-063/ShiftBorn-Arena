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
export { localPredictStateFromPlayer, predictStep } from './predict.js';
export type {
  LocalPredictState,
  PredictStepContext,
  PredictedShot,
} from './predict.js';
export { hashWorld } from './hash.js';
export {
  administrativelyEliminate,
  administrativelyTeleport,
  setAdministrativeFlux,
  setAdministrativeForm,
  setAdministrativeHealth,
  setAdministrativeUnlockAll,
  stopOrdinaryBots,
} from './admin.js';
export { snapshotWorld, restoreWorld, isWorldSnapshot } from './snapshot.js';
export type { WorldSnapshot } from './snapshot.js';
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
export { applyKillUnlocks, formsUnlockedAt, freshUnlocks } from './progression.js';
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
  advanceGunTimers,
  advanceShotSequence,
  advanceTurretHeat,
  advanceWeaponState,
  canFireGun,
  canStartMelee,
  canStartReload,
  canSwap,
  cancelReloadState,
  railDistanceMul,
  scatterAngles,
  scatterDistanceMul,
} from './weaponRules.js';
export type { WeaponAction, WeaponActor } from './weaponRules.js';
export {
  cloneGuns,
  emptyGuns,
  gunNumbers,
  meleeActive,
  noSelection,
  selectedGun,
  swapTarget,
  usableGun,
  zeroGunTimers,
} from './loadout.js';
export type {
  GunInventory,
  GunNumbers,
  GunState,
  GunTimers,
  MeleeState,
  ReloadState,
  SelectedTiers,
} from './loadout.js';
export { resolveMeleeStrike } from './melee.js';
export { cancelReload, cancelWeaponCommitments } from './weaponEvents.js';
export {
  spawnProjectile,
  fireProjectiles,
  advanceProjectile,
  advanceAllProjectiles,
  clearProjectiles,
  removeOwnedProjectiles,
  mortarLandingPoint,
} from './projectiles.js';
export * from './ability.js';

export { collectGun, advanceLoot, setupLoot, lootCandidates } from './loot.js';
export type { LootItem, LootReplenishment } from './loot.js';
