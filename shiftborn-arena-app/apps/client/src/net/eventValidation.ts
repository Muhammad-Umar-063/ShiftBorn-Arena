import { AbilityId, BALANCE, Cause, EventId, Form, GREYBOX_V1, Phase,
  WeaponId, type EncodedEvent } from '@shiftborn/shared';

type Field = 'id' | 'seat' | 'optionalSeat' | 'uint' | 'finite' | 'positive'
  | 'form' | 'ability' | 'weapon' | 'cause' | 'tags' | 'flag'
  | 'morphReason' | 'point' | 'shardPoint' | 'cover' | 'zone' | 'phase' | 'text';

// NETWORK_PROTOCOL §5.3: each positional payload is checked before any route.
const FIELDS: Readonly<Record<number, readonly Field[]>> = {
  [EventId.ProjectileSpawn]: ['id', 'seat', 'weapon', 'finite', 'finite',
    'finite', 'uint', 'uint', 'uint', 'uint'],
  [EventId.ProjectileHit]: ['id', 'seat', 'positive', 'tags', 'finite', 'finite'],
  [EventId.ProjectileImpact]: ['id', 'finite', 'finite'],
  [EventId.ProjectileExpire]: ['id'],
  [EventId.Blocked]: ['id', 'seat'],
  [EventId.MorphStart]: ['seat', 'form', 'form', 'uint'],
  [EventId.MorphEnd]: ['seat', 'form'],
  [EventId.MorphDenied]: ['seat', 'form', 'morphReason'],
  [EventId.AbilityStart]: ['seat', 'ability', 'uint', 'uint', 'finite', 'finite'],
  [EventId.AbilityEnd]: ['seat', 'ability', 'flag'],
  [EventId.AbilityHit]: ['seat', 'ability', 'seat', 'positive', 'tags'],
  [EventId.RailShotFired]: ['seat', 'finite', 'finite', 'finite', 'finite'],
  [EventId.Stun]: ['seat', 'uint'],
  [EventId.Knockback]: ['seat', 'finite', 'finite', 'uint'],
  [EventId.Overheat]: ['seat', 'uint'],
  [EventId.Death]: ['seat', 'optionalSeat', 'cause', 'form', 'form',
    'positive', 'form'],
  [EventId.Spawn]: ['seat', 'finite', 'finite', 'uint'],
  [EventId.Respawn]: ['seat', 'finite', 'finite', 'uint'],
  [EventId.ShardSpawn]: ['id'],
  [EventId.ShardPickup]: ['id', 'seat', 'positive'],
  [EventId.ShardExpire]: ['id'],
  [EventId.ClusterAnnounce]: ['shardPoint', 'uint'],
  [EventId.CoverDestroyed]: ['cover'],
  [EventId.CoverRebuilt]: ['cover'],
  [EventId.ZoneAnnounce]: ['point', 'uint'],
  [EventId.ZoneMoved]: ['point'],
  [EventId.ZoneState]: ['zone', 'optionalSeat'],
  [EventId.Phase]: ['phase', 'uint'],
  [EventId.MatchEnd]: [],
  [EventId.BotReplaced]: ['seat', 'text'],
};

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= minimum && value <= maximum;
}
function oneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === 'string' && values.includes(value);
}
function fieldValid(field: Field, value: unknown): boolean {
  switch (field) {
    case 'id': return (typeof value === 'string' && value.length > 0) ||
      integer(value, 0, 0xffffffff);
    case 'seat': return integer(value, 0, BALANCE.match.seats - 1);
    case 'optionalSeat': return integer(value, -1, BALANCE.match.seats - 1);
    case 'uint': return integer(value, 0, 0xffffffff);
    case 'finite': return typeof value === 'number' && Number.isFinite(value);
    case 'positive': return typeof value === 'number' && Number.isFinite(value) &&
      value >= 0;
    case 'form': return oneOf(value, Object.values(Form));
    case 'ability': return oneOf(value, Object.values(AbilityId));
    case 'weapon': return oneOf(value, Object.values(WeaponId));
    case 'cause': return oneOf(value, Object.values(Cause));
    case 'tags': return integer(value, 0, 7);
    case 'flag': return integer(value, 0, 1);
    case 'morphReason': return integer(value, 0, 3);
    case 'point': return integer(value, 0, GREYBOX_V1.zonePoints.length - 1);
    case 'shardPoint': return integer(value, 0, GREYBOX_V1.shardPoints.length - 1);
    case 'cover': return integer(value, 0, GREYBOX_V1.cover.length - 1);
    case 'zone': return integer(value, 0, 2);
    case 'phase': return oneOf(value, Object.values(Phase));
    case 'text': return typeof value === 'string' && value.length > 0;
  }
}

/** The cast follows full positional validation; callers receive detached tuples. */
export function validateEventTuple(value: readonly unknown[]): EncodedEvent | null {
  const id = value[0];
  if (!integer(id, 1, 30)) return null;
  const fields = FIELDS[id];
  if (fields === undefined) return null;
  if (id === EventId.MatchEnd) {
    const ranking = value[1];
    if (value.length !== 2 || !Array.isArray(ranking) ||
      ranking.length > BALANCE.match.seats ||
      !ranking.every((seat: unknown) => fieldValid('seat', seat)) ||
      new Set(ranking).size !== ranking.length) return null;
    return [id, [...ranking]] as EncodedEvent;
  }
  if (id === EventId.Death) {
    if (value.length < fields.length + 1 ||
      !value.slice(fields.length + 1).every((seat) => fieldValid('seat', seat)))
      return null;
  } else if (value.length !== fields.length + 1) return null;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === undefined || !fieldValid(field, value[index + 1])) return null;
  }
  // The numeric event id and every payload position above establish EncodedEvent.
  return [...value] as unknown as EncodedEvent;
}
