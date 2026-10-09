import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  type Configuration,
  discovery,
  enableNonRepudiationChecks,
} from "openid-client";
import { CONFIG } from "../config/config.js";
import type { GoogleProfile } from "../db/d1.js";

const GOOGLE_ISSUER = new URL(CONFIG.google.issuer);

export function createGoogleAuthorizationRequest(
  configuration: Configuration,
  redirectUri: string,
  state: string,
  nonce: string,
  codeChallenge: string,
): URL {
  return buildAuthorizationUrl(configuration, {
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
}

export async function createGoogleConfiguration(
  clientId: string,
  clientSecret: string,
): Promise<Configuration> {
  return discovery(GOOGLE_ISSUER, clientId, clientSecret, undefined, {
    execute: [enableNonRepudiationChecks],
  });
}

export async function exchangeGoogleCode(
  configuration: Configuration,
  callbackUrl: URL,
  expectedState: string,
  expectedNonce: string,
  pkceCodeVerifier: string,
): Promise<GoogleProfile> {
  const tokens = await authorizationCodeGrant(configuration, callbackUrl, {
    expectedState,
    expectedNonce,
    pkceCodeVerifier,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (
    !claims ||
    typeof claims.sub !== "string" ||
    typeof claims.email !== "string" ||
    claims.email_verified !== true
  ) {
    throw new Error("Google did not verify the account identity");
  }

  return {
    googleSub: claims.sub,
    displayName:
      typeof claims.name === "string" && claims.name.trim()
        ? claims.name.trim()
        : claims.email,
    email: claims.email,
    emailVerified: true,
    avatarUrl: typeof claims.picture === "string" ? claims.picture : null,
  };
}
