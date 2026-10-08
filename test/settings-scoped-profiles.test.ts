import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { initTheme } from "@earendil-works/pi-coding-agent";

import { registerCommands } from "../src/commands.ts";
import {
  getGlobalAdvisorSettings,
  resetProjectAdvisorSetting,
  saveScopedAdvisorSetting,
} from "../src/commands/settings-persistence.ts";
import { canonicalProjectDirectory } from "../src/config/project-profiles.ts";
import { getAdvisorSettings } from "../src/config/state.ts";
import {
  getProjectSettingsProfile,
  loadConfig,
  removeProjectConfig,
} from "../src/config/storage.ts";
import { validateConfig } from "../src/config/validation.ts";
import { settingConfigValue } from "../src/ui/settings-scope.ts";
import { AdvisorSettingsSelector } from "../src/ui/settings-selector.ts";
import type { AdvisorSettings } from "../src/ui/types.ts";
import { withAgentDir } from "./helpers/config-fixture.ts";
import { asExtensionContext } from "./helpers/extension-context.ts";
import { mockPi } from "./helpers/mock-pi.ts";
import {
  focusSettingsRow,
  plainScreen,
} from "./helpers/settings-navigation.ts";

initTheme();

// SAFETY: test theme provides only methods rendered by AdvisorSettingsSelector.
const selectorTheme = {
  bold: (text: string) => text,
  fg: (_color: string, text: string) => text,
} as any;

const settings = (): AdvisorSettings => ({
  alwaysOn: true,
  autoLoopGate: false,
  blockOnBlocked: false,
  collapseResponses: true,
  completionGate: false,
  contextMaxChars: 10_000,
  customRule: "review",
  disableSameModel: false,
  effort: "high",
  failureGate: false,
  failureMode: "warn-and-continue",
  gitContext: "full",
  gitContextMaxChars: 5000,
  herdrIntegration: false,
  jevDigestMaxChars: 1000,
  jevFilterEnabled: true,
  jevFilterNoulMargin: 0.2,
  jevFilterOverrideWindow: 3,
  jevFilterSkipConfidence: 0.8,
  jevModel: "jev-1.13.0",
  jevPricePerMtok: 0.02,
  jevTimeoutMs: 2000,
  jevTransport: "typesafe",
  jevTurnGateEveryTurns: 3,
  jevTurnGateNoulThreshold: 0.7,
  loopThreshold: 4,
  maxCallsPerSession: 5,
  modelWhitelist: ["provider/model"],
  outcomeLogging: true,
  planGate: false,
  redactSecrets: true,
  scoutEnabled: true,
  scoutTimeoutMs: 5000,
  sessionSummary: true,
  showUsageDetails: false,
  showUsageFooter: true,
  simpleMode: false,
  toolPolicies: { bash: "summary" },
  toolResultMaxBytes: 10_000,
  toolResultMaxLines: 500,
  trackedFileContent: true,
  untrackedContent: true,
});

const SETTING_IDS = [
  "context",
  "simpleMode",
  "alwaysOn",
  "effort",
  "modelWhitelist",
  "disableSameModel",
  "scoutEnabled",
  "scoutTimeoutMs",
  "showUsageDetails",
  "showUsageFooter",
  "planGate",
  "failureGate",
  "completionGate",
  "collapseResponses",
  "customRule",
  "blockOnBlocked",
  "autoLoopGate",
  "loopThreshold",
  "maxCallsPerSession",
  "sessionSummary",
  "failureMode",
  "herdrIntegration",
  "toolResultMaxLines",
  "toolResultMaxBytes",
  "redactSecrets",
  "gitContext",
  "gitContextMaxChars",
  "toolPolicies",
  "trackedFileContent",
  "untrackedContent",
  "outcomeLogging",
  "jevFilter",
  "jevFilterSkipConfidence",
  "jevFilterNoulMargin",
  "jevFilterOverrideWindow",
  "jevModel",
  "jevTimeoutMs",
  "jevDigestMaxChars",
  "jevPricePerMtok",
  "jevTurnGateEveryTurns",
  "jevTurnGateNoulThreshold",
  "jevTransport",
];

const readConfig = (agentDir: string) =>
  JSON.parse(readFileSync(join(agentDir, "advisor.json"), "utf-8"));

