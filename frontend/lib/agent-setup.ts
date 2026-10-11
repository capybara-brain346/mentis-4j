import type { LogoName } from "@/components/logo";
import { claudeCommand, clientConfig, mcpServerUrl } from "@/lib/demo";

export const agentSetups = {
  url: {
    name: "Server URL",
    logo: null,
    label: "MCP server URL",
    instructions:
      "Add this URL to a client that supports HTTP MCP servers and OAuth sign-in.",
    code: mcpServerUrl,
  },
  cursor: {
    name: "Cursor",
    logo: "cursor",
    label: "Cursor configuration",
    instructions:
      "Add this to .cursor/mcp.json in your project, or to ~/.cursor/mcp.json for all projects. Then connect Mentis in Cursor’s MCP settings.",
    code: clientConfig,
  },
  claude: {
    name: "Claude Code",
    logo: "claude",
    label: "Claude Code command",
    instructions:
      "Run this command. In Claude Code, use /mcp to sign in to Mentis.",
    code: claudeCommand,
  },
  codex: {
    name: "Codex",
    logo: "codex",
    label: "Codex commands",
    instructions: "Run these commands to add Mentis and sign in.",
    code: `codex mcp add mentis --url '${mcpServerUrl}'\ncodex mcp login mentis`,
  },
  amp: {
    name: "Amp",
    logo: "amp",
    label: "Amp command",
    instructions:
      "Run this command, then start Amp. Sign in when Amp opens your browser.",
    code: `amp mcp add mentis '${mcpServerUrl}'`,
  },
  opencode: {
    name: "OpenCode",
    logo: "opencode",
    label: "OpenCode configuration",
    instructions:
      "Add this to opencode.json. Run opencode mcp auth mentis to sign in.",
    code: JSON.stringify(
      { mcp: { mentis: { type: "remote", url: mcpServerUrl } } },
      null,
      2,
    ),
  },
  openclaw: {
    name: "OpenClaw",
    logo: "openclaw",
    label: "OpenClaw commands",
    instructions: "Run these commands to add Mentis and sign in.",
    code: `openclaw mcp add mentis --url '${mcpServerUrl}' --transport streamable-http\nopenclaw mcp login mentis`,
  },
  hermes: {
    name: "Hermes Agent",
    logo: "hermes",
    label: "Hermes configuration",
    instructions:
      "Add this to ~/.hermes/config.yaml. Run hermes mcp login mentis to sign in.",
    code: `mcp_servers:\n  mentis:\n    url: "${mcpServerUrl}"\n    auth: oauth`,
  },
  pi: {
    name: "Pi",
    logo: "pi",
    label: "Pi commands",
    instructions:
      "Run these commands to add Mentis and sign in. Use /reload if Pi is already running.",
    code: `pi mcp add mentis --url '${mcpServerUrl}'\npi mcp login mentis`,
  },
} satisfies Record<
  string,
  {
    name: string;
    logo: LogoName | null;
    label: string;
    instructions: string;
    code: string;
  }
>;

export type SetupAgent = keyof typeof agentSetups;
