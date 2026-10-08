"use client";

import { Archive, Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { failedAttempt } from "@/lib/demo";

export function Corrections() {
  const [outdated, setOutdated] = useState(false);
  const [removed, setRemoved] = useState(false);
  return (
    <div className="correction-demo">
      <div className="correction-title">
        <span>Try a correction</span>
        <span>Demonstration data</span>
      </div>
      <Tabs defaultValue="outdated">
        <TabsList className="correction-tabs" aria-label="Correction tools">
          <TabsTrigger value="outdated">Mark outdated</TabsTrigger>
          <TabsTrigger value="forget">Remove attempt</TabsTrigger>
        </TabsList>
        <TabsContent value="outdated">
          <code className="correction-tool">mark_conclusion_outdated</code>
          <div className="correction-record">
            <span className="muted">Original inference</span>
            <p>{failedAttempt.inference}.</p>
            <span className={`correction-state ${outdated ? "outdated" : ""}`}>
              {outdated
                ? "Conclusion outdated"
                : "Conclusion not marked outdated"}
            </span>
            <p className="correction-evidence">
              Observation: {failedAttempt.observation}.
            </p>
          </div>
          <p aria-live="polite" className="correction-message">
            {outdated
              ? "Correction saved. The original action, observation, inference, and check remain."
              : "New evidence can change a conclusion. Keep the original evidence."}
          </p>
          <Button
            className="small-action"
            disabled={outdated}
            onClick={() => setOutdated(true)}
          >
            {outdated ? <Check size={15} aria-hidden="true" /> : null}
            {outdated ? "Example marked outdated" : "Mark example outdated"}
          </Button>
        </TabsContent>
        <TabsContent value="forget">
          <code className="correction-tool">forget_attempt</code>
          <div className="correction-record">
            {removed ? (
              <div className="empty-record">
                <Archive aria-hidden="true" size={23} />
                <p>Example attempt removed.</p>
                <span>The other attempt remains.</span>
              </div>
            ) : (
              <>
                <span className="muted">Attempt to remove</span>
                <p>{failedAttempt.action}</p>
                <span className="correction-state">Failed browser check</span>
                <p className="correction-evidence">
                  Only this example attempt will be removed.
                </p>
              </>
            )}
          </div>
          <p aria-live="polite" className="correction-message">
            {removed
              ? "Removed from this local demonstration. No live graph was changed."
              : "The real tool removes an attempt and its embedding from the live graph. Prior responses and backups remain."}
          </p>
          <Button
            className="small-action"
            disabled={removed}
            onClick={() => setRemoved(true)}
          >
            {removed ? "Example removed" : "Remove example"}
          </Button>
        </TabsContent>
      </Tabs>
      <Button
        variant="ghost"
        className="reset-example"
        onClick={() => {
          setOutdated(false);
          setRemoved(false);
        }}
      >
        <RotateCcw size={13} aria-hidden="true" />
        Reset example
      </Button>
    </div>
  );
}
