"use client";

import {
  ArrowRight,
  Cable,
  Check,
  ChevronDown,
  CircleAlert,
  CodeXml,
  ExternalLink,
  LockKeyhole,
  Plus,
  Search,
  Terminal,
  Unplug,
  X,
} from "lucide-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { CopyButton } from "@/components/account/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "@/lib/account";
import { type ClientId, type Connection } from "@/lib/account-preview";
import { mcpServerUrl } from "@/lib/demo";

export function ClientMark({ id }: { id: string }) {
  return (
    <span className={`client-mark ${id}`}>
      {id === "cursor" ? (
        <CodeXml size={24} aria-hidden="true" />
      ) : (
        <Terminal size={24} aria-hidden="true" />
      )}
    </span>
  );
}

function ConnectionRow({
  client,
  onDisconnect,
  isPreview,
}: {
  client: Connection;
  onDisconnect: () => void;
  isPreview: boolean;
}) {
  return (
    <article className="connection-row">
      <div className="connection-main">
        <ClientMark id={client.id} />
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
            <Button asChild variant="outline" className="account-button">
              <Link href={`/authorize?preview=1&client=${client.id}`}>
                Reconnect <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className="connection-meta">
        <span>
          {client.status === "active"
            ? `Access ends ${isPreview ? client.expires : new Date(client.expires).toLocaleDateString()}`
            : client.status === "expired"
              ? `Expired ${client.expires}`
              : "No access to this workspace"}
        </span>
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
            <dd>
              {isPreview
                ? client.connected
                : new Date(client.connected).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>Grant period</dt>
            <dd>7 days from first token exchange</dd>
          </div>
          <div>
            <dt>Client identity</dt>
            <dd>
              {isPreview ? "Example registered client." : "Registered client."}{" "}
              Name is not verified.
            </dd>
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

function ConnectDialog() {
  const [serverUrl, setServerUrl] = useState(mcpServerUrl);
  const [clientId, setClientId] = useState<ClientId>("cursor");
  const [urlError, setUrlError] = useState("");
  let valid = false;
  try {
    valid = new URL(serverUrl).protocol === "https:";
  } catch {
    /* Native input reports invalid URLs. */
  }
  const config = JSON.stringify(
    { mcpServers: { mentis: { url: serverUrl } } },
    null,
    2,
  );
  const command = `claude mcp add --transport http mentis '${serverUrl.replace(/'/g, "'\\''")}'`;
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
            Add the Mentis server to your client, then approve access in your
            browser.
          </Dialog.Description>
          <div className="setup-url">
            <label htmlFor="server-url">MCP server URL</label>
            <input
              id="server-url"
              type="url"
              value={serverUrl}
              onChange={(event) => {
                setServerUrl(event.target.value);
                setUrlError("");
              }}
              onBlur={() =>
                setUrlError(valid ? "" : "Enter a valid HTTPS server URL.")
              }
              aria-describedby="server-url-note server-url-error"
              aria-invalid={urlError ? true : undefined}
            />
            <p id="server-url-note">
              Hosted Mentis Worker. Change this only for your own deployment.
            </p>
            <span id="server-url-error" className="field-error" role="status">
              {urlError}
            </span>
          </div>
          <Tabs
            defaultValue="cursor"
            onValueChange={(value) =>
              setClientId(value === "claude" ? "claude" : "cursor")
            }
            className="client-setup-tabs"
          >
            <TabsList aria-label="Choose your MCP client">
              <TabsTrigger value="cursor">Cursor</TabsTrigger>
              <TabsTrigger value="claude">Claude Code</TabsTrigger>
              <TabsTrigger value="other">Other clients</TabsTrigger>
            </TabsList>
            <TabsContent value="cursor">
              <h3>Add a remote MCP server</h3>
              <p>
                Open Cursor’s MCP settings. Add this configuration to your MCP
                configuration file.
              </p>
              <div className="setup-code">
                <div>
                  <span>mcp.json</span>
                  {valid && (
                    <CopyButton value={config} label="Copy configuration" />
                  )}
                </div>
                <pre tabIndex={0}>{config}</pre>
              </div>
            </TabsContent>
            <TabsContent value="claude">
              <h3>Add Mentis from the command line</h3>
              <p>
                Run the command below, then open Claude Code to complete
                sign-in.
              </p>
              <div className="setup-code">
                <div>
                  <span>Terminal</span>
                  {valid && <CopyButton value={command} label="Copy command" />}
                </div>
                <pre tabIndex={0}>{command}</pre>
              </div>
            </TabsContent>
            <TabsContent value="other">
              <h3>Use an HTTP MCP connection</h3>
              <p>
                Add the server URL in your client’s MCP settings. Use a client
                that supports remote HTTP servers and OAuth sign-in.
              </p>
              <div className="setup-code">
                <div>
                  <span>Server URL</span>
                  {valid && <CopyButton value={serverUrl} label="Copy URL" />}
                </div>
                <pre tabIndex={0}>{serverUrl}</pre>
              </div>
            </TabsContent>
          </Tabs>
          <div className="setup-next">
            <LockKeyhole size={18} aria-hidden="true" />
            <p>
              Your client opens a consent screen. Review all permissions before
              you allow access.
            </p>
          </div>
          <Button asChild className="account-button setup-preview-button">
            <Link href={`/authorize?preview=1&client=${clientId}`}>
              Preview consent <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConnectionsView() {
  const { connections, disconnect, isPreview, busy, error } = useAccount();
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
        isPreview
          ? `${selected.name} disconnected in this preview. It has no access to the example workspace.`
          : `${selected.name} disconnected. It no longer has access to your workspace.`,
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
          <h1>Connected clients</h1>
          <p>Choose which coding agents can use your workspace.</p>
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
              isPreview={isPreview}
              onDisconnect={() => setSelected(client)}
            />
          ))
        ) : (
          <div className="clients-empty">
            <Cable size={28} aria-hidden="true" />
            <h2>{query ? "No matching clients" : "No clients in this view"}</h2>
            <p>
              {query
                ? "Try another name or clear the filters."
                : "Connect a coding agent, or choose another status."}
            </p>
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
      <div className="connections-footnote">
        <CircleAlert size={17} aria-hidden="true" />
        <p>
          Access expires seven days after the first token exchange. Clients must
          request approval again when the grant ends. Disconnecting does not
          delete your memory.
        </p>
      </div>
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
              {isPreview ? " This action changes example data only." : ""}
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
