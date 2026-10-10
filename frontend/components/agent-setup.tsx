"use client";

import { Check, ChevronDown, CodeXml, Link } from "lucide-react";
import { Select } from "radix-ui";
import { useId, useState } from "react";
import { CopyButton } from "@/components/account/shared";
import { Logo } from "@/components/logo";
import { agentSetups, type SetupAgent } from "@/lib/agent-setup";

export function AgentSetup({ allAgents = false }: { allAgents?: boolean }) {
  const id = useId();
  const [agent, setAgent] = useState<SetupAgent>("url");
  const setup = agentSetups[agent];
  const agents = Object.entries(agentSetups).filter(
    ([key]) => allAgents || ["url", "cursor", "claude", "codex"].includes(key),
  );

  return (
    <div className="agent-setup">
      <label htmlFor={id}>Choose your agent</label>
      <Select.Root
        value={agent}
        onValueChange={(value) => setAgent(value as SetupAgent)}
      >
        <Select.Trigger id={id} className="agent-select">
          <Select.Value />
          <Select.Icon>
            <ChevronDown size={16} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="agent-menu"
            position="popper"
            sideOffset={6}
          >
            <Select.Viewport>
              {agents.map(([key, item]) => (
                <Select.Item key={key} value={key} className="agent-option">
                  <Select.ItemText>
                    <span className="agent-choice">
                      {item.logo ? (
                        <Logo name={item.logo} size={22} />
                      ) : key === "cursor" ? (
                        <CodeXml size={22} aria-hidden="true" />
                      ) : (
                        <Link size={22} aria-hidden="true" />
                      )}
                      {item.name}
                    </span>
                  </Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={15} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <div className="agent-instructions" aria-live="polite">
        <p>{setup.instructions}</p>
        <div className="setup-code">
          <div>
            <span>{setup.label}</span>
            <CopyButton key={agent} value={setup.code} label="Copy" />
          </div>
          <pre role="group" tabIndex={0} aria-label={setup.label}>
            <code>{setup.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
