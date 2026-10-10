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
  workspaceName: string;
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
  redirectUri: string | null;
  scope: string;
  expiresAt: string;
  createdAt: string;
}
