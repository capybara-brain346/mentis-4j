"use client";

import { ArrowRight, Cable } from "lucide-react";
import Link from "next/link";
import { ConnectDialog } from "@/components/account/connections";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account";

export function DashboardView() {
  const { connections } = useAccount();
  const count = connections.filter(
    (client) => client.status === "active",
  ).length;

  return (
    <>
      <div className="page-heading heading-with-action">
        <h1>Dashboard</h1>
        <ConnectDialog />
      </div>
      <section className="dashboard-clients" aria-label="Client connections">
        <Cable size={28} aria-hidden="true" />
        <h2>
          {count === 0
            ? "Connect your first agent"
            : `${count} connected ${count === 1 ? "client" : "clients"}`}
        </h2>
        <p>
          {count === 0
            ? "Add Mentis to your coding agent to record attempts and find earlier work."
            : "Manage the agents that can read, record, and delete memory."}
        </p>
        <Button asChild variant="outline" className="account-button">
          <Link href="/connections">
            Manage clients <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    </>
  );
}
