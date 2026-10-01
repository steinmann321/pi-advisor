import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  advisorRef,
  executorRef,
  getPersistedModelRefs,
  setExecutorRef,
} from "../config/state.ts";
import { loadConfig } from "../config/storage.ts";
import {
  getAvailableModelRefs,
  getExplicitModelError,
  planActivationModels,
} from "./model-options.ts";
import { pendingExecutorModelRef } from "./model-pending.ts";
import { notify } from "./runtime.ts";
import type { CommandRuntime } from "./types.ts";

export interface PreparedActivationModels {
  pendingExecutor?: string;
  selectAdvisor: boolean;
  selectExecutor: boolean;
}

export const loadCommandConfig = (ctx: ExtensionContext) => {
  try {
    loadConfig(ctx);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notify(
      ctx,
      `Advisor command could not load configuration: ${message} Fix advisor.json and retry.`,
      "error"
    );
    return false;
  }
};

export const prepareActivationModels = (
  runtime: CommandRuntime,
  ctx: ExtensionContext,
  announce: boolean,
  executorOverride: boolean,
  advisorOverride: boolean
): PreparedActivationModels | undefined => {
  const persisted = getPersistedModelRefs();
  const availableRefs = getAvailableModelRefs(ctx);
  const availableRefSet = availableRefs ? new Set(availableRefs) : undefined;
  const explicitError =
    getExplicitModelError(
      ctx,
      executorRef,
      "Executor",
      executorOverride,
      availableRefSet
    ) ??
    getExplicitModelError(
      ctx,
      advisorRef,
      "Advisor",
      advisorOverride,
      availableRefSet
    );
  if (explicitError) {
    notify(ctx, explicitError, "error");
    return;
  }

  const plan = planActivationModels(
    ctx,
    executorRef,
    advisorRef,
    pendingExecutorModelRef(runtime, ctx),
    persisted,
    executorOverride,
    advisorOverride,
    availableRefSet
  );
  setExecutorRef(plan.pendingExecutor ?? executorRef);
  if ((plan.selectExecutor || plan.selectAdvisor) && !announce) {
    notify(
      ctx,
      "Advisor models are not configured or available. Run /advisor to choose them.",
      "error"
    );
    return;
  }
  return {
    pendingExecutor: plan.pendingExecutor,
    selectAdvisor: plan.selectAdvisor,
    selectExecutor: plan.selectExecutor,
  };
};
