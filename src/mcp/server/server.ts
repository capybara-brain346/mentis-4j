import {
  createOAuthProvider,
  requestUsesCanonicalOrigin,
} from "../../auth/oauth.js";
import type { WorkerEnvironment } from "../../auth/types.js";
import { logger } from "../../lib/logger.js";
import { handleMcpRequest } from "./mcp-handler.js";
import { routeBrowserRequest } from "./routes.js";

export default {
  async fetch(
    request: Request,
    env: WorkerEnvironment,
    context: Parameters<ReturnType<typeof createOAuthProvider>["fetch"]>[2],
  ): Promise<Response> {
    if (!env.DB || !env.OAUTH_KV) {
      return new Response("Mentis OAuth storage is not configured", {
        status: 503,
      });
    }
    try {
      if (!requestUsesCanonicalOrigin(request, env)) {
        return new Response("Invalid host", { status: 421 });
      }
      return await createOAuthProvider(
        env,
        handleMcpRequest,
        routeBrowserRequest,
      ).fetch(request, env, context);
    } catch {
      logger.error("Mentis Worker request failed");
      return new Response("Mentis request failed", { status: 503 });
    }
  },
};
