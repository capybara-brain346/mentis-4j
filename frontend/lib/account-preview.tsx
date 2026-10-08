"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ClientId = "cursor" | "claude" | "codex";
export type Connection = {
  id: string;
  name: string;
  description: string;
  status: "active" | "expired" | "disconnected";
  connected: string;
  expires: string;
};

export const previewAccount = {
  name: "Alex Morgan",
  email: "alex.morgan@example.com",
  workspace: "Alex’s workspace",
  workspaceId: "ws_example_alex",
};

const initialConnections: Connection[] = [
  {
    id: "cursor",
    name: "Cursor",
    description: "Code editor",
    status: "active",
    connected: "6 Oct 2026",
    expires: "13 Oct 2026",
  },
  {
    id: "claude",
    name: "Claude Code",
    description: "Command line agent",
    status: "active",
    connected: "7 Oct 2026",
    expires: "14 Oct 2026",
  },
  {
    id: "codex",
    name: "Codex",
    description: "Coding agent",
    status: "expired",
    connected: "30 Sep 2026",
    expires: "7 Oct 2026",
  },
];

type PreviewContext = {
  ready: boolean;
  enabled: boolean;
  connections: Connection[];
  start: () => void;
  signOut: () => void;
  disconnect: (id: ClientId) => void;
  connect: (id: ClientId) => void;
};

const Context = createContext<PreviewContext | null>(null);
const storageKey = "mentis-account-preview";

export function AccountPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [connections, setConnections] = useState(initialConnections);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const data: unknown = JSON.parse(saved);
        if (typeof data === "object" && data !== null) {
          setEnabled("enabled" in data && data.enabled === true);
          if (
            "states" in data &&
            typeof data.states === "object" &&
            data.states !== null
          ) {
            const states = data.states as Record<string, unknown>;
            setConnections(
              initialConnections.map((client) => {
                const saved = states[client.id];
                if (
                  typeof saved !== "object" ||
                  saved === null ||
                  !("status" in saved)
                )
                  return client;
                const status = saved.status;
                if (
                  status !== "active" &&
                  status !== "expired" &&
                  status !== "disconnected"
                )
                  return client;
                return {
                  ...client,
                  status,
                  connected:
                    "connected" in saved && typeof saved.connected === "string"
                      ? saved.connected
                      : client.connected,
                  expires:
                    "expires" in saved && typeof saved.expires === "string"
                      ? saved.expires
                      : client.expires,
                };
              }),
            );
          }
        }
      }
    } catch {
      // Preview storage is optional. It never represents an authenticated session.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          enabled,
          states: Object.fromEntries(
            connections.map((client) => [
              client.id,
              {
                status: client.status,
                connected: client.connected,
                expires: client.expires,
              },
            ]),
          ),
        }),
      );
    } catch {
      // Keep the preview usable when browser storage is unavailable.
    }
  }, [ready, enabled, connections]);

  return (
    <Context.Provider
      value={{
        ready,
        enabled,
        connections,
        start: () => setEnabled(true),
        signOut: () => {
          setEnabled(false);
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            // Clear local state even when browser storage is unavailable.
          }
        },
        disconnect: (id) =>
          setConnections((items) =>
            items.map((client) =>
              client.id === id ? { ...client, status: "disconnected" } : client,
            ),
          ),
        connect: (id) =>
          setConnections((items) =>
            items.map((client) =>
              client.id === id
                ? {
                    ...client,
                    status: "active",
                    connected: "8 Oct 2026",
                    expires: "15 Oct 2026",
                  }
                : client,
            ),
          ),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAccountPreview() {
  const context = useContext(Context);
  if (!context) throw new Error("AccountPreviewProvider is required");
  return context;
}
