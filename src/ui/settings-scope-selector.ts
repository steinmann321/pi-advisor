import type { Theme } from "@earendil-works/pi-coding-agent";
import type {
  Component,
  Focusable,
  KeybindingsManager,
} from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";

import { isScopeToggleKey, renderScopeHeader } from "./scope-toggle.ts";
import type { ScopeMode } from "./scope-toggle.ts";
import type { RenderRequester } from "./types.ts";

export interface SettingsScopeSelectorOptions {
  keybindings: KeybindingsManager;
  onCancel: () => void;
  onSelect: (scope: ScopeMode) => void;
  projectAvailable: boolean;
  projectPath: string;
  theme: Theme;
  tui: RenderRequester;
}

export class SettingsScopeSelector implements Component, Focusable {
  private readonly options: SettingsScopeSelectorOptions;
  private mode: ScopeMode = "all";
  private _focused = false;

  constructor(options: SettingsScopeSelectorOptions) {
    this.options = options;
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  invalidate(): void {
    this.options.tui.requestRender();
  }

  render(width: number): string[] {
    const border = this.options.theme.fg("border", "─".repeat(width));
    return [
      border,
      this.options.theme.fg(
        "accent",
        this.options.theme.bold("Advisor configuration")
      ),
      ...renderScopeHeader(
        this.options.theme,
        width,
        this.mode,
        this.options.projectPath
      ),
      this.options.theme.fg(
        "dim",
        this.options.projectAvailable
          ? "  Tab: scope · Enter: continue · Esc: cancel"
          : "  Project scope requires /trust · Enter: continue · Esc: cancel"
      ),
      this.options.theme.fg(
        "muted",
        "  all edits global defaults; scoped edits this project and descendants."
      ),
      this.options.theme.fg(
        "muted",
        "  Project profiles are stored in user advisor.json, not repository."
      ),
      border,
    ].map((line) => truncateToWidth(line, width));
  }

  handleInput(keyData: string): void {
    if (isScopeToggleKey(keyData, this.options.keybindings)) {
      if (this.options.projectAvailable) {
        this.mode = this.mode === "all" ? "scoped" : "all";
        this.options.tui.requestRender();
      }
      return;
    }
    if (
      this.options.keybindings.matches(keyData, "tui.select.confirm") ||
      keyData === "\r"
    ) {
      this.options.onSelect(this.mode);
      return;
    }
    if (
      this.options.keybindings.matches(keyData, "tui.select.cancel") ||
      keyData === "\u001B"
    ) {
      this.options.onCancel();
    }
  }
}
