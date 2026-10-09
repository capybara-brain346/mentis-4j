import { CONFIG } from "../config/config.js";
import { all, assertSuccess, first } from "../utils/d1-results.js";
import {
  futureTimestamp,
  normalizeTimestamp,
  requireText,
} from "../utils/d1-validation.js";
import { hashSecret, randomSecret } from "../utils/secrets.js";
import {
  consumeBrowserSignIn,
  createBrowserSession,
  createBrowserSignIn,
  createConsent,
  createWorkspaceForGoogleUser,
  deleteExpiredBrowserSignIns,
  getActiveOAuthAccess,
  getBrowserSession,
  getConsentForUser,
  listActiveConsents,
  revokeBrowserSession,
  revokeClientConsents,
  revokeConsent,
  selectGoogleAccount,
  setConsentExpiry,
  upsertGoogleUser,
} from "./d1-queries.js";
import type {
  BrowserSession,
  D1Account,
  D1DatabaseBinding,
  GoogleProfile,
  OAuthAccessContext,
  OAuthConsentRecord,
} from "./d1-types.js";

export { D1_SCHEMA_STATEMENTS, initializeD1Schema } from "./d1-schema.js";
export type {
  BrowserSession,
  D1Account,
  D1DatabaseBinding,
  D1PreparedStatement,
  D1Result,
  D1User,
  D1Workspace,
  GoogleProfile,
  OAuthAccessContext,
  OAuthConsentRecord,
} from "./d1-types.js";

interface AccountRow {
  userId: string;
  googleSub: string;
  displayName: string;
  email: string;
  emailVerified: number | boolean;
  avatarUrl: string | null;
  userStatus: string;
  userCreatedAt: string;
  userUpdatedAt: string;
  workspaceId: string;
  ownerUserId: string;
  name: string;
  workspaceStatus: string;
  workspaceCreatedAt: string;
  workspaceUpdatedAt: string;
}

type SessionRow = BrowserSession;

export class D1Store {
  constructor(private readonly database: D1DatabaseBinding) {}

  async getOrCreateGoogleAccount(profile: GoogleProfile): Promise<D1Account> {
    requireText(profile.googleSub, "googleSub");
    requireText(profile.displayName, "displayName");
    requireText(profile.email, "email");
    if (typeof profile.emailVerified !== "boolean") {
      throw new Error("emailVerified must be a boolean");
    }
    if (profile.avatarUrl != null) requireText(profile.avatarUrl, "avatarUrl");

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const results = await this.database.batch([
      this.database
        .prepare(upsertGoogleUser)
        .bind(
          userId,
          profile.googleSub,
          profile.displayName,
          profile.email,
          profile.emailVerified ? 1 : 0,
          profile.avatarUrl ?? null,
          now,
          now,
        ),
      this.database
        .prepare(createWorkspaceForGoogleUser)
        .bind(workspaceId, now, now, profile.googleSub),
    ]);
    for (const result of results) assertSuccess(result);

    const row = await first<AccountRow>(
      this.database.prepare(selectGoogleAccount).bind(profile.googleSub),
    );
    if (!row) throw new Error("Google account workspace could not be loaded");

    return {
      user: {
        id: row.userId,
        googleSub: row.googleSub,
        displayName: row.displayName,
        email: row.email,
        emailVerified: row.emailVerified === true || row.emailVerified === 1,
        avatarUrl: row.avatarUrl,
        status: row.userStatus,
        createdAt: row.userCreatedAt,
        updatedAt: row.userUpdatedAt,
      },
      workspace: {
        id: row.workspaceId,
        ownerUserId: row.ownerUserId,
        name: row.name,
        status: row.workspaceStatus,
        createdAt: row.workspaceCreatedAt,
        updatedAt: row.workspaceUpdatedAt,
      },
    };
  }

