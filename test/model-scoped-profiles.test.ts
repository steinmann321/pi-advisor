import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerCommands } from "../src/commands.ts";
import { advisorRef, executorRef, loadConfig } from "../src/config.ts";
import { canonicalProjectDirectory } from "../src/config/project-profiles.ts";
import { withAgentDir } from "./helpers/config-fixture.ts";
import { asExtensionContext } from "./helpers/extension-context.ts";
import { activationHarness } from "./helpers/harness.ts";
import { mockPi } from "./helpers/mock-pi.ts";

const modelRegistry = (authenticated = true) => ({
  find: (provider: string, id: string) => ({ id, provider }),
  getApiKeyAndHeaders: () =>
    Promise.resolve({ apiKey: authenticated ? "key" : "", ok: authenticated }),
  getAvailable: () => [
    { id: "executor", provider: "project" },
    { id: "advisor", provider: "project" },
    { id: "new-executor", provider: "project" },
    { id: "executor", provider: "global" },
    { id: "advisor", provider: "global" },
  ],
});

const modelPickerUi = (
  scope: "Global" | "For this project",
  notes: string[] = []
) => {
  let customCalls = 0;
  return {
    custom: (factory: any) =>
      new Promise((resolve) => {
        const selector = factory(
          { requestRender: () => {} },
          {
            bold: (value: string) => value,
            fg: (_color: string, value: string) => value,
          },
          { matches: () => false },
          resolve
        );
        selector.render(100);
        const search =
          customCalls === 0 ? "project/executor" : "project/advisor";
        for (const character of search) {
          selector.handleInput(character);
        }
        customCalls += 1;
        selector.handleInput("\r");
      }),
    notify: (message: string) => notes.push(message),
    select: (title: string, choices: string[]) =>
      Promise.resolve(
        title.startsWith("Which Advisor configuration") ? scope : choices[0]
      ),
  };
};

const saved = (agentDir: string) =>
  JSON.parse(readFileSync(join(agentDir, "advisor.json"), "utf-8"));

