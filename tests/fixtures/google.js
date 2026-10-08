import { createHash, generateKeyPairSync, sign } from "node:crypto";

export const googleIssuer = "https://accounts.google.com";
export const googleClientId = "mentis-test-client";
export const googleClientSecret = "mentis-test-secret";
export const googleJwksUrl = "https://www.googleapis.com/oauth2/v3/certs";
export const googleTokenUrl = `${googleIssuer}/token`;
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
export const googleKey = {
  ...publicKey.export({ format: "jwk" }),
  kid: "mentis-test-key",
  alg: "RS256",
  use: "sig",
};
export const googleDiscovery = {
  issuer: googleIssuer,
  authorization_endpoint: `${googleIssuer}/auth`,
  token_endpoint: googleTokenUrl,
  jwks_uri: googleJwksUrl,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
  code_challenge_methods_supported: ["S256"],
};

export function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function googleTokenReply(
  parameters,
  authorization,
  claimOverrides = {},
  signatureValid = true,
) {
  const verifier = parameters.get("code_verifier");
  if (!verifier || pkceChallenge(verifier) !== authorization.challenge) {
    return { statusCode: 400, data: { error: "invalid_grant" } };
  }
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: googleIssuer,
    sub: "google-user-1",
    aud: googleClientId,
    exp: now + 600,
    iat: now,
    nonce: authorization.nonce,
    email: "user@example.com",
    email_verified: true,
    name: "  Example User  ",
    picture: "https://example.com/avatar.png",
    ...claimOverrides,
  };
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "RS256", kid: googleKey.kid, typ: "JWT" })}.${encode(claims)}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), privateKey);
  if (!signatureValid) signature[0] ^= 1;
  return {
    statusCode: 200,
    data: {
      access_token: "google-access-token",
      token_type: "bearer",
      id_token: `${input}.${signature.toString("base64url")}`,
    },
  };
}
