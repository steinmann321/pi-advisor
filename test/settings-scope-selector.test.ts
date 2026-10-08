import { describe, expect, test } from "bun:test";

import type { ScopeMode } from "../src/ui/scope-toggle.ts";
import { SettingsScopeSelector } from "../src/ui/settings-scope-selector.ts";

// SAFETY: These stubs cover only plain rendering and the keybindings used here.
const theme = {
  bold: (value: string) => value,
  fg: (_color: string, value: string) => value,
} as any;
// SAFETY: The scope picker only calls matches() for Tab, Enter, and Escape.
const keybindings = { matches: () => false } as any;

const createSelector = (
  projectAvailable: boolean,
  onSelect: (scope: ScopeMode) => void
) =>
  new SettingsScopeSelector({
    keybindings,
    onCancel: () => {},
    onSelect,
    projectAvailable,
    projectPath: "/absolute/project/path",
    theme,
    tui: { requestRender: () => {} },
  });

describe("Advisor persistence scope selector", () => {
  test("uses Pi-style scope header and Tab selects project scope", () => {
    let selected = "";
    const selector = createSelector(true, (scope) => {
      selected = scope;
    });
    const initial = selector.render(120).join("\n");
    expect(initial).toContain("Scope: all | scoped (/absolute/project/path)");
    expect(initial).toContain("Tab: scope (all/scoped)");

    selector.handleInput("\t");
    selector.handleInput("\r");
    expect(selected).toBe("scoped");
  });

  test("keeps global available and scoped disabled without project trust", () => {
    let selected = "";
    const selector = createSelector(false, (scope) => {
      selected = scope;
    });
    const screen = selector.render(120).join("\n");
    expect(screen).toContain("Project scope requires /trust");

    selector.handleInput("\t");
    selector.handleInput("\r");
    expect(selected).toBe("all");
  });
});
