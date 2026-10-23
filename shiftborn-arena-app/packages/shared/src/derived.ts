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
  sprint: {
    maxForwardAngleRad: degreesToRadians(BALANCE.sprint.maxForwardAngleDeg),
  },
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
    swapTicks: secondsToTicks(BALANCE.weapons.swapS),
    pulsePistol: {
      intervalS: weaponIntervalS(BALANCE.weapons.pulsePistol.ratePerS),
      projSpeedMPerTick: perSecondToPerTick(
        BALANCE.weapons.pulsePistol.projSpeedMps,
      ),
      reloadTicks: secondsToTicks(BALANCE.weapons.pulsePistol.reloadS),
    },
    ricochetDisc: {
      intervalS: weaponIntervalS(BALANCE.weapons.ricochetDisc.ratePerS),
      projSpeedMPerTick: perSecondToPerTick(
        BALANCE.weapons.ricochetDisc.projSpeedMps,
      ),
      reloadTicks: secondsToTicks(BALANCE.weapons.ricochetDisc.reloadS),
    },
    slugCannon: {
      intervalS: weaponIntervalS(BALANCE.weapons.slugCannon.ratePerS),
      projSpeedMPerTick: perSecondToPerTick(
        BALANCE.weapons.slugCannon.projSpeedMps,
      ),
      reloadTicks: secondsToTicks(BALANCE.weapons.slugCannon.reloadS),
    },
    arcMortar: {
      intervalS: weaponIntervalS(BALANCE.weapons.arcMortar.ratePerS),
      flightTicks: secondsToTicks(BALANCE.weapons.arcMortar.flightS),
      reloadTicks: secondsToTicks(BALANCE.weapons.arcMortar.reloadS),
    },
    dagger: {
      windupTicks: secondsToTicks(BALANCE.weapons.dagger.windupS),
      recoveryTicks: secondsToTicks(BALANCE.weapons.dagger.recoveryS),
    },
    scatterCannon: {
      intervalS: weaponIntervalS(BALANCE.weapons.scatterCannon.ratePerS),
      projSpeedMPerTick: perSecondToPerTick(
        BALANCE.weapons.scatterCannon.projSpeedMps,
      ),
      pelletOffsetsRad:
        BALANCE.weapons.scatterCannon.pelletOffsetsDeg.map(degreesToRadians),
      reloadTicks: secondsToTicks(BALANCE.weapons.scatterCannon.reloadS),
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
      reloadTicks: secondsToTicks(BALANCE.weapons.railRepeater.reloadS),
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
  loot: { respawnTicks: secondsToTicks(BALANCE.loot.respawnS) },
  // Client aim models integrate in real seconds, not ticks (D-078, D-079).
  keyboardAim: {
    turnStartRadPerS: degreesToRadians(BALANCE.keyboardAim.turnStartDegPerS),
    turnMaxRadPerS: degreesToRadians(BALANCE.keyboardAim.turnMaxDegPerS),
    turnAccelRadPerS2: degreesToRadians(BALANCE.keyboardAim.turnAccelDegPerS2),
  },
  aimAssist: {
    acquireHalfAngleRad: degreesToRadians(
      BALANCE.aimAssist.acquireHalfAngleDeg,
    ),
    retainHalfAngleRad: degreesToRadians(BALANCE.aimAssist.retainHalfAngleDeg),
    maxCorrectionRad: degreesToRadians(BALANCE.aimAssist.maxCorrectionDeg),
    pullRadPerS: degreesToRadians(BALANCE.aimAssist.pullDegPerS),
  },
  net: {
    interpDelayTicks: millisecondsToTicks(BALANCE.net.interpDelayMs),
    pingIntervalTicks: secondsToTicks(BALANCE.net.pingIntervalS),
    reconnectTicks: secondsToTicks(BALANCE.net.reconnectS),
    afkWarnTicks: secondsToTicks(BALANCE.net.afkWarnS),
    afkBotTicks: secondsToTicks(BALANCE.net.afkBotS),
    afkAimThresholdRad: degreesToRadians(BALANCE.net.afkAimThresholdDeg),
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
