import { canonicalProjectDirectory } from "../config/project-profiles.ts";
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
import type { AdvisorModelPickerScopeState } from "./model-picker.ts";
import { notify } from "./runtime.ts";
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
      const projectPath = canonicalProjectDirectory(ctx.cwd);
      const global = readGlobalConfig(ctx);
      const globalState: AdvisorModelPickerScopeState = {
        advisor: global.advisor,
        advisorEffort: global.advisorEffort,
        executor: pendingExecutorModelRef(runtime, ctx) ?? global.executor,
        executorEffort: global.executorEffort,
        kind: "global",
        label: "all (global)",
        mode: "all",
      };
      const toggleScope = (
        current: AdvisorModelPickerScopeState
      ): AdvisorModelPickerScopeState | undefined => {
        try {
          if (current.kind === "project") {
            const config = readGlobalConfig(ctx);
            return {
              advisor: config.advisor,
              advisorEffort: config.advisorEffort,
              executor:
                pendingExecutorModelRef(runtime, ctx) ?? config.executor,
              executorEffort: config.executorEffort,
              kind: "global",
              label: "all (global)",
              mode: "all",
            };
          }
          if (!ctx.isProjectTrusted()) {
            ctx.ui.notify(
              "Project-scoped models require Pi Project Trust. Use /trust first.",
              "error"
            );
            return undefined;
          }
          if (!loadCommandConfig(ctx)) {
            return undefined;
          }
          const project = getProjectSettingsProfile(ctx);
          return {
            advisor: advisorRef,
            advisorEffort: advisorEffortRef,
            executor: executorRef,
            executorEffort: executorEffortRef,
            kind: "project",
            label: `scoped (${projectPath})`,
            mode: "scoped",
            target: project.target,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          notify(ctx, `Could not switch model scope: ${message}`, "error");
          return undefined;
        }
      };
      const selection = await selectAdvisorModels(ctx, {
        ...globalState,
        onScopeToggle: toggleScope,
        scope: globalState,
        scopeProjectPath: projectPath,
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
      const scope = selection.scope ?? globalState;
      try {
        const path =
          scope.kind === "global"
            ? updateGlobalConfigValues(ctx, values)
            : updateProjectConfigValues(ctx, scope.target ?? projectPath, {
                ...values,
                advisorEffort: selection.advisorEffort ?? "",
                executorEffort: selection.executorEffort ?? "",
              });
        loadCommandConfig(ctx);
        setPendingExecutorModelRef(runtime, ctx, undefined);
        runtime.updateSameModelNotice(ctx);
        ctx.ui.notify(
          `Saved Executor + Advisor configurations for ${scope.label} to ${path}`,
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
