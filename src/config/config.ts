const defaultBackendBaseUrl = "https://mcp.men-tis.xyz";

export const PUBLIC_CONFIG = {
  worker: {
    publicBaseUrl: defaultBackendBaseUrl,
    mcpPath: "/mcp",
  },
  frontend: {
    clientIcons: {
      claude: "claude.svg",
      "claude code": "claude.svg",
      codex: "codex.svg",
      amp: "amp.svg",
      opencode: "opencode.svg",
      openclaw: "openclaw-color.svg",
      "hermes agent": "hermes-agent.svg",
      "pi agent": "pi-agent.svg",
      openai: "openai.svg",
    },
    demoIntervalMs: 6_000,
    design: {
      colors: {
        background: "#f7f7f3",
        foreground: "#242721",
        surface: "#fcfcf9",
        secondary: "#eaece5",
        muted: "#60655c",
        border: "#daddd3",
        green: "#2c6247",
        "green-soft": "#e8f0e6",
        red: "#963f34",
        "red-soft": "#f8e9e2",
        amber: "#815c21",
      },
      bodyPx: 16,
      evidencePx: 14,
      controlPx: 44,
      iconPx: 28,
      narrowPx: 800,
      compactPx: 440,
      comparisonPx: 640,
      socialWidth: 1200,
      socialHeight: 630,
    },
    backendBaseUrl:
      process.env.NEXT_PUBLIC_MENTIS_BACKEND_URL ?? defaultBackendBaseUrl,
  },
} as const;

export const CONFIG = {
  app: { name: "mentis-4j", version: "0.1.0", envFile: ".env" },
  neo4j: {
    username: "neo4j",
    defaultUri: "bolt://127.0.0.1:7687",
    defaultDatabase: "neo4j",
    maxReadRows: 100,
    maxReadResponseBytes: 512_000,
    readTimeoutMs: 5_000,
  },
  embedding: {
    endpoint: "https://openrouter.ai/api/v1/embeddings",
    model: "voyageai/voyage-4",
    dimensions: 1024,
  },
  relevance: {
    endpoint: "https://openrouter.ai/api/alpha/decisions",
    model: "typesafe/jev-1.13",
    minimumScore: 0.5,
    batchSize: 20,
  },
  search: {
    defaultLimit: 10,
    maxLimit: 20,
    maxQueryLength: 4_000,
    maxVectorMatches: 200,
    maxAttemptsPerTask: 5,
    previewLength: 240,
  },
  logging: {
    defaultLevel: "debug",
    levels: { debug: 0, info: 1, error: 2 },
  },
  google: {
    issuer: "https://accounts.google.com",
  },
  oauth: {
    accessTokenTtlSeconds: 10 * 60,
    refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
    pendingTransactionTtlSeconds: 10 * 60,
    consentVersion: "1",
    grantPageLimit: 1_000,
  },
  frontend: {
    defaultBaseUrl: "http://127.0.0.1:6969",
    authProxyRequestTimeoutMs: 15_000,
    authProxyMaxBodyBytes: 4_096,
  },
  worker: PUBLIC_CONFIG.worker,
} as const;
