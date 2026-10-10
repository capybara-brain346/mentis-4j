import type { D1PreparedStatement, D1Result } from "../db/d1-types.js";

export async function first<T>(
  statement: D1PreparedStatement,
): Promise<T | null> {
  return (await all<T>(statement))[0] ?? null;
}

export async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  assertSuccess(result);
  return result.results ?? [];
}

export function assertSuccess(result: D1Result<unknown>): void {
  if (!result.success) throw new Error(result.error ?? "D1 query failed");
}
