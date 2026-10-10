# Mentis

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The landing page uses Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui. The MCP server uses TypeScript and Neo4j. The user selected a direct build and a local preview.

## Users

Developers who use coding agents. They need to record attempts, find related tasks, and inspect evidence before they use an earlier conclusion.

## Product Purpose

Mentis stores task-scoped coding attempts. Each attempt separates the action, observation, inference, and check result.

## Positioning

Mentis connects tasks to attempt evidence in a repository graph. Agents can find related tasks, inspect attempts with Cypher, and correct an earlier conclusion.

## Operating Context

A trusted coding agent calls the authenticated MCP endpoint on the Cloudflare Worker. Neo4j stores the graph. OpenRouter provides embeddings and relevance scores.

## Capabilities and Constraints

- `search` requires a repository and a query. Similarity and relevance do not show success.
- `record_attempt` stores actions and observations separately from inference. A missing check means unverified.
- `recall` accepts agent-authored Cypher. It is not a complete security boundary.
- Git state is reported by the agent; the server does not detect it.
- `mark_conclusion_outdated` preserves original evidence.
- `forget_attempt` removes an attempt and its embedding from the live graph. It cannot remove prior responses or backups.
- The landing page uses local demonstration data. It needs no database or API key.
- Deployment is outside the selected local preview scope.

## Brand Commitments

Use the Mentis name. Use Cursor's landing page as the reference: a light field, dark text, small opening heading, rounded actions, generous space, and large demonstrations. Give Mentis its own images and examples. Use short, direct text.

## Evidence on Hand

Product facts come from `src/lib/tools.ts`, `src/lib/graph.ts`, their tests, `src/config/config.ts`, and `compose.yaml`. The README has an older search contract. The page must follow the code. All page records must be marked as demonstration data. No customer claims or performance results were supplied.

## Product Principles

- Keep observation separate from inference.
- Inspect evidence before using a conclusion.
- Keep search within the stated repository.
- Preserve evidence when a conclusion changes.
- Show failed and unverified checks.

## Accessibility & Inclusion

Support keyboard use, visible focus, readable contrast, small screens, reduced motion, and a pause control for the demonstration.
