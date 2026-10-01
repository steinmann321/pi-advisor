---
id: "03"
dependencies:
  - "01"
  - "02"
---

# Task 03: Scoped models and activation

Make model selection, explicit activation, and `/model` synchronization respect chosen global or trusted project scope without changing global defaults accidentally.

## References

- `../design.md#project-models-global-off`
- `../design.md#consistent-invocation-and-isolated-failures`
- `docs/trusted-project-profiles-requirements.md#activation-and-automatic-behavior`
- `src/commands/model-commands.ts`
- `src/commands/model-picker.ts`
- `src/commands/activation.ts`
- `src/commands/activation-preparation.ts`
- `src/commands/lifecycle.ts`
- `src/commands/model-options.ts`
- `test/model-picker.test.ts`
- `test/model-adoption.test.ts`
- `test/activation.test.ts`

## Work

- [x] Add Global / For this project scope selection and provenance to `/advisor-models`, reusing scoped configuration behavior from task 02. **Note:** Scope chooser and picker labels reuse `selectSettingsScope` and show project/parent provenance.
- [x] Persist selected Executor/Advisor refs and efforts as explicit project overrides only after existing availability and authentication checks pass; preserve global models and parent profiles. **Note:** Verified by `test/model-scoped-profiles.test.ts` successful scoped save and failed-auth assertions.
- [x] Make `/advisor` use effective profile configuration automatically. When its arguments or first-run picker would persist changes, select scope interactively; support headless `scope=global|project` and retain global persistence when scope is omitted for backward compatibility. **Note:** Verified by `test/model-scoped-profiles.test.ts` headless project/global assertions and activation picker coverage.
- [x] Route explicit `/model` synchronization through current effective editing target so an active project profile updates its Executor override instead of global configuration. **Note:** Verified by `test/model-scoped-profiles.test.ts` parent-profile synchronization assertion.
- [x] Keep restored/cycled model behavior and marked-subagent protections unchanged; clear stale project-specific pending model state when project context changes. **Note:** Verified by existing `test/model-adoption.test.ts` restored/cycled and marked-child coverage.
- [x] Keep `/advisor-off` globally disabling persistent activation without deleting profile overrides or allowing a profile to reactivate it. **Note:** Verified by `test/model-scoped-profiles.test.ts` global-disable reload assertion.
- [x] Add model picker, model-sync, argument, headless scope, auth/unavailable-model, parent/child, and global-off tests for both scopes. **Note:** Verified by `test/model-scoped-profiles.test.ts`, `test/activation.test.ts`, `test/model-picker.test.ts`, and `test/model-adoption.test.ts`.

## Verification

- [x] Trusted project can save distinct Executor/Advisor pair, survive restart/resume, and apply it from descendants while globals and siblings remain unchanged. **Note:** Verified by scoped save, descendant resolution, and headless global/project assertions in `test/model-scoped-profiles.test.ts`.
- [x] Failed availability or authentication checks save neither global nor project model changes. **Note:** Verified by failed-auth no-write assertion in `test/model-scoped-profiles.test.ts` and existing unavailable-model activation coverage.
- [x] `/advisor executor=… advisor=…` never silently chooses a project/global persistence destination; headless behavior is deterministic. **Note:** Verified by explicit `scope=project` and omitted-scope global assertions in `test/model-scoped-profiles.test.ts`.
- [x] Active `/model` changes update selected project override when one is effective, otherwise preserve existing global behavior. **Note:** Verified by parent-profile synchronization assertion in `test/model-scoped-profiles.test.ts` and existing global adoption tests.
- [x] `/advisor-off` disables Advisor globally and leaves stored project overrides intact. **Note:** Verified by global-disable reload assertion in `test/model-scoped-profiles.test.ts`.
- [ ] (manual testing required) Reloaded TUI verifies model-scope selection, model picker, success, unavailable/auth error, and global-off states with existing Advisor renderers.
