export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Result<T> {
  success: boolean;
  results?: T[];
  error?: string;
  meta?: { changes?: number };
}

export interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}

export const D1_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    email_verified INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (owner_user_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    resource TEXT NOT NULL,
    scope TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id, workspace_id)
      REFERENCES workspaces(owner_user_id, id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS auth_transactions (
    id TEXT PRIMARY KEY,
    transaction_type TEXT NOT NULL,
    state_hash TEXT NOT NULL UNIQUE,
    nonce TEXT NOT NULL,
    validated_request TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS oauth_consents_user_client ON oauth_consents(user_id, client_id)",
  "CREATE INDEX IF NOT EXISTS auth_transactions_expiry ON auth_transactions(expires_at)",
] as const;

export async function initializeD1Schema(
  database: D1DatabaseBinding,
): Promise<void> {
  const results = await database.batch(
    D1_SCHEMA_STATEMENTS.map((statement) => database.prepare(statement)),
  );
  for (const result of results) assertSuccess(result);
}

export interface GoogleProfile {
  googleSub: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl?: string | null;
}

export interface D1User {
  id: string;
  googleSub: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface D1Workspace {
  id: string;
  ownerUserId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface D1Account {
  user: D1User;
  workspace: D1Workspace;
}

export interface BrowserSession {
  id: string;
  userId: string;
  workspaceId: string;
  displayName: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export interface OAuthAccessContext {
  userId: string;
  workspaceId: string;
  consentId: string;
  clientId: string;
  resource: string;
  scope: string;
}

export interface OAuthConsentRecord {
  id: string;
  clientId: string;
  resource: string;
  scope: string;
  expiresAt: string;
  createdAt: string;
}

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

interface SessionRow {
  id: string;
  userId: string;
  workspaceId: string;
  displayName: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

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
        .prepare(
          `
          INSERT INTO users
            (id, google_sub, display_name, email, email_verified, avatar_url,
             status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
          ON CONFLICT(google_sub) DO UPDATE SET
            display_name = excluded.display_name,
            email = excluded.email,
            email_verified = excluded.email_verified,
            avatar_url = excluded.avatar_url,
            updated_at = excluded.updated_at
        `,
        )
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
        .prepare(
          `
          INSERT INTO workspaces
            (id, owner_user_id, name, status, created_at, updated_at)
          SELECT ?, id, 'Private workspace', 'active', ?, ?
          FROM users
          WHERE google_sub = ?
          ON CONFLICT(owner_user_id) DO NOTHING
        `,
        )
        .bind(workspaceId, now, now, profile.googleSub),
    ]);
    for (const result of results) assertSuccess(result);

    const row = await first<AccountRow>(
      this.database
        .prepare(
          `
          SELECT
            u.id AS userId,
            u.google_sub AS googleSub,
            u.display_name AS displayName,
            u.email AS email,
            u.email_verified AS emailVerified,
            u.avatar_url AS avatarUrl,
            u.status AS userStatus,
            u.created_at AS userCreatedAt,
            u.updated_at AS userUpdatedAt,
            w.id AS workspaceId,
            w.owner_user_id AS ownerUserId,
            w.name AS name,
            w.status AS workspaceStatus,
            w.created_at AS workspaceCreatedAt,
            w.updated_at AS workspaceUpdatedAt
          FROM users u
          JOIN workspaces w ON w.owner_user_id = u.id
          WHERE u.google_sub = ?
        `,
        )
        .bind(profile.googleSub),
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
        .prepare(
          `
          INSERT INTO sessions (id, secret_hash, user_id, expires_at, revoked_at, created_at)
          SELECT ?, ?, id, ?, NULL, ?
          FROM users
          WHERE id = ?
            AND status = 'active'
            AND EXISTS (
              SELECT 1 FROM workspaces
              WHERE owner_user_id = users.id AND status = 'active'
            )
          RETURNING id
        `,
        )
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
        .prepare(
          `
          SELECT
            s.id AS id,
            u.id AS userId,
            w.id AS workspaceId,
            u.display_name AS displayName,
            u.email AS email,
            s.expires_at AS expiresAt,
            s.created_at AS createdAt
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          JOIN workspaces w ON w.owner_user_id = u.id
          WHERE s.secret_hash = ?
            AND s.revoked_at IS NULL
            AND s.expires_at > ?
            AND u.status = 'active'
            AND w.status = 'active'
        `,
        )
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
      .prepare(
        `
        UPDATE sessions
        SET revoked_at = ?
        WHERE secret_hash = ? AND revoked_at IS NULL
      `,
      )
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
        .prepare(
          `
          INSERT INTO oauth_consents
            (id, user_id, client_id, workspace_id, resource, scope,
             consent_version, expires_at, revoked_at, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?
          WHERE EXISTS (
            SELECT 1
            FROM users u
            JOIN workspaces w ON w.owner_user_id = u.id
            WHERE w.id = ?
              AND u.id = ?
              AND u.status = 'active'
              AND w.status = 'active'
          )
          RETURNING id
        `,
        )
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
        .prepare(
          `
          SELECT u.id AS userId, w.id AS workspaceId, c.id AS consentId
          FROM users u
          JOIN workspaces w ON w.owner_user_id = u.id
          JOIN oauth_consents c ON c.user_id = u.id AND c.workspace_id = w.id
          WHERE u.id = ?
            AND w.id = ?
            AND c.id = ?
            AND c.client_id = ?
            AND c.resource = ?
            AND c.scope = ?
            AND u.status = 'active'
            AND w.status = 'active'
            AND c.revoked_at IS NULL
            AND c.expires_at > ?
        `,
        )
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
      .prepare(
        `
        UPDATE oauth_consents
        SET expires_at = ?
        WHERE id = ? AND revoked_at IS NULL
      `,
      )
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
      this.database
        .prepare(
          `
          SELECT id, client_id AS clientId, resource, scope,
                 expires_at AS expiresAt, created_at AS createdAt
          FROM oauth_consents
          WHERE id = ? AND user_id = ? AND revoked_at IS NULL
        `,
        )
        .bind(consentId, userId),
    );
  }

  async listActiveConsents(
    userId: string,
    at = new Date().toISOString(),
  ): Promise<OAuthConsentRecord[]> {
    requireText(userId, "userId");
    return all<OAuthConsentRecord>(
      this.database
        .prepare(
          `
          SELECT id, client_id AS clientId, resource, scope,
                 expires_at AS expiresAt, created_at AS createdAt
          FROM oauth_consents
          WHERE user_id = ?
            AND revoked_at IS NULL
            AND expires_at > ?
          ORDER BY created_at DESC
        `,
        )
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
      .prepare(
        `
        UPDATE oauth_consents
        SET revoked_at = ?
        WHERE user_id = ? AND id = ? AND revoked_at IS NULL
      `,
      )
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
      .prepare(
        `
        UPDATE oauth_consents
        SET revoked_at = ?
        WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL
      `,
      )
      .bind(normalizeTimestamp(at, "at"), userId, clientId)
      .run();
    assertSuccess(result);
    return result.meta?.changes ?? 0;
  }
}

async function first<T>(statement: D1PreparedStatement): Promise<T | null> {
  return (await all<T>(statement))[0] ?? null;
}

async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  assertSuccess(result);
  return result.results ?? [];
}

function assertSuccess(result: D1Result<unknown>): void {
  if (!result.success) throw new Error(result.error ?? "D1 query failed");
}

function requireText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return timestamp.toISOString();
}

function futureTimestamp(value: string, now: string, field: string): string {
  const expiresAt = normalizeTimestamp(value, field);
  if (expiresAt <= now) throw new Error(`${field} must be in the future`);
  return expiresAt;
}

async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
