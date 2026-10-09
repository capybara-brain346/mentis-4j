import {
  AuthorizationError,
  CimdFetchError,
} from "@cloudflare/workers-oauth-provider";
import { OAuthProviderUnavailableError } from "../auth/provider.js";

export function invalidTokenResponse(): Response {
  return new Response("Authorization is no longer active", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Bearer error="invalid_token"',
      "Cache-Control": "no-store",
    },
  });
}

export function apiResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function setSecurityHeaders(
  headers: Headers,
  formAction = "'self'",
): void {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set(
    "Content-Security-Policy",
    `default-src 'none'; form-action ${formAction}; base-uri 'none'; frame-ancestors 'none'`,
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cache-Control", "no-store");
}

export function htmlPage(html: string, status = 200): Response {
  const headers = new Headers();
  setSecurityHeaders(headers);
  return new Response(html, { status, headers });
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
}

export function renderBrowserError(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    if (error.redirectTo) {
      return new Response(null, {
        status: 302,
        headers: { Location: error.redirectTo, "Cache-Control": "no-store" },
      });
    }
    return htmlPage(escapeHtml(error.description), 400);
  }
  if (error instanceof CimdFetchError) {
    return htmlPage("This client could not be verified. Start again.", 400);
  }
  if (error instanceof OAuthProviderUnavailableError) {
    return new Response("OAuth provider is not available", { status: 503 });
  }
  return new Response("Mentis authorization failed", { status: 503 });
}
