"use client";

import {
  Cable,
  Check,
  ChevronDown,
  LockKeyhole,
  Plus,
  Search,
  Terminal,
  Unplug,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { AgentSetup } from "@/components/agent-setup";
import { Logo, type LogoName } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { type Connection, useAccount } from "@/lib/account";

export function ClientMark({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]/g, "");
  const logo: LogoName | undefined =
    normalized.includes("chatgpt") || normalized.includes("openai")
      ? "openai"
      : (
          [
            "claude",
            "codex",
            "cursor",
            "amp",
            "opencode",
            "openclaw",
            "hermes",
            "pi",
          ] as const
        ).find((agent) =>
          agent === "pi" || agent === "amp"
            ? new RegExp(`\\b${agent}\\b`).test(lower) ||
              normalized.startsWith(`${agent}agent`)
            : normalized.includes(agent),
        );

  return (
    <span className="client-mark">
      {logo ? <Logo name={logo} /> : <Terminal size={24} aria-hidden="true" />}
    </span>
  );
}

function ConnectionRow({
  client,
  onDisconnect,
}: {
  client: Connection;
  onDisconnect: () => void;
}) {
  return (
    <article className="connection-row">
      <div className="connection-main">
        <ClientMark name={client.name} />
        <div className="client-identity">
          <h2>{client.name}</h2>
          <p>{client.description}</p>
        </div>
        <span className={`status-badge ${client.status}`}>
          {client.status === "active"
            ? "Connected"
            : client.status === "expired"
              ? "Access expired"
              : "Disconnected"}
        </span>
        <div className="connection-action">
          {client.status === "active" ? (
            <Button
              variant="outline"
              className="account-button"
              onClick={onDisconnect}
            >
              Disconnect
            </Button>
          ) : (
            <ConnectDialog />
          )}
        </div>
      </div>
      <div className="connection-meta">
        <span className="connection-permissions">
          Read, write, and delete memory
        </span>
      </div>
      <details className="connection-details">
        <summary>
          Access details <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <dl>
          <div>
            <dt>Approved</dt>
            <dd>{new Date(client.connected).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Permissions</dt>
            <dd>
              Search and read memory; record attempts; update conclusions;
              delete attempts.
            </dd>
          </div>
        </dl>
      </details>
    </article>
  );
}

export function ConnectDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button className="account-button">
          <Plus aria-hidden="true" /> Connect a client
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="account-dialog-overlay" />
        <Dialog.Content className="account-ui account-dialog connect-dialog">
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="dialog-close"
              aria-label="Close client setup"
            >
              <X aria-hidden="true" />
            </Button>
          </Dialog.Close>
          <Dialog.Title>Connect your coding agent</Dialog.Title>
          <Dialog.Description>
            Add Mentis to your agent. Sign in with Google when you connect.
          </Dialog.Description>
          <AgentSetup />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DashboardView() {
  const { connections, disconnect, busy, error } = useAccount();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Connection | null>(null);
  const [notice, setNotice] = useState("");
  const shown = connections.filter(
    (client) =>
      client.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === "all" || client.status === filter),
  );
  const activeCount = connections.filter(
    (client) => client.status === "active",
  ).length;
  async function confirmDisconnect() {
    if (!selected || busy) return;
    try {
      await disconnect(selected.id);
      setNotice(
        `${selected.name} disconnected. It no longer has access to your memory.`,
      );
      setSelected(null);
    } catch {
      // Keep the confirmation open. The account provider shows the failure.
    }
  }
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <h1>Dashboard</h1>
          <p>Connected clients</p>
        </div>
        <ConnectDialog />
      </div>
      <div className="access-summary">
        <ShieldAccess />
        <p>
          <strong>You control the connection.</strong> Each approved client can
          read, write, and delete memory. Disconnect it to stop access.
        </p>
      </div>
      <div className="connections-toolbar">
        <div className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search clients"
            aria-label="Search clients"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <label className="connection-filter">
          <span className="sr-only">Filter clients by status</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All clients</option>
            <option value="active">Connected</option>
            <option value="expired">Expired</option>
            <option value="disconnected">Disconnected</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>
      <div className="client-list-label">
        <span>
          {shown.length} {shown.length === 1 ? "client" : "clients"}
        </span>
        <span>{activeCount} connected</span>
      </div>
      <div className="connection-list">
        {shown.length > 0 ? (
          shown.map((client) => (
            <ConnectionRow
              key={client.id}
              client={client}
              onDisconnect={() => setSelected(client)}
            />
          ))
        ) : (
          <div className="clients-empty">
            <Cable size={28} aria-hidden="true" />
            <h2>
              {query
                ? "No matching clients"
                : connections.length === 0
                  ? "Connect your first client"
                  : "No clients in this view"}
            </h2>
            <p>
              {query
                ? "Try another name or clear the filters."
                : connections.length === 0
                  ? "Use Connect a client to add Mentis to your agent."
                  : "Choose another status to see your clients."}
            </p>
            {connections.length > 0 && (
              <Button
                variant="secondary"
                className="account-button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="connection-feedback" role="status">
        {notice && (
          <>
            <Check size={16} aria-hidden="true" /> {notice}
          </>
        )}
      </p>
      <Dialog.Root
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="account-dialog-overlay" />
          <Dialog.Content className="account-ui account-dialog disconnect-dialog">
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="dialog-close"
                aria-label="Close disconnect confirmation"
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
            <Unplug
              size={27}
              className="disconnect-symbol"
              aria-hidden="true"
            />
            <Dialog.Title>Disconnect {selected?.name}?</Dialog.Title>
            <Dialog.Description>
              This client will lose access to your workspace. It must request
              your approval to connect again.
            </Dialog.Description>
            <p className="disconnect-note">
              Your stored memory will stay in Mentis.
            </p>
            {error && (
              <p className="inline-alert" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary" className="account-button">
                  Keep connected
                </Button>
              </Dialog.Close>
              <Button
                variant="destructive"
                className="account-button"
                onClick={confirmDisconnect}
                disabled={busy}
              >
                {busy ? "Disconnecting…" : "Disconnect client"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function ShieldAccess() {
  return <LockKeyhole size={20} aria-hidden="true" />;
}
