import { OAuthError, OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { CONFIG } from "../config/config.js";
import { D1Store } from "../db/d1.js";
import { publicOrigin } from "../utils/auth-urls.js";
import { invalidTokenResponse } from "../utils/http-responses.js";
import {
  makeAccessContext,
  readAuthorizationProps,
  readTokenFacts,
  sameStrings,
} from "../utils/oauth-validation.js";
import type {
  BrowserRequestHandler,
  McpAuthorizationProps,
  McpRequestHandler,
  WorkerEnvironment,
} from "./types.js";

export { requestUsesCanonicalOrigin } from "../utils/auth-urls.js";
export { renderBrowserError } from "../utils/http-responses.js";
export {
  handleAccountApiGet,
  handleAccountGet,
  handleConnectionsApiGet,
  handleConnectionsGet,
  handleDisconnectPost,
  handleLogoutPost,
} from "./account.js";
export {
  handleAuthorizationGet,
  handleAuthorizationPost,
  handleGoogleCallback,
} from "./authorization.js";
export { handleBrowserCallback, handleBrowserSignIn } from "./browser.js";
export type {
  BrowserRequestHandler,
  McpAuthorizationProps,
  McpRequestHandler,
  WorkerEnvironment,
} from "./types.js";

export function createOAuthProvider(
  env: WorkerEnvironment,
  handleMcpRequest: McpRequestHandler,
  routeBrowserRequest: BrowserRequestHandler,
): OAuthProvider<WorkerEnvironment> {
  const origin = publicOrigin(env);
  const resource = new URL(CONFIG.worker.mcpPath, origin).href;
  const apiHandler = {
    fetch: (request: Request, runtime: WorkerEnvironment, context: unknown) =>
      handleAuthorizedMcpRequest(request, runtime, context, handleMcpRequest),
  };

  return new OAuthProvider<WorkerEnvironment>({
    apiRoute: CONFIG.worker.mcpPath,
    apiHandler,
    defaultHandler: {
      fetch: (request, runtime) => routeBrowserRequest(request, runtime),
    },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    clientIdMetadataDocumentEnabled: true,
    accessTokenTTL: CONFIG.oauth.accessTokenTtlSeconds,
    refreshTokenTTL: CONFIG.oauth.refreshTokenTtlSeconds,
    resourceMetadata: {
      resource,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      resource_name: CONFIG.app.name,
    },
    tokenExchangeCallback: (input) => handleTokenExchange(input, env),
  });
}

async function handleAuthorizedMcpRequest(
  request: Request,
  runtime: WorkerEnvironment,
  context: unknown,
  handleMcpRequest: McpRequestHandler,
): Promise<Response> {
  const authContext = context as { props?: unknown; auth?: unknown };
  const props = readAuthorizationProps(authContext.props);
  const token = readTokenFacts(authContext.auth);
  if (
    !props ||
    !token ||
    token.userId !== props.userId ||
    token.audience !== props.resource ||
    token.clientId.length === 0 ||
    !sameStrings(token.scope, props.scope)
  ) {
    return invalidTokenResponse();
  }

  const active = await new D1Store(runtime.DB).getActiveOAuthAccess({
    userId: props.userId,
    workspaceId: props.workspaceId,
    consentId: props.consentId,
    clientId: token.clientId,
    resource: props.resource,
    scope: JSON.stringify(props.scope),
  });
  if (!active) return invalidTokenResponse();
  return handleMcpRequest(request, runtime, active.workspaceId);
}

type TokenExchangeInput = {
  grantType: string;
  clientId: string;
  userId: string;
  props: unknown;
};

async function handleTokenExchange(
  { grantType, clientId, userId, props }: TokenExchangeInput,
  env: WorkerEnvironment,
): Promise<{ accessTokenTTL: number; refreshTokenTTL?: number }> {
  const authProps = readAuthorizationProps(props);
  if (!authProps || authProps.userId !== userId) {
    throw new OAuthError("invalid_grant", {
      description: "The authorization is no longer active.",
    });
  }
  const store = new D1Store(env.DB);
  const accessContext = makeAccessContext(authProps, clientId);
  if (!(await store.getActiveOAuthAccess(accessContext))) {
    throw new OAuthError("invalid_grant", {
      description: "The authorization is no longer active.",
    });
  }
  if (grantType === "authorization_code") {
    const expiresAt = new Date(
      Date.now() + CONFIG.oauth.refreshTokenTtlSeconds * 1000,
    ).toISOString();
    if (!(await store.setConsentExpiry(authProps.consentId, expiresAt))) {
      throw new OAuthError("invalid_grant", {
        description: "The authorization is no longer active.",
      });
    }
  }
  return {
    accessTokenTTL: CONFIG.oauth.accessTokenTtlSeconds,
    ...(grantType === "authorization_code"
      ? { refreshTokenTTL: CONFIG.oauth.refreshTokenTtlSeconds }
      : {}),
  };
}
