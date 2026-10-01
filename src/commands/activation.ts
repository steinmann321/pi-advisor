import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  effectiveExecutorEffort,
  effectiveExecutorRef,
  isMarkedSubagent,
} from "../child-session.ts";
import {
  hasContextMaxCharsOverride,
  parseAdvisorPersistenceScope,
  parseArgs,
} from "../config/args.ts";
import { canonicalProjectDirectory } from "../config/project-profiles.ts";
import {
  advisorEffortRef,
  advisorRef,
  contextMaxCharsRef,
  executorEffortRef,
  executorRef,
  setAdvisorEffortRef,
  setAdvisorRef,
  setContextMaxCharsRef,
  setExecutorEffortRef,
  setExecutorRef,
} from "../config/state.ts";
import {
  readGlobalConfig,
  updateGlobalConfigValues,
  updateProjectConfigValues,
} from "../config/storage.ts";
import type { AdvisorConfig } from "../config/types.ts";
import { sameModelAdvisorDisabled } from "../tools/model-access.ts";
import {
  loadCommandConfig,
  prepareActivationModels,
} from "./activation-preparation.ts";
import {
  ADVISOR_ACTIVATION_EXPLANATION,
  findConfiguredModel,
  hasAdvisorOverride,
  hasExecutorOverride,
} from "./model-options.ts";
import { setPendingExecutorModelRef } from "./model-pending.ts";
import { selectAdvisorModels } from "./model-picker.ts";
import { notify } from "./runtime.ts";
import { selectSettingsScope } from "./settings-scope-selection.ts";
import type { CommandRuntime, ThinkingLevel } from "./types.ts";

type PersistenceScope =
  | { kind: "global" }
  | { kind: "project"; target: string };

const resolveActivationModels = async (ctx: ExtensionContext) => {
  const executor = findConfiguredModel(ctx, executorRef);
  if (!executor) {
    return {
      error: executorRef
        ? `Executor model not found: ${executorRef}`
        : "Executor model not configured",
    };
  }
  const advisor = findConfiguredModel(ctx, advisorRef);
  if (!advisor) {
    return {
      error: advisorRef
        ? `Advisor model not found: ${advisorRef}`
        : "Advisor model not configured",
    };
  }
  for (const [label, model, ref] of [
    ["Executor", executor, executorRef],
    ["Advisor", advisor, advisorRef],
  ] as const) {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!(auth.ok && auth.apiKey)) {
      return { error: `No API key for ${label} ${ref}` };
    }
  }
  return { executor };
};

const choosePersistenceScope = (
  ctx: ExtensionContext,
  requested: "global" | "project" | undefined
): Promise<PersistenceScope | undefined> => {
  if (requested === "global") {
    return Promise.resolve({ kind: "global" });
  }
  if (requested === "project") {
    if (!ctx.isProjectTrusted()) {
      notify(
        ctx,
        "Project profiles require Pi Project Trust. Use /trust first.",
        "error"
      );
      return Promise.resolve(undefined);
    }
    return Promise.resolve({
      kind: "project",
      target: canonicalProjectDirectory(ctx.cwd),
    });
  }
  if (!ctx.hasUI || !ctx.ui.select) {
    return Promise.resolve({ kind: "global" });
  }
  return selectSettingsScope(ctx);
};

const scopeLabel = (scope: PersistenceScope) =>
  scope.kind === "global" ? "Global" : `For this project: ${scope.target}`;

