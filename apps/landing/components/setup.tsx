"use client";

import { useRef, useState, useEffect } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  clientConfig,
  environmentCommands,
  indexCommand,
  installCommands,
} from "@/lib/demo";

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
      <pre tabIndex={0} aria-label={label}>
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
        <span>Local MCP setup</span>
        <span className="setup-count">4 steps</span>
      </div>
      <Accordion
        type="multiple"
        defaultValue={["install"]}
        className="setup-steps"
      >
        <AccordionItem value="install">
          <AccordionTrigger>
            <span className="step-index">1</span>Get the source and build
          </AccordionTrigger>
          <AccordionContent>
            <p>Use Node.js 22 or later, npm, Git, and Docker Compose.</p>
            <CopyBlock code={installCommands} label="Install commands" />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="database">
          <AccordionTrigger>
            <span className="step-index">2</span>Set credentials and start Neo4j
          </AccordionTrigger>
          <AccordionContent>
            <p>
              Replace the placeholders with your values. Use the same database
              password when you start Mentis.
            </p>
            <CopyBlock code={environmentCommands} label="Database commands" />
            <p>
              Neo4j listens on localhost. The password initializes a new volume;
              it does not change an existing account.
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="index">
          <AccordionTrigger>
            <span className="step-index">3</span>Create the search index
          </AccordionTrigger>
          <AccordionContent>
            <p>
              Run this in <a href="http://127.0.0.1:7474">Neo4j Browser</a>.
              Wait for <code>SHOW VECTOR INDEXES</code> to report{" "}
              <code>attempt_embedding</code> as <code>ONLINE</code>.
            </p>
            <CopyBlock code={indexCommand} label="Vector index query" />
            <p>
              Search needs this index. No automatic migration or backfill is
              provided.
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="connect">
          <AccordionTrigger>
            <span className="step-index">4</span>Connect your coding agent
          </AccordionTrigger>
          <AccordionContent>
            <p>
              Add this stdio configuration to an MCP client that supports it.
              Replace the absolute path and credentials. Your client starts the
              server.
            </p>
            <CopyBlock code={clientConfig} label="MCP client configuration" />
            <p>
              For a manual start in the repository, run <code>npm start</code>.
              Search and record calls need the OpenRouter key.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
