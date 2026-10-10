"use client";

import {
  ArrowRight,
  Check,
  CircleCheck,
  FileCode2,
  GitBranch,
  Network,
  Pause,
  Play,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exampleSearch, failedAttempt, passedAttempt } from "@/lib/demo";

function subscribeToMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function Status({
  result,
}: {
  result: "passed" | "failed" | "unverified";
}) {
  return (
    <span className={`status status-${result}`}>
      {result === "passed" ? (
        <Check size={13} aria-hidden="true" />
      ) : result === "failed" ? (
        <X size={13} aria-hidden="true" />
      ) : null}
      {result === "passed"
        ? "Check passed"
        : result === "failed"
          ? "Check failed"
          : "Unverified"}
    </span>
  );
}

export function RecordFields({ compact = false }: { compact?: boolean }) {
  return (
    <dl className={`record-fields ${compact ? "compact" : ""}`}>
      <div>
        <dt>Action</dt>
        <dd>{passedAttempt.action}</dd>
      </div>
      <div>
        <dt>Observation</dt>
        <dd>{passedAttempt.observation}</dd>
      </div>
      <div>
        <dt>Inference</dt>
        <dd className="muted">No inference recorded</dd>
      </div>
      <div>
        <dt>Check</dt>
        <dd>
          <span>{passedAttempt.check.method}</span>
          <Status result="passed" />
        </dd>
      </div>
    </dl>
  );
}

export function AttemptHistory() {
  return (
    <ol className="attempt-history">
      <li>
        <div className="history-heading">
          <span>Change the login redirect</span>
          <Status result="failed" />
        </div>
        <p>{failedAttempt.observation}.</p>
        <div className="git-state">
          <GitBranch size={13} aria-hidden="true" />
          <code>a8c3f2</code>
          <span>Uncommitted changes</span>
        </div>
      </li>
      <li>
        <div className="history-heading">
          <span>Retain the session cookie</span>
          <Status result="passed" />
        </div>
        <p>{passedAttempt.observation}.</p>
        <div className="git-state">
          <GitBranch size={13} aria-hidden="true" />
          <span>Git state not reported</span>
        </div>
      </li>
    </ol>
  );
}

export function SearchResult() {
  return (
    <div className="search-result">
      <div className="result-top">
        <FileCode2 size={17} aria-hidden="true" />
        <span>Related task</span>
        <span className="result-score">Similarity 0.92</span>
      </div>
      <h3>Login cookie investigation</h3>
      <p>{passedAttempt.observation}.</p>
      <div className="result-bottom">
        <code>src/Login.tsx</code>
        <Status result="passed" />
      </div>
      <p className="result-note">
        Example score. Similarity does not show success.
      </p>
    </div>
  );
}

export function Demo() {
  const [stage, setStage] = useState("record");
  const [paused, setPaused] = useState(true);
  const reducedMotion = useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(
      () =>
        setStage((current) =>
          current === "record"
            ? "find"
            : current === "find"
              ? "inspect"
              : "record",
        ),
      6000,
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  return (
    <div
      className="demo-window"
      role="group"
      aria-label="Mentis product demonstration"
    >
      <div className="window-title">
        <div className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>Mentis / river-app</span>
        <span className="demo-label">Demonstration data</span>
      </div>
      <div className="demo-layout">
        <aside className="demo-sidebar">
          <div className="sidebar-title">
            <Network size={15} aria-hidden="true" />
            Repository memory
          </div>
          <p className="repo-name">example / river-app</p>
          <div className="sidebar-task">
            <CircleCheck size={16} aria-hidden="true" />
            <div>
              Login cookie investigation<small>2 attempts recorded</small>
            </div>
          </div>
          <div className="sidebar-file">
            <FileCode2 size={14} aria-hidden="true" />
            <code>src/Login.tsx</code>
          </div>
          <div className="sidebar-footer">
            <span className="connection-dot" />
            Local example
          </div>
        </aside>
        <Tabs
          value={stage}
          onValueChange={(value) => {
            setStage(value);
            setPaused(true);
          }}
          className="demo-tabs"
        >
          <div className="demo-toolbar">
            <TabsList
              className="demo-tab-list"
              aria-label="Demonstration steps"
            >
              <TabsTrigger value="record">Record</TabsTrigger>
              <TabsTrigger value="find">Find</TabsTrigger>
              <TabsTrigger value="inspect">Inspect</TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="icon"
              className="play-control"
              disabled={reducedMotion}
              aria-label={
                reducedMotion
                  ? "Playback disabled by reduced motion preference"
                  : paused
                    ? "Play demo"
                    : "Pause demo"
              }
              title={
                reducedMotion
                  ? "Use the tabs with reduced motion"
                  : paused
                    ? "Play demo"
                    : "Pause demo"
              }
              onClick={() => setPaused(!paused)}
            >
              {paused || reducedMotion ? (
                <Play aria-hidden="true" size={14} />
              ) : (
                <Pause aria-hidden="true" size={14} />
              )}
            </Button>
          </div>
          <TabsContent value="record" className="demo-content">
            <div className="tool-call">
              <code>record_attempt</code>
              <span>New attempt</span>
            </div>
            <h2>Keep the work. Keep the evidence.</h2>
            <RecordFields />
            <div className="record-confirmation">
              <CircleCheck size={15} aria-hidden="true" />
              Attempt recorded
              <ArrowRight size={15} aria-hidden="true" />
            </div>
          </TabsContent>
          <TabsContent value="find" className="demo-content">
            <div className="tool-call">
              <code>search</code>
              <span>One repository</span>
            </div>
            <h2>Find the related investigation.</h2>
            <div className="example-query">
              <Search size={16} aria-hidden="true" />
              <span>{exampleSearch.query}</span>
            </div>
            <SearchResult />
          </TabsContent>
          <TabsContent value="inspect" className="demo-content">
            <div className="tool-call">
              <code>recall</code>
              <span>Task history</span>
            </div>
            <h2>See what each attempt found.</h2>
            <AttemptHistory />
            <p className="history-note">Git state is reported by the agent.</p>
          </TabsContent>
        </Tabs>
        <aside className="evidence-panel">
          <h3>One task. A record of the work.</h3>
          <p>Login cookie investigation</p>
          <div className="evidence-row">
            <X size={16} aria-hidden="true" />
            <span>
              Change redirect<small>Browser test failed</small>
            </span>
          </div>
          <div className="evidence-line" aria-hidden="true" />
          <div className="evidence-row">
            <Check size={16} aria-hidden="true" />
            <span>
              Retain cookie<small>Browser test passed</small>
            </span>
          </div>
          <div className="evidence-footer">
            <span>Original evidence</span>
            <strong>Available for inspection</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