describe("Scoped Advisor settings", () => {
  test("maps every settings row to one valid persisted config key", () => {
    for (const id of SETTING_IDS) {
      const value = settingConfigValue(id, settings());
      expect(Object.keys(value)).toHaveLength(1);
      expect(() => validateConfig(value, `settings row ${id}`)).not.toThrow();
    }
  });

  test("writes sparse project overrides, including arrays and objects, then resets only target key", async () => {
    await withAgentDir(
      {
        advisorModelWhitelist: ["global/model"],
        advisorToolPolicies: { read: "full" },
      },
      async (agentDir) => {
        const parent = join(agentDir, "parent");
        const child = join(parent, "child");
        mkdirSync(child, { recursive: true });
        const path = join(agentDir, "advisor.json");
        writeFileSync(
          path,
          JSON.stringify({
            advisorModelWhitelist: ["global/model"],
            advisorToolPolicies: { read: "full" },
            projectProfiles: {
              [parent]: { overrides: { advisorCollapseResponses: true } },
            },
            unknown: "preserved",
          })
        );
        let trusted = true;
        const ctx = asExtensionContext({
          cwd: child,
          hasUI: false,
          isProjectTrusted: () => trusted,
        });
        loadConfig(ctx);
        const profile = getProjectSettingsProfile(ctx);
        expect(profile.inheritedProfilePath).toBe(
          canonicalProjectDirectory(parent)
        );
        const scope = {
          inheritedProfilePath: profile.inheritedProfilePath,
          kind: "project" as const,
          overrideKeys: profile.overrideKeys,
          profileExists: profile.profileExists,
          target: profile.target,
        };

        saveScopedAdvisorSetting(ctx, scope, "modelWhitelist", settings());
        saveScopedAdvisorSetting(ctx, scope, "toolPolicies", settings());
        const saved = readConfig(agentDir);
        expect(saved.projectProfiles[profile.target].overrides).toEqual({
          advisorModelWhitelist: ["provider/model"],
          advisorToolPolicies: { bash: "summary" },
        });
        expect(saved.projectProfiles[parent]).toEqual({
          overrides: { advisorCollapseResponses: true },
        });
        expect(saved.unknown).toBe("preserved");

        const reset = resetProjectAdvisorSetting(ctx, "modelWhitelist");
        expect(reset?.modelWhitelist).toEqual(["global/model"]);
        expect(readConfig(agentDir).projectProfiles[profile.target]).toEqual({
          overrides: { advisorToolPolicies: { bash: "summary" } },
        });

        trusted = false;
        expect(() => resetProjectAdvisorSetting(ctx, "toolPolicies")).toThrow(
          /Project Trust/u
        );
        expect(readConfig(agentDir).projectProfiles[profile.target]).toEqual({
          overrides: { advisorToolPolicies: { bash: "summary" } },
        });
      }
    );
  });

  test("persists every settings row as an independent project override", async () => {
    await withAgentDir({}, async (agentDir) => {
      const project = join(agentDir, "project");
      mkdirSync(project);
      const ctx = asExtensionContext({
        cwd: project,
        hasUI: false,
        isProjectTrusted: () => true,
      });
      loadConfig(ctx);
      const profile = getProjectSettingsProfile(ctx);
      const scope = {
        kind: "project" as const,
        overrideKeys: profile.overrideKeys,
        profileExists: profile.profileExists,
        target: profile.target,
      };
      for (const id of SETTING_IDS) {
        saveScopedAdvisorSetting(ctx, scope, id, settings());
      }
      const expected = Object.assign(
        {},
        ...SETTING_IDS.map((id) => settingConfigValue(id, settings()))
      );
      expect(readConfig(agentDir).projectProfiles[profile.target]).toEqual({
        overrides: expected,
      });
    });
  });

  test("Backspace resets project override, preserves empty child, and leaves inherited row unchanged", () => {
    let resets = 0;
    const selector = new AdvisorSettingsSelector({
      effortLevels: ["Default (Model Default)", "high"],
      initial: settings(),
      onCancel: () => {},
      onResetOverride: (id) => {
        resets += 1;
        return id === "collapseResponses"
          ? { ...settings(), collapseResponses: false }
          : undefined;
      },
      presets: [{ description: "none", label: "0", value: 0 }],
      scope: {
        kind: "project",
        overrideKeys: ["advisorCollapseResponses"],
        profileExists: true,
        target: "/project",
      },
      theme: selectorTheme,
      tui: { requestRender: () => {} },
    });
    expect(plainScreen(selector)).toContain("Scope: all | scoped (/project)");
    expect(plainScreen(selector)).toContain("Tab: scope (all/scoped)");
    focusSettingsRow(selector, "Collapse long responses");
    expect(plainScreen(selector)).toContain("Project override.");
    selector.handleInput("\u007F");
    expect(resets).toBe(1);
    focusSettingsRow(selector, "Plan gate");
    selector.handleInput("\u007F");
    expect(resets).toBe(1);
  });

  test("Tab switches settings scope without saving during reload", () => {
    let toggles = 0;
    let saves = 0;
    const selector = new AdvisorSettingsSelector({
      effortLevels: ["Default (Model Default)", "high"],
      initial: settings(),
      onCancel: () => {},
      onScopeToggle: (current) => {
        toggles += 1;
        return current?.kind === "project"
          ? { scope: { kind: "global" }, settings: settings() }
          : {
              scope: {
                kind: "project",
                overrideKeys: [],
                profileExists: true,
                target: "/project",
              },
              settings: { ...settings(), collapseResponses: false },
            };
      },
      onSettingChange: () => {
        saves += 1;
        return settings();
      },
      presets: [{ description: "none", label: "0", value: 0 }],
      scope: { kind: "global" },
      scopeProjectPath: "/project",
      theme: selectorTheme,
      tui: { requestRender: () => {} },
    });

    for (const character of "collapse") {
      selector.handleInput(character);
    }
    expect(plainScreen(selector)).toContain("collapse");
    selector.handleInput("\t");
    expect(plainScreen(selector)).toContain("collapse");
    selector.handleInput("\t");
    expect(plainScreen(selector)).toContain("collapse");
    expect(toggles).toBe(2);
    expect(saves).toBe(0);
  });

  test("cancelling in project scope after Tab creates no profile", async () => {
    await withAgentDir(
      { advisorCollapseResponses: false },
      async (agentDir) => {
        const before = readConfig(agentDir);
        const project = join(agentDir, "trusted-project");
        mkdirSync(project);
        const commands = new Map<string, any>();
        registerCommands(mockPi({ commands }));
        const ctx = asExtensionContext({
          cwd: project,
          hasUI: true,
          isProjectTrusted: () => true,
          ui: {
            custom: async (factory: any) => {
              const selector = factory(
                { requestRender: () => {} },
                selectorTheme,
                { matches: () => false },
                () => {}
              );
              selector.handleInput("\t");
              selector.handleInput("\u001B");
            },
            notify: () => {},
            select: async () => undefined,
          },
        });

        await commands.get("advisor-settings").handler("", ctx);

        expect(readConfig(agentDir)).toEqual(before);
      }
    );
  });

  test("profile removal waits for explicit confirmation", () => {
    let removed = 0;
    const selector = new AdvisorSettingsSelector({
      effortLevels: ["Default (Model Default)", "high"],
      initial: settings(),
      onCancel: () => {},
      onRemoveProfile: () => {
        removed += 1;
        return settings();
      },
      presets: [{ description: "none", label: "0", value: 0 }],
      scope: {
        kind: "project",
        overrideKeys: [],
        profileExists: true,
        target: "/project",
      },
      theme: selectorTheme,
      tui: { requestRender: () => {} },
    });
    focusSettingsRow(selector, "Remove this project profile");
    selector.handleInput("\r");
    selector.handleInput("\u001B");
    expect(removed).toBe(0);
    selector.handleInput("\r");
    selector.handleInput("\r");
    expect(removed).toBe(1);
  });

  test("global scope does not inherit current project values", async () => {
    await withAgentDir(
      { advisorCollapseResponses: false },
      async (agentDir) => {
        const project = join(agentDir, "project");
        mkdirSync(project);
        writeFileSync(
          join(agentDir, "advisor.json"),
          JSON.stringify({
            advisorCollapseResponses: false,
            projectProfiles: {
              [project]: { overrides: { advisorCollapseResponses: true } },
            },
          })
        );
        const ctx = asExtensionContext({
          cwd: project,
          hasUI: false,
          isProjectTrusted: () => true,
        });
        loadConfig(ctx);
        expect(getAdvisorSettings().collapseResponses).toBe(true);
        expect(getGlobalAdvisorSettings(ctx).collapseResponses).toBe(false);
        expect(getAdvisorSettings().collapseResponses).toBe(true);
      }
    );
  });

  test("scope toggle leaves global editing available when project trust is absent", async () => {
    await withAgentDir({}, async (agentDir) => {
      const commands = new Map<string, any>();
      const notes: string[] = [];
      registerCommands(mockPi({ commands }));
      const ctx = asExtensionContext({
        cwd: join(agentDir, "untrusted"),
        hasUI: true,
        isProjectTrusted: () => false,
        ui: {
          custom: async (factory: any) => {
            const selector = factory(
              { requestRender: () => {} },
              selectorTheme,
              { matches: () => false },
              () => {}
            );
            expect(selector.render(100).join("")).toContain(ctx.cwd);
            selector.handleInput("\t");
            selector.handleInput("\u001B");
          },
          notify: (message: string) => notes.push(message),
          select: async () => undefined,
        },
      });
      await commands.get("advisor-settings").handler("", ctx);
      expect(notes).toContain(
        "Project-scoped settings require Pi Project Trust. Use /trust first."
      );
      expect(readConfig(agentDir)).toEqual({});
    });
  });

  test("confirmed removal deletes only target profile", async () => {
    await withAgentDir({}, async (agentDir) => {
      const parent = join(agentDir, "parent");
      const child = join(parent, "child");
      mkdirSync(child, { recursive: true });
      writeFileSync(
        join(agentDir, "advisor.json"),
        JSON.stringify({
          projectProfiles: {
            [parent]: { overrides: { advisorCollapseResponses: true } },
            [child]: { overrides: { advisorCollapseResponses: false } },
          },
        })
      );
      const ctx = asExtensionContext({
        cwd: child,
        hasUI: false,
        isProjectTrusted: () => true,
      });
      expect(removeProjectConfig(ctx)).toBe(true);
      expect(readConfig(agentDir).projectProfiles).toEqual({
        [parent]: { overrides: { advisorCollapseResponses: true } },
      });
    });
  });
});
