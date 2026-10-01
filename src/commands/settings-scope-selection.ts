import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { canonicalProjectDirectory } from "../config/project-profiles.ts";
import { configPaths } from "../config/storage.ts";

export type SelectedSettingsScope =
  | { kind: "global" }
  | { kind: "project"; target: string };

export const selectSettingsScope = async (
  ctx: ExtensionContext
): Promise<SelectedSettingsScope | undefined> => {
  const target = canonicalProjectDirectory(ctx.cwd);
  const eligible = ctx.isProjectTrusted();
  const destination = configPaths(ctx)[0] ?? "advisor.json";
  const projectLine = eligible
    ? `For this project\n${target}\nOverrides global values for this directory and descendants.`
    : `For this project (unavailable)\n${target}\nUse /trust before creating or editing a project profile.`;
  const choice = await ctx.ui.select(
    `Which Advisor configuration do you want to edit?\n\nGlobal\nDefault for projects without an override.\n\n${projectLine}\n\nProject profiles are stored in your user configuration at ${destination}, not in repository.`,
    eligible ? ["Global", "For this project"] : ["Global"]
  );
  if (choice === "Global") {
    return { kind: "global" };
  }
  return choice === "For this project"
    ? { kind: "project", target }
    : undefined;
};
