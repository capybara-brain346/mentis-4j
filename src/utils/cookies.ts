export const SESSION_COOKIE = "__Host-mentis-session";
export const SIGN_IN_COOKIE = "__Host-mentis-sign-in";

export function sessionCookie(secret: string, ttlSeconds: number): string {
  return `${SESSION_COOKIE}=${secret}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${ttlSeconds}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function cookieValue(request: Request, name: string): string | null {
  for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

export function appendSetCookie(headers: Headers, cookie: string | null): void {
  if (cookie) headers.append("Set-Cookie", cookie);
}
