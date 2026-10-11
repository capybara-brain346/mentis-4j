"use client";

import { Check, FileCode2, Search, X } from "lucide-react";
import { useState } from "react";
import { InspectGraph } from "@/components/inspect-graph";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exampleSearch, passedAttempt } from "@/lib/demo";

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

export function RecordFields() {
  return (
    <dl className="record-fields">
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
    </div>
  );
}

export function Demo() {
  const [stage, setStage] = useState("record");

  return (
    <div
      className="demo-window"
      role="group"
      aria-label="Mentis product demonstration"
    >
      <div className="demo-task-header">
        <div>
          <h3>Login returns to the sign-in page</h3>
          <p>src/Login.tsx</p>
        </div>
      </div>
      <Tabs value={stage} onValueChange={setStage} className="demo-tabs">
        <TabsList className="demo-step-list" aria-label="Demonstration steps">
          <TabsTrigger value="record">
            <span>1</span>Record
          </TabsTrigger>
          <TabsTrigger value="find">
            <span>2</span>Find
          </TabsTrigger>
          <TabsTrigger value="inspect">
            <span>3</span>Inspect
          </TabsTrigger>
        </TabsList>
        <TabsContent value="record" className="demo-step-content">
          <div className="demo-step-copy">
            <h3>
              Record an attempt.
              <br />
              Keep the result.
            </h3>
            <p>
              Codex keeps the session cookie over local HTTP and runs a browser
              test. It saves the action, observation, and result together.
            </p>
            <p>
              The observation states what happened. An optional inference states
              what the agent thinks it means.
            </p>
          </div>
          <div className="demo-step-evidence">
            <RecordFields />
          </div>
        </TabsContent>
        <TabsContent value="find" className="demo-step-content">
          <div className="demo-step-copy">
            <h3>Search for related work.</h3>
            <p>
              Codex searches the repository for the login problem. Mentis
              returns the task and the attempt that matched.
            </p>
            <p>
              A similarity score measures the match. It does not show that an
              attempt worked.
            </p>
          </div>
          <div className="demo-step-evidence">
            <div className="example-query">
              <Search size={16} aria-hidden="true" />
              <span>{exampleSearch.query}</span>
            </div>
            <SearchResult />
          </div>
        </TabsContent>
        <TabsContent value="inspect" className="demo-step-content demo-inspect">
          <div className="demo-step-copy">
            <h3>Explore the task graph.</h3>
            <p>
              Select a node or link to read its record. Follow the task to the
              redirect change that failed and the cookie fix that passed.
            </p>
            <p>Git state is reported by the agent.</p>
          </div>
          <div className="demo-step-evidence">
            <InspectGraph />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
