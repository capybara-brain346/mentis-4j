import type { D1Store } from "../db/d1.js";
import type { BrowserSession } from "../db/d1-types.js";
import { cookieValue, SESSION_COOKIE } from "../utils/cookies.js";

export async function readSession(
  request: Request,
  store: D1Store,
): Promise<BrowserSession | null> {
  const secret = cookieValue(request, SESSION_COOKIE);
  return secret ? store.getBrowserSession(secret) : null;
}
