import neo4j, {
  type Driver,
  type ManagedTransaction,
  type Result,
} from "neo4j-driver";
import { CONFIG } from "../config/config.js";
import { logger } from "../lib/logger.js";

export interface AuraDBOptions {
  uri: string;
  username: string;
  password: string;
  database: string;
  workspaceId: string;
}

export interface AuraTransaction {
  run(query: string, parameters?: Record<string, unknown>): Result;
}

const uniquenessConstraints = [
  `CREATE CONSTRAINT mentis_repository_workspace_identity IF NOT EXISTS
   FOR (r:Repository) REQUIRE (r.workspaceId, r.identity) IS UNIQUE`,
  `CREATE CONSTRAINT mentis_task_workspace_repository_identity IF NOT EXISTS
   FOR (t:Task) REQUIRE (t.workspaceId, t.repositoryIdentity, t.identity) IS UNIQUE`,
  `CREATE CONSTRAINT mentis_attempt_workspace_id IF NOT EXISTS
   FOR (a:Attempt) REQUIRE (a.workspaceId, a.id) IS UNIQUE`,
] as const;

export class AuraDB {
  private readonly driver: Driver;
  private readonly options: Readonly<AuraDBOptions>;

  constructor(options: AuraDBOptions) {
    for (const key of [
      "uri",
      "username",
      "password",
      "database",
      "workspaceId",
    ] as const) {
      if (
        typeof options[key] !== "string" ||
        options[key].trim().length === 0
      ) {
        throw new Error(`${key} must be a non-empty string`);
      }
    }
    this.options = Object.freeze({ ...options });
    this.driver = neo4j.driver(
      this.options.uri,
      neo4j.auth.basic(this.options.username, this.options.password),
    );
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async ensureConstraints(): Promise<void> {
    const session = this.driver.session({ database: this.options.database });
    try {
      for (const query of uniquenessConstraints) await session.run(query);
    } finally {
      await session.close();
    }
  }

  async read<T>(
    work: (transaction: AuraTransaction) => Promise<T>,
    config?: { timeout?: number },
    _requestId?: string,
  ): Promise<T> {
    const session = this.driver.session({ database: this.options.database });
    const timeout = Math.min(
      config?.timeout ?? CONFIG.neo4j.readTimeoutMs,
      CONFIG.neo4j.readTimeoutMs,
    );
    logger.debug("AuraDB read transaction", _requestId);
    try {
      return await session.executeRead(
        (transaction) =>
          work(new WorkspaceTransaction(transaction, this.options.workspaceId)),
        { ...config, timeout },
      );
    } finally {
      await session.close();
    }
  }

  async writeTx<T>(
    work: (transaction: AuraTransaction) => Promise<T>,
    _requestId?: string,
  ): Promise<T> {
    const session = this.driver.session({ database: this.options.database });
    logger.debug("AuraDB write transaction", _requestId);
    try {
      return await session.executeWrite((transaction) =>
        work(new WorkspaceTransaction(transaction, this.options.workspaceId)),
      );
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

class WorkspaceTransaction implements AuraTransaction {
  constructor(
    private readonly transaction: ManagedTransaction,
    private readonly workspaceId: string,
  ) {}

  run(query: string, parameters: Record<string, unknown> = {}): Result {
    if (!isWorkspaceRestrictedQuery(query)) {
      throw new Error(
        "AuraDB queries must scope every private node to a workspace",
      );
    }
    return this.transaction.run(query, {
      ...parameters,
      workspaceId: this.workspaceId,
    });
  }
}

function isWorkspaceRestrictedQuery(query: string): boolean {
  const clauses = [
    ...query.matchAll(
      /\b(?:OPTIONAL\s+MATCH|MATCH|CREATE|MERGE)\b([\s\S]*?)(?=\b(?:WHERE|WITH|RETURN|SET|REMOVE|DELETE|DETACH\s+DELETE|ORDER\s+BY|LIMIT|UNWIND|CALL|ON\s+CREATE|ON\s+MATCH|OPTIONAL\s+MATCH|MATCH|CREATE|MERGE)\b|$)/gi,
    ),
  ];
  if (clauses.length === 0) return false;

  let nodeCount = 0;
  for (const clause of clauses) {
    const nodes = [...clause[1].matchAll(/\(([^()]*)\)/g)];
    for (const node of nodes) {
      nodeCount += 1;
      if (
        !/^\s*(?:[A-Za-z_]\w*\s*)?:\s*(?:Repository|Task|Attempt)\b/.test(
          node[1],
        ) ||
        !/\{[^}]*\bworkspaceId\s*:\s*\$workspaceId\b[^}]*\}/.test(node[1])
      ) {
        return false;
      }
    }
  }
  return nodeCount > 0;
}
