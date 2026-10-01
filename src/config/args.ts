import {
  advisorRef,
  contextMaxCharsRef,
  executorRef,
  setAdvisorRef,
  setContextMaxCharsRef,
  setExecutorRef,
} from "./state.ts";
import { MAX_CONTEXT_MAX_CHARS } from "./types.ts";
import { isValidContextMaxChars } from "./validation.ts";

const ARGUMENT_WHITESPACE = /\s+/u;

export type AdvisorPersistenceScope = "global" | "project";

const tokens = (args: string) =>
  args.trim().split(ARGUMENT_WHITESPACE).filter(Boolean);

export const parseAdvisorPersistenceScope = (
  args: string
): AdvisorPersistenceScope | undefined | string => {
  let scope: AdvisorPersistenceScope | undefined;
  for (const token of tokens(args)) {
    const [key, value] = token.split("=");
    if (key !== "scope") {
      continue;
    }
    if (value !== "global" && value !== "project") {
      return "scope must be global or project.";
    }
    scope = value;
  }
  return scope;
};

export const hasContextMaxCharsOverride = (args: string) =>
  tokens(args).some((token) => token.split("=")[0] === "contextMaxChars");

export const parseArgs = (args: string): string | undefined => {
  let nextExecutor = executorRef;
  let nextAdvisor = advisorRef;
  let nextContextMaxChars = contextMaxCharsRef;
  for (const token of tokens(args)) {
    const [key, value] = token.split("=");
    if (key === "executor" && value) {
      nextExecutor = value;
    }
    if (key === "advisor" && value) {
      nextAdvisor = value;
    }
    if (key === "contextMaxChars") {
      const parsed = Number(value);
      if (!isValidContextMaxChars(parsed)) {
        return `contextMaxChars must be a non-negative integer no greater than ${MAX_CONTEXT_MAX_CHARS}.`;
      }
      nextContextMaxChars = parsed;
    }
  }
  setExecutorRef(nextExecutor);
  setAdvisorRef(nextAdvisor);
  setContextMaxCharsRef(nextContextMaxChars);
};
