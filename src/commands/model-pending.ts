import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { canonicalProjectDirectory } from "../config/project-profiles.ts";
import { getEffectiveProjectProfile } from "../config/storage.ts";
import type { CommandRuntime } from "./types.ts";

export const modelContextIdentity = (ctx: ExtensionContext) => {
  const directory = canonicalProjectDirectory(ctx.cwd);
  const profile = getEffectiveProjectProfile(ctx);
  return `${directory}:${profile?.path ?? "global"}`;
};

export const pendingExecutorModelRef = (
  runtime: CommandRuntime,
  ctx: ExtensionContext
) => {
  if (
    runtime.pendingExecutorModelContext !== undefined &&
    runtime.pendingExecutorModelContext !== modelContextIdentity(ctx)
  ) {
    runtime.pendingExecutorModelRef = undefined;
    runtime.pendingExecutorModelContext = undefined;
  }
  return runtime.pendingExecutorModelRef;
};

export const setPendingExecutorModelRef = (
  runtime: CommandRuntime,
  ctx: ExtensionContext,
  ref: string | undefined
) => {
  runtime.pendingExecutorModelRef = ref;
  runtime.pendingExecutorModelContext = ref
    ? modelContextIdentity(ctx)
    : undefined;
};
