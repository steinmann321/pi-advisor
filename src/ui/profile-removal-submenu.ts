import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { Component, Focusable } from "@earendil-works/pi-tui";

import type { RenderRequester } from "./types.ts";

export class ProfileRemovalSubmenu implements Component, Focusable {
  private readonly onCancel: () => void;
  private readonly onConfirm: () => void;
  private readonly text: string;
  private readonly theme: Theme;
  private readonly tui: RenderRequester;
  private _focused = true;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  constructor(options: {
    onCancel: () => void;
    onConfirm: () => void;
    text: string;
    theme: Theme;
    tui: RenderRequester;
  }) {
    this.onCancel = options.onCancel;
    this.onConfirm = options.onConfirm;
    this.text = options.text;
    this.theme = options.theme;
    this.tui = options.tui;
  }

  invalidate(): void {
    this.tui.requestRender();
  }

  render(width: number): string[] {
    return [
      this.theme.fg("error", this.theme.bold("  Remove project profile?")),
      "",
      this.theme.fg("muted", `  ${this.text}`),
      "",
      this.theme.fg("error", "  Enter: remove profile · Esc: keep profile"),
    ].map((line) => truncateToWidth(line, width));
  }

  handleInput(keyData: string): void {
    if (matchesKey(keyData, Key.enter) || keyData === "\r") {
      this.onConfirm();
      return;
    }
    if (matchesKey(keyData, Key.escape) || keyData === "\u001B") {
      this.onCancel();
      return;
    }
    this.tui.requestRender();
  }
}
