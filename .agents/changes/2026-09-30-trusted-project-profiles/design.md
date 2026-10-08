---
datetime: 2026-09-30T11:52:04Z
author: Jakob Steinmann
tags: [configuration, project-profiles, trust]
---

# Trusted project profiles

Status: agreed product design; implementation details listed below remain open. Not implemented or released.

## Context and outcome

Work and private projects need different Executor/Advisor models without changing global defaults or risking disclosure to the wrong provider. Add user-owned, path-associated overrides to the existing configuration. Do not restore repository-controlled `.pi/advisor.json` loading, removed in version 0.2.7.

Example: trusted `dealer` uses a Codex Executor/Advisor pair; work projects keep their global Trusted Zone pair. No extra installation, agents, credentials, or plugin patches are needed.

Source of requirements: [trusted project profiles](../../../docs/trusted-project-profiles-requirements.md). This design captures the subsequent discussion, not a task list or a complete implementation schema.

## Key Decisions

### One user-level configuration file

- **Decision:** Store global settings and project profiles in the same existing `advisor.json`, normally `~/.pi/agent/advisor.json`. A dedicated subsection holds profiles keyed by canonical absolute project-directory paths. Each profile stores only explicitly changed keys.
- **Reason:** Keep existing ownership and persistence location; project changes must not overwrite global defaults.
- **Trade-offs:** Shared-file writes must preserve unrelated profiles, unknown fields, and concurrent user edits. Exact subsection name and nesting remain open. Repository-local `.pi/advisor.json` stays ignored, even in trusted projects; Pi's `trust.json` receives no Advisor fields.

### Nearest profile, then global settings, then defaults

- **Decision:** Match the current canonical directory or its real ancestors; resolve symlinks where possible. The nearest matching profile is the only selected profile. Missing values inherit global settings, then built-in defaults. Do not accumulate ancestor profiles or copy an entire parent profile.
- **Reason:** Predictable sparse overrides; inherited values continue following global changes.
- **Trade-offs:** A new child profile replaces the selected parent profile, so unchanged child values come from global settings, not parent overrides. Directory-boundary matching excludes siblings such as `dealer-copy`. Moved projects and external worktrees require an explicit matching path, not a shared repository name or remote.

The resolution flow prevents profile failures from selecting another provider:

```text
Canonical working directory
  -> nearest path-matching profile?
     -> none: existing global configuration + built-in defaults
     -> found: Pi effective trust permits project use?
        -> no: explain conflict; no global-provider fallback
        -> yes: explicit profile values -> global values -> defaults
           -> selected configuration/model/auth valid?
              -> no: explain failure; no alternate profile/provider
              -> yes: use effective configuration
```

Arrows between values express per-setting precedence, not fallback after a configuration or provider error.

### All existing settings support project overrides

- **Decision:** Allow all configuration settings to be overridden, including models, reasoning levels, behavior, presentation, tracked/untracked-file consent, Jev settings, and outcome-logging consent.
- **Reason:** Users requested full settings parity, not a restricted project-settings subset.
- **Trade-offs:** Provider-affecting and consent settings need clear provenance. Existing explicit-consent requirements still apply; Pi Project Trust alone grants neither disclosure nor logging consent. Credentials, OAuth state, secret-store operations, and key migration stay under existing user-level ownership. Logging remains local; session summaries remain local and ephemeral.

### Pi Project Trust remains mandatory

- **Decision:** Use Pi's effective trust decision, including supported session and command-line overrides. Recheck eligibility when applying a profile and saving a project change; never grant trust automatically.
- **Reason:** Repository resources cannot choose their own supervision or disclosure rules.
- **Trade-offs:** A matching profile in an untrusted project makes Advisor use unavailable until the user explicitly resolves the conflict; it must not silently use global models. Trust is not a sandbox or a substitute for explicit provider and disclosure choices.

### Explicit editing scope and visible inheritance

- **Decision:** Add a Pi-style inline `Scope: all | scoped (<canonical absolute path>)` toggle to `/advisor-models` and `/advisor-settings`; Tab switches save target. `all` means global settings, `scoped` means the current trusted project profile. Keep global editing available everywhere; reject scoped edits when untrusted with a `/trust` hint. Show scope, target directory, explicit overrides, and inherited values throughout the dialog.
- **Reason:** Editing destination and effective configuration are distinct. The inline header reuses Pi's familiar model-selector convention and removes a separate scope prompt. Users must understand that profiles live in user configuration, not the repository.
- **Trade-offs:** Toggling scope alone saves nothing and creates no profile. Model list remains unfiltered; scope selects persistence destination, not model availability. Editing targets the current canonical directory, never silently an effective parent profile; show the parent's path when relevant and explain child-profile precedence. Global edits leave overrides intact and explain when the current project masks a changed value.

