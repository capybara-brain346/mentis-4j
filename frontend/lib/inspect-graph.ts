import { exampleTask, failedAttempt, passedAttempt } from "@/lib/demo";

export const inspectNodes = [
  {
    id: "repository",
    kind: "Repository",
    label: "Repository",
    title: "Repository",
    x: 55,
    y: 138,
    properties: { Tasks: "1" },
  },
  {
    id: "task",
    kind: "Task",
    label: "Login task",
    title: "Login cookie investigation",
    x: 175,
    y: 138,
    properties: { Identity: exampleTask, Attempts: "2" },
  },
  {
    id: "failed",
    kind: "Attempt",
    label: "Redirect",
    title: failedAttempt.action,
    result: failedAttempt.check.result,
    x: 335,
    y: 60,
    properties: {
      Observation: failedAttempt.observation,
      Inference: failedAttempt.inference,
      Check: failedAttempt.check.method,
      Commit: failedAttempt.gitCommit,
      "Git state": "Uncommitted changes",
    },
  },
  {
    id: "passed",
    kind: "Attempt",
    label: "Cookie",
    title: passedAttempt.action,
    result: passedAttempt.check.result,
    x: 335,
    y: 212,
    properties: {
      Observation: passedAttempt.observation,
      Check: passedAttempt.check.method,
      "Git state": "Not reported",
    },
  },
];

export const inspectEdges = [
  {
    id: "repository-task",
    from: "repository",
    to: "task",
    type: "HAS_TASK",
    label: "Has task",
  },
  {
    id: "task-failed",
    from: "task",
    to: "failed",
    type: "HAS_ATTEMPT",
    label: "Has attempt",
  },
  {
    id: "task-passed",
    from: "task",
    to: "passed",
    type: "HAS_ATTEMPT",
    label: "Has attempt",
  },
];
