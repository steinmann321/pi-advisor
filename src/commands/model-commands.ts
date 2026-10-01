import {
  advisorEffortRef,
  advisorRef,
  executorEffortRef,
  executorRef,
} from "../config/state.ts";
import {
  getProjectSettingsProfile,
  readGlobalConfig,
  updateGlobalConfigValues,
  updateProjectConfigValues,
} from "../config/storage.ts";
import { loadCommandConfig } from "./activation-preparation.ts";
import { activateAdvisor } from "./activation.ts";
import { validateAdvisorModels } from "./model-options.ts";
import {
  pendingExecutorModelRef,
  setPendingExecutorModelRef,
} from "./model-pending.ts";
import { selectAdvisorModels } from "./model-picker.ts";
import { notify } from "./runtime.ts";
import { selectSettingsScope } from "./settings-scope-selection.ts";
import type { CommandRuntime } from "./types.ts";

export const registerModelCommands = (runtime: CommandRuntime) => {
  runtime.pi.registerCommand("advisor", {
    description:
      "Enable the Executor/Advisor flow and switch to the configured or explicitly selected Executor model; accepts contextMaxChars=N and scope=global|project",
    handler: (args, ctx) => activateAdvisor(runtime, args, ctx),
  });

  runtime.pi.registerCommand("advisor-models", {
    description:
      "Select and persist the Executor and Advisor models with reasoning levels",
    // oxlint-disable-next-line complexity -- model editing validates independent scope, provenance, and save paths.
    handler: async (_args, ctx) => {
      if (!(loadCommandConfig(ctx) && ctx.hasUI)) {
        return;
      }
      const scope = await selectSettingsScope(ctx);
      if (!scope) {
        return;
      }
      const project =
        scope.kind === "project" ? getProjectSettingsProfile(ctx) : undefined;
      const global =
        scope.kind === "global" ? readGlobalConfig(ctx) : undefined;
      const label =
        scope.kind === "global"
          ? "Global"
          : `For this project: ${scope.target}${project?.inheritedProfilePath ? ` · inherits from ${project.inheritedProfilePath}` : ""}`;
      const selection = await selectAdvisorModels(ctx, {
        advisor: scope.kind === "global" ? (global?.advisor ?? "") : advisorRef,
        advisorEffort:
          scope.kind === "global" ? global?.advisorEffort : advisorEffortRef,
        executor:
          pendingExecutorModelRef(runtime, ctx) ??
          (scope.kind === "global" ? (global?.executor ?? "") : executorRef),
        executorEffort:
          scope.kind === "global" ? global?.executorEffort : executorEffortRef,
        scopeLabel: label,
        selectAdvisor: true,
        selectExecutor: true,
      });
      if (!selection) {
        return;
      }
      const error = await validateAdvisorModels(
        ctx,
        selection.advisor,
        selection.executor
      );
      if (error) {
        notify(ctx, error, "error");
        return;
      }

      const values = {
        advisor: selection.advisor,
        advisorEffort: selection.advisorEffort,
        executor: selection.executor,
        executorEffort: selection.executorEffort,
      };
      try {
        const path =
          scope.kind === "global"
            ? updateGlobalConfigValues(ctx, values)
            : updateProjectConfigValues(ctx, scope.target, {
                ...values,
                advisorEffort: selection.advisorEffort ?? "",
                executorEffort: selection.executorEffort ?? "",
              });
        loadCommandConfig(ctx);
        setPendingExecutorModelRef(runtime, ctx, undefined);
        runtime.updateSameModelNotice(ctx);
        ctx.ui.notify(
          `Saved Executor + Advisor configurations for ${label} to ${path}`,
          "info"
        );
      } catch (saveError) {
        const message =
          saveError instanceof Error ? saveError.message : String(saveError);
        notify(ctx, `Could not save Advisor models: ${message}`, "error");
      }
    },
  });
};
