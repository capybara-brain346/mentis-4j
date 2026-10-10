import { assertSuccess } from "../utils/d1-results.js";
import type { D1DatabaseBinding } from "./d1-types.js";

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
    redirect_uri TEXT,
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