// oxlint-disable-next-line complexity -- activation combines argument, picker, validation, persistence, and runtime transitions.
export const activateAdvisor = async (
  runtime: CommandRuntime,
  args: string,
  ctx: ExtensionContext,
  announce = true
) => {
  if (!loadCommandConfig(ctx)) {
    return;
  }
  const previous = {
    advisor: advisorRef,
    advisorEffort: advisorEffortRef,
    contextMaxChars: contextMaxCharsRef,
    executor: executorRef,
    executorEffort: executorEffortRef,
  };
  const restoreRefs = () => {
    setAdvisorRef(previous.advisor);
    setAdvisorEffortRef(previous.advisorEffort);
    setContextMaxCharsRef(previous.contextMaxChars);
    setExecutorRef(previous.executor);
    setExecutorEffortRef(previous.executorEffort);
  };
  const requestedScope = parseAdvisorPersistenceScope(args);
  if (
    requestedScope !== undefined &&
    requestedScope !== "global" &&
    requestedScope !== "project"
  ) {
    notify(ctx, requestedScope, "error");
    return;
  }
  const executorOverride = hasExecutorOverride(args);
  const advisorOverride = hasAdvisorOverride(args);
  const contextOverride = hasContextMaxCharsOverride(args);
  const argumentError = parseArgs(args);
  if (argumentError) {
    restoreRefs();
    notify(ctx, argumentError, "error");
    return;
  }

  const prepared = await prepareActivationModels(
    runtime,
    ctx,
    announce,
    executorOverride,
    advisorOverride
  );
  if (!prepared) {
    restoreRefs();
    return;
  }
  const needsPersistence =
    executorOverride ||
    advisorOverride ||
    contextOverride ||
    prepared.pendingExecutor !== undefined ||
    prepared.selectAdvisor ||
    prepared.selectExecutor;
  const scope = needsPersistence
    ? await choosePersistenceScope(ctx, requestedScope)
    : undefined;
  if (needsPersistence && !scope) {
    restoreRefs();
    return;
  }

  let pickedModels = false;
  if (prepared.selectAdvisor || prepared.selectExecutor) {
    const global = scope?.kind === "global" ? readGlobalConfig(ctx) : undefined;
    const selection = await selectAdvisorModels(ctx, {
      advisor:
        advisorOverride || scope?.kind !== "global"
          ? advisorRef
          : (global?.advisor ?? ""),
      advisorEffort:
        scope?.kind === "global" ? global?.advisorEffort : advisorEffortRef,
      executor:
        executorOverride || prepared.pendingExecutor || scope?.kind !== "global"
          ? executorRef
          : (global?.executor ?? ""),
      executorEffort:
        scope?.kind === "global" ? global?.executorEffort : executorEffortRef,
      scopeLabel: scope ? scopeLabel(scope) : undefined,
      selectAdvisor: prepared.selectAdvisor,
      selectExecutor: prepared.selectExecutor,
    });
    if (!selection) {
      restoreRefs();
      return;
    }
    setAdvisorRef(selection.advisor);
    setAdvisorEffortRef(selection.advisorEffort);
    setExecutorRef(selection.executor);
    setExecutorEffortRef(selection.executorEffort);
    pickedModels = true;
  }

  const { error, executor } = await resolveActivationModels(ctx);
  if (error) {
    restoreRefs();
    notify(ctx, error, "error");
    return;
  }
  if (scope) {
    const values: Partial<AdvisorConfig> = {};
    if (pickedModels) {
      values.advisor = advisorRef;
      values.advisorEffort = advisorEffortRef;
      values.executor = executorRef;
      values.executorEffort = executorEffortRef;
    }
    if (advisorOverride) {
      values.advisor = advisorRef;
    }
    if (executorOverride || prepared.pendingExecutor !== undefined) {
      values.executor = executorRef;
    }
    if (contextOverride) {
      values.contextMaxChars = contextMaxCharsRef;
    }
    try {
      if (scope.kind === "global") {
        updateGlobalConfigValues(ctx, values);
      } else {
        const projectValues = { ...values };
        if (pickedModels) {
          projectValues.advisorEffort = advisorEffortRef ?? "";
          projectValues.executorEffort = executorEffortRef ?? "";
        }
        updateProjectConfigValues(ctx, scope.target, projectValues);
      }
      loadCommandConfig(ctx);
    } catch (saveError) {
      restoreRefs();
      const message =
        saveError instanceof Error ? saveError.message : String(saveError);
      notify(ctx, `Could not save Advisor configuration: ${message}`, "error");
      return;
    }
  }
  if (!executor) {
    restoreRefs();
    notify(ctx, "Executor model not configured", "error");
    return;
  }
  if (!isMarkedSubagent() && !(await runtime.setExecutorModel(executor))) {
    notify(ctx, `No API key for Executor ${executorRef}`, "error");
    return;
  }
  setPendingExecutorModelRef(runtime, ctx, undefined);
  if (executorEffortRef && !isMarkedSubagent()) {
    // SAFETY: executorEffortRef is operator-configured and trusted to name a ThinkingLevel.
    runtime.pi.setThinkingLevel(executorEffortRef as ThinkingLevel);
  }
  if (!runtime.flowEnabled()) {
    runtime.pi.setActiveTools([
      ...runtime.pi.getActiveTools(),
      "ask_advisor",
      "record_advisor_outcome",
    ]);
  }
  const activeModel = isMarkedSubagent()
    ? ctx.model
    : findConfiguredModel(ctx, executorRef);
  runtime.updateSameModelNotice(ctx, activeModel);
  if (announce) {
    const activeExecutorRef = effectiveExecutorRef(ctx);
    const activeExecutorEffort = effectiveExecutorEffort(ctx);
    notify(
      ctx,
      `${ADVISOR_ACTIVATION_EXPLANATION}\n\nAdvisor flow ${sameModelAdvisorDisabled(ctx, activeModel) ? "configured" : "ready"} — Executor: ${activeExecutorRef} (thinking: ${activeExecutorEffort || "default"}) · Advisor: ${advisorRef} (thinking: ${advisorEffortRef || "default"})`,
      "info"
    );
  }
};
