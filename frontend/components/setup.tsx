import { AgentSetup } from "@/components/agent-setup";

export function Setup() {
  return (
    <div className="setup-panel">
      <h3>Remote MCP setup</h3>
      <AgentSetup allAgents />
    </div>
  );
}