### Backspace removes an override

- **Decision:** In project dialogs, Backspace (the backwards-delete key above Enter) removes the selected setting's explicit override and restores inheritance. On an inherited setting it does nothing. Show the binding. Offer a separate, confirmed whole-profile removal action.
- **Reason:** Reset means removing a key, not saving a copy of today's inherited value.
- **Trade-offs:** Removing a profile can reveal a parent profile or global settings and change providers; explain this before confirmation. Never modify a parent incidentally. Preserve existing model-dialog confirmation and immediate-save settings behavior: Escape cannot undo already saved changes. Whole-profile removal UI remains open.

### Project models; global off

- **Decision:** `/model` Executor synchronization supports project-local model settings without silently changing global model defaults. `/advisor` uses effective configuration automatically. `/advisor-off` turns Advisor off globally, regardless of project profile; profiles cannot negate this global off action. Off leaves saved profiles intact.
- **Reason:** Models are ordinary overrideable settings; the off command remains a global control, as explicitly requested.
- **Trade-offs:** Distinguish the off action from project configuration editing. Precise target-entry selection for explicit `/advisor` arguments remains open; model eligibility and global off behavior are already settled.

### Consistent invocation and isolated failures

- **Decision:** Manual consultations, `ask_advisor`, automatic gates, persistent activation, and Scout use the same effective profile and models; Scout uses the effective Executor. Model saves retain availability/authentication checks. Invalid or unavailable unrelated profile entries cannot change or block another project's configuration.
- **Reason:** One provider choice must hold across every invocation path; unrelated profiles must remain independent.
- **Trade-offs:** Selected-profile failures need visible provenance without credentials and must never select another provider or profile implicitly. Configuration/trust errors are not Advisor verdicts. Preserve separate unavailable-consultation, blocked-tool, and blocked-session states; do not broaden blocking. Runtime/UI changes must reuse existing Advisor rendering and receive reloaded-TUI verification, not only unit tests.

## Remaining implementation decisions

Do not reopen storage location, path keys, field eligibility, model overrides, Backspace reset, or global off behavior.

- Exact shared-file subsection and JSON nesting, plus validation that isolates individual entries.
- Nested-field merge rules, arrays, and explicit empty/disable/`null` values versus absent overrides. Individual settings must remain individually resettable.
- Target-entry selection for explicit `/advisor` arguments.
- Whole-profile removal interaction and confirmation, distinct from single-setting Backspace.
- Last-override reset: retain an empty child profile (global inheritance, parent still masked) or remove it (parent may become effective)? Do not let incidental storage cleanup decide this or silently change providers; specify and test the chosen behavior.
- Whether broad parent-directory profile creation needs an additional warning.

## Verification contract

The [source acceptance criteria](../../../docs/trusted-project-profiles-requirements.md#acceptance-criteria) remain authoritative. Implementation must demonstrate:

- Project model choices survive restart/resume, apply to descendants, and leave globals and siblings unchanged.
- Nearest-profile selection, symlink/path boundaries, global/default inheritance, and inherited-value updates behave as specified.
- No-change/cancel paths create no profile; reset removes only explicit keys; removal explains the resulting provider.
- Trust loss, selected-profile corruption, missing models, and authentication failures produce visible errors with no implicit provider fallback; unrelated bad entries remain isolated.
- Every invocation path agrees on effective models; `/advisor-off` remains global.
- Scoped saves preserve other settings, profiles, unknown fields, and concurrent edits; existing global-only users need no migration.
- Every setting has default, validation, persistence, and navigation tests. Changed runtime/UI flows are verified in the reloaded TUI, including call, streaming, response, error, and blocked states.
- Repository checks pass; released user-facing behavior is documented in README and CHANGELOG when delivered, not as an already available feature.

## References

- [Requirements and user experience](../../../docs/trusted-project-profiles-requirements.md)
- [Current configuration](../../../docs/configuration.md) and [privacy boundaries](../../../docs/privacy.md)
- [Current configuration storage](../../../src/config/storage.ts) and [project-configuration tests](../../../test/config-project.test.ts)
- [Repository-config removal, commit `9a3eb0f`](https://github.com/philipbrembeck/pi-advisor/commit/9a3eb0fa9d34692ca0a82aafb8ec0328647e4761)
- [Pi Project Trust](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)