  async createBrowserSignIn(input: {
    state: string;
    nonce: string;
    verifier: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const results = await this.database.batch([
      this.database.prepare(deleteExpiredBrowserSignIns).bind(now),
      this.database
        .prepare(createBrowserSignIn)
        .bind(
          crypto.randomUUID(),
          await hashSecret(input.state),
          input.nonce,
          input.verifier,
          new Date(
            Date.now() + CONFIG.oauth.pendingTransactionTtlSeconds * 1000,
          ).toISOString(),
        ),
    ]);
    for (const result of results) assertSuccess(result);
  }

  async consumeBrowserSignIn(state: string): Promise<{
    nonce: string;
    verifier: string;
  } | null> {
    return first(
      this.database
        .prepare(consumeBrowserSignIn)
        .bind(
          new Date().toISOString(),
          await hashSecret(state),
          new Date().toISOString(),
        ),
    );
  }

  async createBrowserSession(input: {
    userId: string;
    expiresAt: string;
  }): Promise<{
    id: string;
    secret: string;
    expiresAt: string;
    createdAt: string;
  }> {
    requireText(input.userId, "userId");
    const now = new Date().toISOString();
    const expiresAt = futureTimestamp(input.expiresAt, now, "expiresAt");
    const id = crypto.randomUUID();
    const secret = randomSecret();
    const secretHash = await hashSecret(secret);
    const rows = await all<{ id: string }>(
      this.database
        .prepare(createBrowserSession)
        .bind(id, secretHash, expiresAt, now, input.userId),
    );
    if (rows.length === 0) throw new Error("Active user not found");
    return { id, secret, expiresAt, createdAt: now };
  }

  async getBrowserSession(
    secret: string,
    at = new Date().toISOString(),
  ): Promise<BrowserSession | null> {
    requireText(secret, "secret");
    const secretHash = await hashSecret(secret);
    return first<SessionRow>(
      this.database
        .prepare(getBrowserSession)
        .bind(secretHash, normalizeTimestamp(at, "at")),
    );
  }

  async revokeBrowserSession(
    secret: string,
    at = new Date().toISOString(),
  ): Promise<boolean> {
    requireText(secret, "secret");
    const secretHash = await hashSecret(secret);
    const result = await this.database
      .prepare(revokeBrowserSession)
      .bind(normalizeTimestamp(at, "at"), secretHash)
      .run();
    assertSuccess(result);
    return (result.meta?.changes ?? 0) > 0;
  }

  async createConsent(input: {
    userId: string;
    clientId: string;
    workspaceId: string;
    resource: string;
    scope: string;
    consentVersion: string;
    expiresAt: string;
  }): Promise<string> {
    for (const key of [
      "userId",
      "clientId",
      "workspaceId",
      "resource",
      "scope",
      "consentVersion",
    ] as const) {
      requireText(input[key], key);
    }
    const now = new Date().toISOString();
    const expiresAt = futureTimestamp(input.expiresAt, now, "expiresAt");
    const id = crypto.randomUUID();
    const rows = await all<{ id: string }>(
      this.database
        .prepare(createConsent)
        .bind(
          id,
          input.userId,
          input.clientId,
          input.workspaceId,
          input.resource,
          input.scope,
          input.consentVersion,
          expiresAt,
          now,
          input.workspaceId,
          input.userId,
        ),
    );
    if (rows.length === 0) throw new Error("Active user workspace not found");
    return id;
  }

  async getActiveOAuthAccess(
    context: OAuthAccessContext,
    at = new Date().toISOString(),
  ): Promise<OAuthAccessContext | null> {
    for (const key of [
      "userId",
      "workspaceId",
      "consentId",
      "clientId",
      "resource",
      "scope",
    ] as const) {
      requireText(context[key], key);
    }
    const row = await first<{
      userId: string;
      workspaceId: string;
      consentId: string;
    }>(
      this.database
        .prepare(getActiveOAuthAccess)
        .bind(
          context.userId,
          context.workspaceId,
          context.consentId,
          context.clientId,
          context.resource,
          context.scope,
          normalizeTimestamp(at, "at"),
        ),
    );
    return row ? { ...context, ...row } : null;
  }

  async setConsentExpiry(
    consentId: string,
    expiresAt: string,
  ): Promise<boolean> {
    requireText(consentId, "consentId");
    const now = new Date().toISOString();
    const expiry = futureTimestamp(expiresAt, now, "expiresAt");
    const result = await this.database
      .prepare(setConsentExpiry)
      .bind(expiry, consentId)
      .run();
    assertSuccess(result);
    return (result.meta?.changes ?? 0) > 0;
  }

  async getConsentForUser(
    userId: string,
    consentId: string,
  ): Promise<OAuthConsentRecord | null> {
    requireText(userId, "userId");
    requireText(consentId, "consentId");
    return first<OAuthConsentRecord>(
      this.database.prepare(getConsentForUser).bind(consentId, userId),
    );
  }

  async listActiveConsents(
    userId: string,
    at = new Date().toISOString(),
  ): Promise<OAuthConsentRecord[]> {
    requireText(userId, "userId");
    return all<OAuthConsentRecord>(
      this.database
        .prepare(listActiveConsents)
        .bind(userId, normalizeTimestamp(at, "at")),
    );
  }

  async revokeConsent(
    userId: string,
    consentId: string,
    at = new Date().toISOString(),
  ): Promise<boolean> {
    requireText(userId, "userId");
    requireText(consentId, "consentId");
    const result = await this.database
      .prepare(revokeConsent)
      .bind(normalizeTimestamp(at, "at"), userId, consentId)
      .run();
    assertSuccess(result);
    return (result.meta?.changes ?? 0) > 0;
  }

  async revokeClientConsents(
    userId: string,
    clientId: string,
    at = new Date().toISOString(),
  ): Promise<number> {
    requireText(userId, "userId");
    requireText(clientId, "clientId");
    const result = await this.database
      .prepare(revokeClientConsents)
      .bind(normalizeTimestamp(at, "at"), userId, clientId)
      .run();
    assertSuccess(result);
    return result.meta?.changes ?? 0;
  }
}
