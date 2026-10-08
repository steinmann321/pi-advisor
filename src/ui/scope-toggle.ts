import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "@earendil-works/pi-tui";

export type ScopeMode = "all" | "scoped";

export const isScopeToggleKey = (
  keyData: string,
  keybindings?: KeybindingsManager
) =>
  keyData === "\t" || keybindings?.matches(keyData, "tui.input.tab") === true;

export const renderScopeHeader = (
  theme: Theme,
  width: number,
  mode: ScopeMode,
  projectPath: string
) => {
  const all =
    mode === "all" ? theme.fg("accent", "all") : theme.fg("muted", "all");
  const scopedLabel = `scoped (${projectPath})`;
  const scoped =
    mode === "scoped"
      ? theme.fg("accent", scopedLabel)
      : theme.fg("muted", scopedLabel);
  const scopeLine = `  ${theme.fg("muted", "Scope: ")}${all}${theme.fg("muted", " | ")}${scoped}`;
  return [
    ...wrapTextWithAnsi(scopeLine, Math.max(1, width)),
    truncateToWidth(
      `  ${theme.fg("dim", "Tab: scope (all/scoped) · all = global settings")}`,
      width
    ),
  ];
};
