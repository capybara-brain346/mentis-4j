"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
export type Connection = {
  id: string;
  name: string;
  description: string;
  status: "active" | "expired" | "disconnected";
  connected: string;
  expires: string;
};

export type Account = {
  name: string;
  email: string;
  workspace: string;
  workspaceId: string;
  expiresAt?: string;
};

type AccountContext = {
  ready: boolean;
  account: Account | null;
  connections: Connection[];
  error: string;
  busy: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  disconnect: (id: string) => Promise<void>;
};
const Context = createContext<AccountContext | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [account, setAccount] = useState<Account | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mutating = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (mutating.current) return;
    const current = ++generation.current;
    const stale = () => signal?.aborted || current !== generation.current;
    try {
      const response = await fetch("/api/auth/account", {
        cache: "no-store",
        signal,
      });
      if (stale()) return;
      if (response.status === 401) {
        setAccount(null);
        setConnections([]);
        setError("");
        return;
      }
      if (!response.ok)
        throw new Error("Account service is unavailable. Try again.");
      const data: Account = await response.json();
      const clients = await fetch("/api/auth/connections", {
        cache: "no-store",
        signal,
      });
      if (!clients.ok)
        throw new Error("Could not load client access. Try again.");
      const rows: Connection[] = await clients.json();
      if (stale()) return;
      setAccount(data);
      setConnections(rows);
      setError("");
    } catch (failure) {
      if (stale()) return;
      setAccount(null);
      setConnections([]);
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load your account. Try again.",
      );
    } finally {
      if (!stale()) setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!/^\/(dashboard|sign-in)(\/|$)/.test(path)) return;
    const controller = new AbortController();
    void load(controller.signal);
    const onFocus = () => {
      void load(controller.signal);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [path, load]);

  useEffect(() => {
    if (!account?.expiresAt) return;
    const timer = window.setTimeout(
      () => {
        ++generation.current;
        setAccount(null);
        setConnections([]);
        setError("Your session has ended. Sign in again.");
      },
      Math.max(0, Date.parse(account.expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [account]);

  async function mutate(action: "logout" | "disconnect", id?: string) {
    if (mutating.current) throw new Error("An access change is in progress.");
    mutating.current = true;
    ++generation.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${action}`, {
        method: "POST",
        body: new URLSearchParams(id ? { consentId: id } : {}),
      });
      if (response.status === 401) {
        setAccount(null);
        setConnections([]);
        throw new Error("Your session has ended. Sign in again.");
      }
      if (!response.ok) throw new Error("Could not change access. Try again.");
      if (action === "logout") {
        setAccount(null);
        setConnections([]);
      } else
        setConnections((rows) => rows.filter((client) => client.id !== id));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not change access. Try again.",
      );
      throw failure;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  return (
    <Context.Provider
      value={{
        ready,
        account,
        connections,
        error,
        busy,
        refresh: () => load(),
        signOut: () => mutate("logout"),
        disconnect: (id) => mutate("disconnect", id),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAccount() {
  const account = useContext(Context);
  if (!account) throw new Error("AccountProvider is required");
  return account;
}
