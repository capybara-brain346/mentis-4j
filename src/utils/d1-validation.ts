export function requireText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

export function normalizeTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return timestamp.toISOString();
}

export function futureTimestamp(
  value: string,
  now: string,
  field: string,
): string {
  const expiresAt = normalizeTimestamp(value, field);
  if (expiresAt <= now) throw new Error(`${field} must be in the future`);
  return expiresAt;
}