describe("Scoped Advisor models", () => {
  test("saves selected project pair sparsely and applies it to descendants", async () => {
    await withAgentDir(
      { advisor: "global/advisor", executor: "global/executor" },
      async (agentDir) => {
        const project = mkdtempSync(join(tmpdir(), "pi-advisor-project-"));
        const child = join(project, "child");
        const sibling = `${project}-sibling`;
        mkdirSync(child);
        mkdirSync(sibling);
        try {
          const commands = new Map<string, any>();
          registerCommands(mockPi({ commands }));
          const ctx = asExtensionContext({
            cwd: project,
            hasUI: true,
            isProjectTrusted: () => true,
            modelRegistry: modelRegistry(),
            ui: modelPickerUi("For this project"),
          });

          await commands.get("advisor-models").handler("", ctx);

          expect(saved(agentDir)).toMatchObject({
            advisor: "global/advisor",
            executor: "global/executor",
            projectProfiles: {
              [canonicalProjectDirectory(project)]: {
                overrides: {
                  advisor: "global/advisor",
                  advisorEffort: "",
                  executor: "global/executor",
                  executorEffort: "",
                },
              },
            },
          });
          // SAFETY: ctx preserves every mocked ExtensionContext member while changing only cwd.
          loadConfig({ ...ctx, cwd: child } as any);
          expect(executorRef).toBe("global/executor");
          expect(advisorRef).toBe("global/advisor");
          // SAFETY: ctx preserves every mocked ExtensionContext member while changing only cwd.
          loadConfig({ ...ctx, cwd: sibling } as any);
          expect(executorRef).toBe("global/executor");
          expect(advisorRef).toBe("global/advisor");
        } finally {
          rmSync(project, { force: true, recursive: true });
          rmSync(sibling, { force: true, recursive: true });
        }
      }
    );
  });

  test("does not write selected project models when authentication fails", async () => {
    await withAgentDir(
      { advisor: "global/advisor", executor: "global/executor" },
      async (agentDir) => {
        const project = mkdtempSync(join(tmpdir(), "pi-advisor-project-"));
        try {
          const before = saved(agentDir);
          const commands = new Map<string, any>();
          registerCommands(mockPi({ commands }));
          const ctx = asExtensionContext({
            cwd: project,
            hasUI: true,
            isProjectTrusted: () => true,
            modelRegistry: modelRegistry(false),
            ui: modelPickerUi("For this project"),
          });

          await commands.get("advisor-models").handler("", ctx);

          expect(saved(agentDir)).toEqual(before);
        } finally {
          rmSync(project, { force: true, recursive: true });
        }
      }
    );
  });

  test("synchronizes active /model changes to effective parent profile", async () => {
    await withAgentDir(
      {
        advisor: "global/advisor",
        executor: "global/executor",
        projectProfiles: {},
      },
      async (agentDir) => {
        const parent = mkdtempSync(join(tmpdir(), "pi-advisor-project-"));
        const child = join(parent, "child");
        mkdirSync(child);
        writeFileSync(
          join(agentDir, "advisor.json"),
          JSON.stringify({
            advisor: "global/advisor",
            executor: "global/executor",
            projectProfiles: {
              [parent]: {
                overrides: {
                  advisor: "project/advisor",
                  executor: "project/executor",
                },
              },
            },
          })
        );
        const { events, pi } = activationHarness();
        registerCommands(pi);
        const ctx = asExtensionContext({
          cwd: child,
          hasUI: true,
          isProjectTrusted: () => true,
          modelRegistry: modelRegistry(),
          ui: { notify: () => {}, select: () => Promise.resolve("Global") },
        });

        await events.get("session_start")?.({ reason: "startup" }, ctx);
        events.get("model_select")?.(
          { model: { id: "new-executor", provider: "project" }, source: "set" },
          ctx
        );

        expect(saved(agentDir)).toMatchObject({
          executor: "global/executor",
          projectProfiles: {
            [canonicalProjectDirectory(parent)]: {
              overrides: {
                advisor: "project/advisor",
                executor: "project/new-executor",
              },
            },
          },
        });
        rmSync(parent, { force: true, recursive: true });
      }
    );
  });

  test("advisor-off persists global disable without deleting profile models", async () => {
    const project = mkdtempSync(join(tmpdir(), "pi-advisor-project-"));
    try {
      await withAgentDir(
        {
          advisor: "global/advisor",
          alwaysOn: true,
          executor: "global/executor",
          projectProfiles: {
            [project]: {
              overrides: {
                advisor: "project/advisor",
                alwaysOn: true,
                executor: "project/executor",
              },
            },
          },
        },
        async (agentDir) => {
          const { commands, events, pi, setActiveTools } = activationHarness();
          registerCommands(pi);
          const ctx = asExtensionContext({
            cwd: project,
            hasUI: true,
            isProjectTrusted: () => true,
            modelRegistry: modelRegistry(),
            ui: { notify: () => {}, select: () => Promise.resolve("Global") },
          });

          await events.get("session_start")?.({ reason: "startup" }, ctx);
          await commands.get("advisor-off").handler("", ctx);
          expect(saved(agentDir)).toMatchObject({
            alwaysOn: false,
            projectProfiles: {
              [project]: {
                overrides: {
                  advisor: "project/advisor",
                  alwaysOn: true,
                  executor: "project/executor",
                },
              },
            },
          });

          setActiveTools([]);
          await events.get("session_start")?.({ reason: "startup" }, ctx);
          expect(pi.getActiveTools()).not.toContain("ask_advisor");
        }
      );
    } finally {
      rmSync(project, { force: true, recursive: true });
    }
  });

  test("uses explicit headless scope and keeps omitted scope global", async () => {
    await withAgentDir({}, async (agentDir) => {
      const project = mkdtempSync(join(tmpdir(), "pi-advisor-project-"));
      try {
        const { commands, pi } = activationHarness();
        registerCommands(pi);
        const ctx = asExtensionContext({
          cwd: project,
          hasUI: false,
          isProjectTrusted: () => true,
          modelRegistry: modelRegistry(),
          ui: {},
        });

        await commands
          .get("advisor")
          .handler(
            "scope=project executor=project/executor advisor=project/advisor",
            ctx
          );
        await commands
          .get("advisor")
          .handler("executor=global/executor advisor=global/advisor", ctx);

        expect(saved(agentDir)).toMatchObject({
          advisor: "global/advisor",
          executor: "global/executor",
          projectProfiles: {
            [canonicalProjectDirectory(project)]: {
              overrides: {
                advisor: "project/advisor",
                executor: "project/executor",
              },
            },
          },
        });
      } finally {
        rmSync(project, { force: true, recursive: true });
      }
    });
  });
});
