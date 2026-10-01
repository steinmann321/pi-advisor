import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  registerFauxProvider,
} from "@earendil-works/pi-ai/compat";

import { consultAdvisor, runAdvisorGate } from "../extensions/index.ts";
import { canonicalProjectDirectory } from "../src/config/project-profiles.ts";
import { withAgentDir } from "./helpers/config-fixture.ts";
import { asExtensionContext } from "./helpers/extension-context.ts";

const profileContext = (
  cwd: string,
  faux: any,
  resolved: string[],
  trusted: () => boolean,
  authenticated = true
) =>
  asExtensionContext({
    cwd,
    isProjectTrusted: trusted,
    modelRegistry: {
      find: (provider: string, id: string) => {
        resolved.push(`${provider}/${id}`);
        return faux.models[0];
      },
      getApiKeyAndHeaders: () =>
        Promise.resolve({
          apiKey: authenticated ? "profile-api-key" : "",
          ok: authenticated,
        }),
    },
    sessionManager: {
      buildContextEntries: () => [],
      getBranch: () => [
        {
          id: "request",
          message: { content: "Review this profile path.", role: "user" },
          parentId: null,
          timestamp: "2026-10-01T00:00:00Z",
          type: "message",
        },
      ],
    },
  });

describe("Project-profile runtime safety", () => {
  test("uses selected profile models for Scout, consultations, and gates", async () => {
    const project = mkdtempSync(join(tmpdir(), "pi-advisor-profile-"));
    const unrelated = mkdtempSync(join(tmpdir(), "pi-advisor-unrelated-"));
    const globalProject = mkdtempSync(join(tmpdir(), "pi-advisor-global-"));
    const faux = registerFauxProvider({
      api: "profile-runtime-test",
      models: [{ id: "stream", input: ["text"] }],
      provider: "profile-runtime-test",
    });
    let trusted = true;
    const resolved: string[] = [];
    try {
      await withAgentDir(
        {
          advisor: "global/advisor",
          advisorScoutEnabled: false,
          executor: "global/executor",
          projectProfiles: {
            [project]: {
              overrides: {
                advisor: "project/advisor",
                advisorScoutEnabled: true,
                executor: "project/executor",
              },
            },
            [unrelated]: { overrides: { advisor: null } },
          },
        },
        async () => {
          faux.setResponses([
            () =>
              fauxAssistantMessage('{"selectedIds":["g_000"],"synthesis":""}'),
            () => fauxAssistantMessage("Project consultation."),
            () =>
              fauxAssistantMessage('{"selectedIds":["g_000"],"synthesis":""}'),
            () => fauxAssistantMessage("Decision: proceed\nContinue."),
            () => fauxAssistantMessage("Global consultation."),
          ]);
          const context = profileContext(
            project,
            faux,
            resolved,
            () => trusted
          );

          const consultation = await consultAdvisor(context);
          expect(consultation.model).toBe("project/advisor");
          expect(resolved).toEqual(["project/advisor", "project/executor"]);

          const gate = await runAdvisorGate(
            context,
            "Review repeated tool call."
          );
          expect(gate).toMatchObject({ decision: "proceed", ok: true });
          expect(resolved).toEqual([
            "project/advisor",
            "project/executor",
            "project/advisor",
            "project/executor",
          ]);

          trusted = false;
          await expect(consultAdvisor(context)).rejects.toThrow(
            `Project profile at ${canonicalProjectDirectory(project)} is unavailable because Pi does not trust`
          );
          expect(resolved).toHaveLength(4);

          const globalContext = profileContext(
            globalProject,
            faux,
            resolved,
            () => true
          );
          const global = await consultAdvisor(globalContext);
          expect(global.model).toBe("global/advisor");
          expect(resolved.at(-1)).toBe("global/advisor");
        }
      );
    } finally {
      faux.unregister();
      rmSync(project, { force: true, recursive: true });
      rmSync(unrelated, { force: true, recursive: true });
      rmSync(globalProject, { force: true, recursive: true });
    }
  });

  test("reports selected-profile authentication provenance without credentials", async () => {
    const project = mkdtempSync(join(tmpdir(), "pi-advisor-profile-"));
    const faux = registerFauxProvider({
      api: "profile-auth-test",
      models: [{ id: "stream", input: ["text"] }],
      provider: "profile-auth-test",
    });
    try {
      await withAgentDir(
        {
          advisor: "global/advisor",
          projectProfiles: {
            [project]: { overrides: { advisor: "project/advisor" } },
          },
        },
        async () => {
          const resolved: string[] = [];
          await expect(
            consultAdvisor(
              profileContext(project, faux, resolved, () => true, false)
            )
          ).rejects.toThrow(
            `Authentication unavailable for Advisor project/advisor. Source: selected project profile at ${canonicalProjectDirectory(project)}.`
          );
          expect(resolved).toEqual(["project/advisor"]);
        }
      );
    } finally {
      faux.unregister();
      rmSync(project, { force: true, recursive: true });
    }
  });
});
