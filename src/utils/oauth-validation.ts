import type { McpAuthorizationProps } from "../auth/types.js";
import type { OAuthAccessContext } from "../db/d1-types.js";

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readAuthorizationProps(
  value: unknown,
): McpAuthorizationProps | null {
  if (
    !isObject(value) ||
    typeof value.userId !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.consentId !== "string" ||
    typeof value.resource !== "string" ||
    !isStringArray(value.scope)
  ) {
    return null;
  }
  return {
    userId: value.userId,
    workspaceId: value.workspaceId,
    consentId: value.consentId,
    resource: value.resource,
    scope: value.scope,
  };
}

export function readTokenFacts(value: unknown): {
  userId: string;
  clientId: string;
  audience: string;
  scope: string[];
} | null {
  if (!isObject(value)) return null;
  const audience =
    typeof value.audience === "string"
      ? value.audience
      : Array.isArray(value.audience) && value.audience.length === 1
        ? value.audience[0]
        : null;
  if (
    typeof value.userId !== "string" ||
    typeof value.clientId !== "string" ||
    typeof audience !== "string" ||
    !isStringArray(value.scope)
  ) {
    return null;
  }
  return {
    userId: value.userId,
    clientId: value.clientId,
    audience,
    scope: value.scope,
  };
}

export function makeAccessContext(
  props: McpAuthorizationProps,
  clientId: string,
): OAuthAccessContext {
  return {
    userId: props.userId,
    workspaceId: props.workspaceId,
    consentId: props.consentId,
    clientId,
    resource: props.resource,
    scope: JSON.stringify(props.scope),
  };
}
export function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}
