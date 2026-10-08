"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { claudeCommand, clientConfig, mcpServerUrl } from "@/lib/demo";

function CopyBlock({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
    }
  }
  return (
    <div className="copy-block">
      <div className="code-header">
        <span>{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="copy-button"
        >
          {state === "copied" ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          {state === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre role="group" tabIndex={0} aria-label={label}>
        <code>{code}</code>
      </pre>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? `${label} copied.` : ""}
      </span>
      {state === "error" ? (
        <p className="copy-error" role="status">
          Copy failed. Select the code and copy it manually.
        </p>
      ) : null}
    </div>
  );
}

export function Setup() {
  return (
    <div className="setup-panel">
      <div className="setup-panel-title">
        <Terminal size={17} aria-hidden="true" />
        <span>Remote MCP setup</span>
      </div>
      <p>
        Connect to the hosted Mentis Worker. No local server or database is
        required.
      </p>
      <CopyBlock code={mcpServerUrl} label="MCP server URL" />
      <p>For Cursor, add this to your MCP configuration file.</p>
      <CopyBlock code={clientConfig} label="MCP client configuration" />
      <p>For Claude Code, run this command.</p>
      <CopyBlock code={claudeCommand} label="Claude Code command" />
      <p>
        Start the connection in your client. Review the permissions, then
        continue with Google to approve access to your private workspace.
      </p>
    </div>
  );
}
