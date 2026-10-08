import { canonicalProjectDirectory } from "../config/project-profiles.ts";
import {
  alwaysOnRef,
  getAdvisorSettings,
  setAlwaysOnRef,
} from "../config/state.ts";
import {
  getProjectSettingsProfile,
  readGlobalConfig,
  updateGlobalConfigValues,
} from "../config/storage.ts";
import type { SettingsEditScope } from "../ui/settings-scope.ts";
import { AdvisorSettingsSelector } from "../ui/settings-selector.ts";
import type { AdvisorSettings } from "../ui/types.ts";
import { loadCommandConfig } from "./activation-preparation.ts";
import {
  CONTEXT_PRESETS,
  EFFORT_LEVELS,
  getConfiguredModelRefs,
} from "./model-options.ts";
import { notify } from "./runtime.ts";
import {
  getGlobalAdvisorSettings,
  removeProjectAdvisorSettings,
  resetProjectAdvisorSetting,
  saveScopedAdvisorSetting,
} from "./settings-persistence.ts";
import type { CommandRuntime } from "./types.ts";

export const registerSettingsCommands = (runtime: CommandRuntime) => {
  runtime.pi.registerCommand("advisor-settings", {
    description: "Configure Advisor settings",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        return;
      }
      try {
        readGlobalConfig(ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notify(
          ctx,
          `Advisor command could not load configuration: ${message} Fix advisor.json and retry.`,
          "error"
        );
        return;
      }
      const projectPath = canonicalProjectDirectory(ctx.cwd);
      let scope: SettingsEditScope = { kind: "global" };
      let initial: AdvisorSettings;
      try {
        initial = getGlobalAdvisorSettings(ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Could not load Advisor settings: ${message}`, "error");
        return;
      }
      const toggleScope = (
        current: SettingsEditScope | undefined
      ):
        | { scope: SettingsEditScope; settings: AdvisorSettings }
        | undefined => {
        try {
          if (current?.kind === "project") {
            const settings = getGlobalAdvisorSettings(ctx);
            scope = { kind: "global" };
            return { scope, settings };
          }
          if (!ctx.isProjectTrusted()) {
            ctx.ui.notify(
              "Project-scoped settings require Pi Project Trust. Use /trust first.",
              "error"
            );
            return undefined;
          }
          if (!loadCommandConfig(ctx)) {
            return undefined;
          }
          const profile = getProjectSettingsProfile(ctx);
          const nextScope: SettingsEditScope = {
            inheritedProfilePath: profile.inheritedProfilePath,
            kind: "project",
            overrideKeys: profile.overrideKeys,
            profileExists: profile.profileExists,
            target: profile.target,
          };
          const settings = getAdvisorSettings();
          scope = nextScope;
          return { scope, settings };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Could not switch Advisor scope: ${message}`, "error");
          return undefined;
        }
      };

      await ctx.ui.custom<undefined>(
        (tui, theme, keybindings, done) =>
          new AdvisorSettingsSelector({
            effortLevels: EFFORT_LEVELS,
            initial,
            keybindings,
            modelRefs: getConfiguredModelRefs(ctx),
            onCancel: () => done(undefined),
            onRemoveProfile: () => {
              try {
                const settings = removeProjectAdvisorSettings(ctx);
                if (settings) {
                  runtime.updateSameModelNotice(ctx);
                  runtime.updateAdvisorUsageStatus(ctx);
                }
                return settings;
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                ctx.ui.notify(
                  `Could not remove project profile: ${message}`,
                  "error"
                );
                return undefined;
              }
            },
            onResetOverride: (id) => {
              if (scope.kind !== "project") {
                return undefined;
              }
              try {
                const settings = resetProjectAdvisorSetting(ctx, id);
                if (settings) {
                  runtime.updateSameModelNotice(ctx);
                  runtime.updateAdvisorUsageStatus(ctx);
                }
                return settings;
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                ctx.ui.notify(
                  `Could not reset project override: ${message}`,
                  "error"
                );
                return undefined;
              }
            },
            onScopeToggle: toggleScope,
            onSettingChange: (id, settings) => {
              try {
                const saved = saveScopedAdvisorSetting(
                  ctx,
                  scope,
                  id,
                  settings
                );
                runtime.updateSameModelNotice(ctx);
                runtime.updateAdvisorUsageStatus(ctx);
                return saved;
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                ctx.ui.notify(
                  `Could not save Advisor settings: ${message}`,
                  "error"
                );
                return undefined;
              }
            },
            presets: CONTEXT_PRESETS,
            scope,
            scopeProjectPath: projectPath,
            theme,
            tui,
          })
      );
    },
  });

  runtime.pi.registerCommand("advisor-off", {
    description: "Disable on-demand Advisor calls; keep the current model",
    handler: (_args, ctx) => {
      runtime.pi.setActiveTools(
        runtime.pi
          .getActiveTools()
          .filter(
            (name) =>
              name !== "ask_advisor" && name !== "record_advisor_outcome"
          )
      );
      runtime.resetSameModelNotice();
      // Leaving alwaysOn set would silently reactivate the flow next session.
      const wasAlwaysOn = alwaysOnRef;
      if (wasAlwaysOn) {
        setAlwaysOnRef(false);
        updateGlobalConfigValues(ctx, { alwaysOn: false });
      }
      notify(
        ctx,
        `Advisor flow disabled. Current model unchanged.${wasAlwaysOn ? " Always on turned off." : ""}`,
        "info"
      );
      return Promise.resolve();
    },
  });
};
