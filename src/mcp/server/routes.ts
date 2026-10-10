import {
  type BrowserRequestHandler,
  handleAccountApiGet,
  handleAccountGet,
  handleAuthorizationGet,
  handleAuthorizationPost,
  handleBrowserCallback,
  handleBrowserSignIn,
  handleConnectionsApiGet,
  handleConnectionsGet,
  handleDisconnectPost,
  handleGoogleCallback,
  handleLogoutPost,
  renderBrowserError,
  requestUsesCanonicalOrigin,
  type WorkerEnvironment,
} from "../../auth/oauth.js";
import { logger } from "../../lib/logger.js";

const browserRoutes: Record<string, BrowserRequestHandler> = {
  "GET /api/sign-in": handleBrowserSignIn,
  "GET /api/google/callback": handleBrowserCallback,
  "GET /api/account": handleAccountApiGet,
  "GET /api/connections": handleConnectionsApiGet,
  "POST /api/connections/disconnect": handleDisconnectPost,
  "POST /api/logout": handleLogoutPost,
  "GET /authorize": handleAuthorizationGet,
  "POST /authorize": handleAuthorizationPost,
  "GET /google/callback": handleGoogleCallback,
  "GET /account": handleAccountGet,
  "GET /connections": handleConnectionsGet,
  "POST /connections/disconnect": handleDisconnectPost,
  "POST /logout": handleLogoutPost,
};

export async function routeBrowserRequest(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  try {
    if (!requestUsesCanonicalOrigin(request, env)) {
      return new Response("Invalid host", { status: 421 });
    }
    const { pathname } = new URL(request.url);
    if (pathname === "/") return new Response("Mentis MCP", { status: 200 });
    const handler = browserRoutes[`${request.method} ${pathname}`];
    if (handler) return await handler(request, env);
    if (pathname === "/authorize") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, POST" },
      });
    }
    return new Response("Not found", { status: 404 });
  } catch (error) {
    logger.error("OAuth browser request failed");
    return renderBrowserError(error);
  }
}
