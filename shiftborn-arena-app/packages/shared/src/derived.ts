import { BALANCE } from './balance.js';

// GR-1.4, D-046: keep human units in BALANCE and convert them once for the sim.
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * BALANCE.tick.rateHz);
}

export function millisecondsToTicks(milliseconds: number): number {
  return secondsToTicks(milliseconds / 1000);
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function perSecondToPerTick(valuePerSecond: number): number {
  return valuePerSecond / BALANCE.tick.rateHz;
}

export function weaponIntervalS(ratePerS: number): number {
  return 1 / ratePerS;
}

export const DERIVED = {
  tick: { secondsPerTick: 1 / BALANCE.tick.rateHz },
  match: {
    countdownTicks: secondsToTicks(BALANCE.match.countdownS),
    durationTicks: secondsToTicks(BALANCE.match.durationS),
    resultsTicks: secondsToTicks(BALANCE.match.resultsS),
    lateJoinCutoffTicks: secondsToTicks(BALANCE.match.lateJoinCutoffS),
    respawnTicks: secondsToTicks(BALANCE.match.respawnS),
    spawnProtectionTicks: secondsToTicks(BALANCE.match.spawnProtectionS),
    assistWindowTicks: secondsToTicks(BALANCE.match.assistWindowS),
  },
  movement: { accelMpsPerTick: perSecondToPerTick(BALANCE.movement.accelMps2) },
  forms: {
    runner: {
      speedMPerTick: perSecondToPerTick(BALANCE.forms.runner.speedMps),
    },
    beast: { speedMPerTick: perSecondToPerTick(BALANCE.forms.beast.speedMps) },
    turret: {
      speedMPerTick: perSecondToPerTick(BALANCE.forms.turret.speedMps),
      turnRateRadPerTick: degreesToRadians(
        perSecondToPerTick(BALANCE.forms.turret.turnRateDegPerS),
      ),
      frontArcRad: degreesToRadians(BALANCE.forms.turret.frontArcDeg),
    },
  },
  morph: {
    durationTicks: secondsToTicks(BALANCE.morph.durationS),
    cooldownTicks: secondsToTicks(BALANCE.morph.cooldownS),
  },
  weapons: {
    spawnAdvanceMaxTicks: millisecondsToTicks(
      BALANCE.weapons.spawnAdvanceMaxMs,
    ),
    pulsePistol: {
      intervalS: weaponIntervalS(BALANCE.weapons.pulsePistol.ratePerS),
      projSpeedMPerTick: perSecondToPerTick(
        BALANCE.weapons.pulsePistol.projSpeedMps,
      ),
    },
    scatterCannon: {
      intervalS: weaponIntervalS(BALANCE.weapons.scatterCannon.ratePerS),
      projSpeedMPerTick: perSecondToPerTick(
        BALANCE.weapons.scatterCannon.projSpeedMps,
      ),
      pelletOffsetsRad:
        BALANCE.weapons.scatterCannon.pelletOffsetsDeg.map(degreesToRadians),
    },
    railRepeater: {
      intervalS: weaponIntervalS(BALANCE.weapons.railRepeater.ratePerS),
      projSpeedMPerTick: perSecondToPerTick(
        BALANCE.weapons.railRepeater.projSpeedMps,
      ),
      heatMaxTicks: secondsToTicks(BALANCE.weapons.railRepeater.heatMaxS),
      overheatTicks: secondsToTicks(BALANCE.weapons.railRepeater.overheatS),
      heatCoolPerTick: perSecondToPerTick(
        BALANCE.weapons.railRepeater.heatCoolPerS,
      ),
    },
  },
  abilities: {
    dash: {
      durationTicks: secondsToTicks(BALANCE.abilities.dash.durationS),
      cooldownTicks: secondsToTicks(BALANCE.abilities.dash.cooldownS),
      speedMps:
        BALANCE.abilities.dash.distanceM / BALANCE.abilities.dash.durationS,
    },
    ramCharge: {
      windupTicks: secondsToTicks(BALANCE.abilities.ramCharge.windupS),
      speedMPerTick: perSecondToPerTick(BALANCE.abilities.ramCharge.speedMps),
      maxDurationTicks: secondsToTicks(
        BALANCE.abilities.ramCharge.maxDurationS,
      ),
      knockbackDurationTicks: secondsToTicks(
        BALANCE.abilities.ramCharge.knockbackDurationS,
      ),
      wallStunTicks: secondsToTicks(BALANCE.abilities.ramCharge.wallStunS),
      cooldownTicks: secondsToTicks(BALANCE.abilities.ramCharge.cooldownS),
    },
    railShot: {
      chargeTicks: secondsToTicks(BALANCE.abilities.railShot.chargeS),
      cancelCooldownTicks: secondsToTicks(
        BALANCE.abilities.railShot.cancelCooldownS,
      ),
      cooldownTicks: secondsToTicks(BALANCE.abilities.railShot.cooldownS),
    },
  },
  status: { ccImmunityTicks: secondsToTicks(BALANCE.status.ccImmunityS) },
  flux: { regenPerTick: perSecondToPerTick(BALANCE.flux.regenPerS) },
  shards: {
    respawnDelayTicks: secondsToTicks(BALANCE.shards.respawnDelayS),
    announceTicks: secondsToTicks(BALANCE.shards.announceS),
    dropLifetimeTicks: secondsToTicks(BALANCE.shards.dropLifetimeS),
  },
  cover: { rebuildTicks: secondsToTicks(BALANCE.cover.rebuildS) },
  zoneFrenzy: {
    moveEveryTicks: secondsToTicks(BALANCE.zoneFrenzy.moveEveryS),
    previewTicks: secondsToTicks(BALANCE.zoneFrenzy.previewS),
    pointsPerTick: perSecondToPerTick(BALANCE.zoneFrenzy.pointsPerS),
  },
  keyboardAim: {
    turnRadPerTick: degreesToRadians(
      perSecondToPerTick(BALANCE.keyboardAim.turnDegPerS),
    ),
  },
  softLock: {
    acquireConeRad: degreesToRadians(BALANCE.softLock.acquireConeDeg),
    trackTurnRadPerTick: degreesToRadians(
      perSecondToPerTick(BALANCE.softLock.trackTurnDegPerS),
    ),
    breakAfterTicks: secondsToTicks(BALANCE.softLock.breakAfterS),
    releaseHoldTicks: secondsToTicks(BALANCE.softLock.releaseHoldS),
  },
  net: {
    interpDelayTicks: millisecondsToTicks(BALANCE.net.interpDelayMs),
    pingIntervalTicks: secondsToTicks(BALANCE.net.pingIntervalS),
    reconnectTicks: secondsToTicks(BALANCE.net.reconnectS),
    afkWarnTicks: secondsToTicks(BALANCE.net.afkWarnS),
    afkBotTicks: secondsToTicks(BALANCE.net.afkBotS),
    smoothTicks: millisecondsToTicks(BALANCE.net.smoothMs),
  },
  backfill: { outOfCombatTicks: secondsToTicks(BALANCE.backfill.outOfCombatS) },
  bots: {
    decisionIntervalTicks: BALANCE.tick.rateHz / BALANCE.bots.decisionHz,
    memoryTicks: secondsToTicks(BALANCE.bots.memoryS),
    stuckTicks: secondsToTicks(BALANCE.bots.stuckS),
    aimErrorRerollTicks: secondsToTicks(BALANCE.bots.aimErrorRerollS),
    ramMaxAngleRad: degreesToRadians(BALANCE.bots.ramMaxAngleDeg),
    tiers: {
      easy: {
        reactionTicks: millisecondsToTicks(BALANCE.bots.tiers.easy.reactionMs),
        aimErrorRad: degreesToRadians(BALANCE.bots.tiers.easy.aimErrorDeg),
        aimTurnRadPerTick: degreesToRadians(
          perSecondToPerTick(BALANCE.bots.tiers.easy.aimTurnDegPerS),
        ),
        fireToleranceRad: degreesToRadians(
          BALANCE.bots.tiers.easy.fireToleranceDeg,
        ),
      },
      normal: {
        reactionTicks: millisecondsToTicks(
          BALANCE.bots.tiers.normal.reactionMs,
        ),
        aimErrorRad: degreesToRadians(BALANCE.bots.tiers.normal.aimErrorDeg),
        aimTurnRadPerTick: degreesToRadians(
          perSecondToPerTick(BALANCE.bots.tiers.normal.aimTurnDegPerS),
        ),
        fireToleranceRad: degreesToRadians(
          BALANCE.bots.tiers.normal.fireToleranceDeg,
        ),
      },
      hard: {
        reactionTicks: millisecondsToTicks(BALANCE.bots.tiers.hard.reactionMs),
        aimErrorRad: degreesToRadians(BALANCE.bots.tiers.hard.aimErrorDeg),
        aimTurnRadPerTick: degreesToRadians(
          perSecondToPerTick(BALANCE.bots.tiers.hard.aimTurnDegPerS),
        ),
        fireToleranceRad: degreesToRadians(
          BALANCE.bots.tiers.hard.fireToleranceDeg,
        ),
      },
    },
  },
} as const;
