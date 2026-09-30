import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  advisorCollapseResponsesRef,
  advisorModelWhitelistRef,
  advisorRef,
  advisorToolPoliciesRef,
  contextMaxCharsRef,
  executorRef,
  loadConfig,
  resetConfigCache,
} from "../src/config.ts";
import { canonicalProjectDirectory } from "../src/config/project-profiles.ts";
import { advisorJevModelRef } from "../src/config/state.ts";
import { saveProjectConfig } from "../src/config/storage.ts";
import { DEFAULT_JEV_MODEL } from "../src/config/types.ts";
import type { JsonValue } from "../src/content-utils.ts";
import { asExtensionContext } from "./helpers/extension-context.ts";

const AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
let agentDir = "";
let root = "";
let trusted = true;
const previousAgentDir = process.env[AGENT_DIR_ENV];

const configPath = () => join(agentDir, "advisor.json");
const writeConfig = (config: JsonValue) =>
  writeFileSync(configPath(), JSON.stringify(config, null, 2));
const readConfig = () => JSON.parse(readFileSync(configPath(), "utf-8"));
const context = (cwd: string) =>
  asExtensionContext({
    cwd,
    hasUI: false,
    isProjectTrusted: () => trusted,
  });

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "pi-advisor-agent-"));
  root = mkdtempSync(join(tmpdir(), "pi-advisor-profiles-"));
  process.env[AGENT_DIR_ENV] = agentDir;
  trusted = true;
  resetConfigCache();
});

afterEach(() => {
  resetConfigCache();
  if (previousAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env[AGENT_DIR_ENV] = previousAgentDir;
  }
  rmSync(agentDir, { force: true, recursive: true });
  rmSync(root, { force: true, recursive: true });
});

describe("User-owned project profiles", () => {
  test("selects only nearest boundary-matching profile", () => {
    const dealer = join(root, "dealer");
    const child = join(dealer, "child");
    const sibling = join(root, "dealer-copy");
    const worktree = join(root, "worktree");
    mkdirSync(child, { recursive: true });
    mkdirSync(sibling);
    mkdirSync(worktree);
    writeConfig({
      advisor: "global/advisor",
      executor: "global/executor",
      projectProfiles: {
        [dealer]: {
          overrides: {
            advisorCollapseResponses: true,
            executor: "dealer/executor",
          },
        },
        [child]: { overrides: { executor: "child/executor" } },
      },
    });

    loadConfig(context(child));
    expect(executorRef).toBe("child/executor");
    expect(advisorRef).toBe("global/advisor");
    expect(advisorCollapseResponsesRef).toBe(false);

    loadConfig(context(dealer));
    expect(executorRef).toBe("dealer/executor");
    expect(advisorCollapseResponsesRef).toBe(true);

    loadConfig(context(sibling));
    expect(executorRef).toBe("global/executor");
    loadConfig(context(worktree));
    expect(executorRef).toBe("global/executor");
  });

  test("resolves symlinked working directories and keeps sparse false, zero, empty, object, and array overrides", () => {
    const project = join(root, "project");
    const descendant = join(project, "nested");
    const alias = join(root, "alias");
    mkdirSync(descendant, { recursive: true });
    symlinkSync(project, alias);
    writeConfig({
      advisor: "global/advisor",
      advisorCollapseResponses: true,
      advisorJevModel: "global-jev",
      advisorModelWhitelist: ["global/model"],
      advisorToolPolicies: { read: "full" },
      contextMaxChars: 123,
      projectProfiles: {
        [project]: {
          overrides: {
            advisor: "",
            advisorCollapseResponses: false,
            advisorJevModel: "",
            advisorModelWhitelist: [],
            advisorToolPolicies: {},
            contextMaxChars: 0,
          },
        },
      },
    });

    loadConfig(context(join(alias, "nested")));
    expect(advisorRef).toBe("");
    expect(advisorCollapseResponsesRef).toBe(false);
    expect(advisorJevModelRef).toBe(DEFAULT_JEV_MODEL);
    expect(advisorModelWhitelistRef).toEqual([]);
    expect(advisorToolPoliciesRef).toEqual({});
    expect(contextMaxCharsRef).toBe(0);
    expect(readConfig().projectProfiles[project].overrides.advisor).toBe("");
  });

  test("rejects selected invalid or untrusted profiles without parent or global fallback", () => {
    const parent = join(root, "parent");
    const child = join(parent, "child");
    const unrelated = join(root, "unrelated");
    mkdirSync(child, { recursive: true });
    mkdirSync(unrelated);
    writeConfig({
      executor: "global/executor",
      projectProfiles: {
        [parent]: { overrides: { executor: "parent/executor" } },
        [child]: { overrides: { executor: null } },
        [join(root, "broken")]: { overrides: { unknown: true } },
      },
    });

    expect(() => loadConfig(context(child))).toThrow(child);
    expect(executorRef).toBe("");
    loadConfig(context(unrelated));
    expect(executorRef).toBe("global/executor");

    writeConfig({
      executor: "global/executor",
      projectProfiles: {
        [parent]: { overrides: { executor: "parent/executor" } },
        [child]: { overrides: { executor: "child/executor" } },
      },
    });
    resetConfigCache();
    loadConfig(context(child));
    expect(executorRef).toBe("child/executor");
    trusted = false;
    expect(() => loadConfig(context(child))).toThrow(/does not trust/u);
    expect(executorRef).toBe("");
  });

  test("re-reads a rewritten profile with unchanged size and mtime", () => {
    const project = join(root, "project");
    mkdirSync(project);
    const initial = {
      projectProfiles: {
        [project]: { overrides: { executor: "one/executor" } },
      },
    };
    const rewritten = {
      projectProfiles: {
        [project]: { overrides: { executor: "two/executor" } },
      },
    };
    writeConfig(initial);
    loadConfig(context(project));
    expect(executorRef).toBe("one/executor");
    const { atime, mtime } = statSync(configPath());
    writeConfig(rewritten);
    utimesSync(configPath(), atime, mtime);

    loadConfig(context(project));
    expect(executorRef).toBe("two/executor");
  });

  test("writes sparse profiles from fresh disk data and retains an empty child", () => {
    const target = join(root, "target");
    const other = join(root, "other");
    mkdirSync(target);
    mkdirSync(other);
    writeConfig({
      executor: "old/executor",
      projectProfiles: {
        [other]: { overrides: { executor: "other/executor" } },
      },
      unknown: "old",
    });
    writeConfig({
      executor: "external/executor",
      projectProfiles: {
        [other]: { overrides: { executor: "other/executor" } },
      },
      unknown: "external",
    });

    saveProjectConfig(context(target), { advisorCollapseResponses: false });
    expect(readConfig()).toEqual({
      executor: "external/executor",
      projectProfiles: {
        [other]: { overrides: { executor: "other/executor" } },
        [canonicalProjectDirectory(target)]: {
          overrides: { advisorCollapseResponses: false },
        },
      },
      unknown: "external",
    });

    saveProjectConfig(context(target), {});
    expect(
      readConfig().projectProfiles[canonicalProjectDirectory(target)]
    ).toEqual({ overrides: {} });
  });
});
