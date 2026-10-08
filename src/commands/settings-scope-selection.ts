import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { canonicalProjectDirectory } from "../config/project-profiles.ts";
import { SettingsScopeSelector } from "../ui/settings-scope-selector.ts";

export type SelectedSettingsScope =
  | { kind: "global" }
  | { kind: "project"; target: string };

export const selectSettingsScope = async (
  ctx: ExtensionContext
): Promise<SelectedSettingsScope | undefined> => {
  const target = canonicalProjectDirectory(ctx.cwd);
  const eligible = ctx.isProjectTrusted();
  if (!ctx.hasUI || !ctx.ui.custom) {
    return { kind: "global" };
  }
  const choice = await ctx.ui.custom<"all" | "scoped" | undefined>(
    (tui, theme, keybindings, done) =>
      new SettingsScopeSelector({
        keybindings,
        onCancel: () => done(undefined),
        onSelect: done,
        projectAvailable: eligible,
        projectPath: target,
        theme,
        tui,
      })
  );
  if (choice === "all") {
    return { kind: "global" };
  }
  if (choice !== "scoped") {
    return undefined;
  }
  if (!ctx.isProjectTrusted()) {
    ctx.ui.notify(
      "Project scope requires Pi Project Trust. Use /trust first.",
      "error"
    );
    return undefined;
  }
  return { kind: "project", target };
};
