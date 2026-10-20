/** NETWORK_PROTOCOL §3.2: an empty string selects quick play. */
export function isValidRoomCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === '' || /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(value))
  );
}
