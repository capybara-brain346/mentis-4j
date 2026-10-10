import { ArrowDown, ArrowRight, FileCode2, GitBranch } from "lucide-react";
import { Status } from "@/components/demo";
import { Logo } from "@/components/logo";

export function MemoryGraph() {
  return (
    <div
      className="memory-map"
      role="group"
      aria-label="Example memory graph: coding agents send records through Mentis MCP to Neo4j, which links a repository to a task and its attempts"
    >
      <div className="memory-services">
        <div className="memory-agent">
          <div className="agent-logos">
            <span role="img" aria-label="Claude" title="Claude">
              <Logo name="claude" size={30} />
            </span>
            <span role="img" aria-label="Codex" title="Codex">
              <Logo name="codex" size={30} />
            </span>
            <span role="img" aria-label="Hermes Agent" title="Hermes Agent">
              <Logo name="hermes" size={30} />
            </span>
            <span role="img" aria-label="OpenClaw" title="OpenClaw">
              <Logo name="openclaw" size={30} />
            </span>
            <span role="img" aria-label="OpenCode" title="OpenCode">
              <Logo name="opencode" size={30} />
            </span>
            <span role="img" aria-label="Pi Agent" title="Pi Agent">
              <Logo name="pi" size={30} />
            </span>
          </div>
        </div>
        <div className="memory-transfer">
          <span>Attempt records</span>
          <ArrowRight size={24} aria-hidden="true" />
        </div>
        <div className="memory-service">
          <Logo name="mentis" size={36} />
          <strong>Mentis MCP</strong>
        </div>
        <div className="memory-transfer">
          <span>Stored in</span>
          <ArrowRight size={24} aria-hidden="true" />
        </div>
        <div className="memory-service">
          <Logo name="neo4j" size={36} />
          <strong>Neo4j</strong>
        </div>
      </div>
      <div className="stored-graph">
        <div className="repository-node">
          <GitBranch size={18} aria-hidden="true" />
          <span>Repository</span>
        </div>
        <div className="node-link">
          <ArrowDown size={18} aria-hidden="true" />
        </div>
        <div className="task-node">
          <FileCode2 size={18} aria-hidden="true" />
          <div>
            <span>Task</span>
            <strong>Fix the login loop</strong>
          </div>
        </div>
        <div className="attempt-branches" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="graph-attempt-records">
          <div className="attempt-node">
            <Status result="failed" />
            <h3>Change the redirect</h3>
            <p>The browser returns to sign-in.</p>
          </div>
          <div className="attempt-node">
            <Status result="passed" />
            <h3>Keep the session cookie</h3>
            <p>The browser stays signed in.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
