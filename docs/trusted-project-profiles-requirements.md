# Trusted project profiles: requirements and user experience

Status: proposal for implementation planning; not implemented or released.

This document defines what should change, why, and how users should operate it. It is not a technical implementation plan. The shared configuration file and project-path keys are agreed requirements. Exact JSON nesting, internal architecture, APIs, and implementation sequence remain outside its scope.

## Problem and motivation

pi-advisor currently uses one user-level `advisor.json` for all projects. Choosing different models for a private project also changes the defaults used in work projects. This creates friction and risks unintended provider selection or disclosure of project context to the wrong provider.

Representative use case:

| Context | Executor | Advisor |
| --- | --- | --- |
| Work projects, global default | Trusted Zone provider / Luna | Trusted Zone provider / Sol |
| Private project `dealer` | Codex subscription / Luna | Codex subscription / Sol |

A user should be able to configure the private project once without changing the work defaults, switching Pi installations, or maintaining separate agent directories. Provider names and model versions above are illustrative, not product defaults.

## Historical context and security rationale

Commit [`9a3eb0f`](https://github.com/philipbrembeck/pi-advisor/commit/9a3eb0fa9d34692ca0a82aafb8ec0328647e4761), `fix(security): harden advisor boundaries`, removed repository-controlled project `advisor.json` loading and saving in version 0.2.7. The concern was that a repository under review could change its own supervision and disclosure rules. Current 0.9.0 documentation and tests retain the global-only policy.

This proposal does not restore that removed behavior. A project profile is user-controlled configuration stored outside the repository, associated with a directory path. A cloned repository cannot supply or change it merely through its versioned `.pi/advisor.json`.

Pi Project Trust is an additional prerequisite for applying a project profile. Trust authorizes loading project resources; it is not a sandbox, a guarantee against prompt injection, or permission to disclose arbitrary data. Provider and disclosure choices remain explicit user decisions.

## Desired outcome

- Preserve existing global Advisor configuration as the default.
- Support user-level configuration overrides associated with project directories.
- Apply a matching project profile only when Pi considers the current project trusted.
- Keep repository-controlled `.pi/advisor.json` ignored, even for trusted projects.
- Make the effective configuration and its origin understandable.
- Prevent a project-specific model choice from silently changing global defaults or falling back to a different provider.
- Use existing model and settings commands rather than introducing a separate project-management command.

## Terminology and ownership

- **Global configuration:** user-level defaults for projects without an applicable override.
- **Project profile:** user-level overrides associated with a canonical directory path; not a configuration file inside that directory.
- **Effective configuration:** global defaults combined with the applicable project profile.
- **Inherited value:** a global value, or built-in default when no global value is configured, not explicitly overridden by the selected project profile.
- **Editing scope:** where a user's changes are saved; distinct from which configuration currently applies.

Use **For this project** in the UI instead of an unexplained **Local** label. Users must not mistake the feature for repository-local configuration.

Both scopes are stored in the same existing user-level `advisor.json` in the Pi agent directory, normally `~/.pi/agent/advisor.json`. Project profiles are entries keyed by their canonical absolute project directory path inside a dedicated subsection of that file. Each entry contains only explicitly overridden settings; no separate project-profile file is introduced. The exact subsection name and JSON nesting remain implementation-plan decisions. `trust.json` remains Pi's trust store and must not receive Advisor fields.

## Directory matching and inheritance

Project-profile matching should follow Pi's path-oriented trust conventions:

- Use absolute, canonical directory identities, resolving symlinks where possible.
- Match the current directory or a real ancestor directory, not a raw string prefix.
- A profile applies to its directory and descendants; `dealer-copy` must not match `dealer`.
- The nearest matching directory profile takes precedence over a more distant profile.
- Combine global defaults with that selected profile, not an implicit accumulation of every ancestor profile.
- Value precedence is explicit project override, then global configuration, then built-in default. Values omitted from the selected profile remain inherited, not copied into the profile.
- Creating a more specific profile records only individually changed keys; it does not copy the entire parent profile.
- A moved project or a Git worktree outside the matching directory hierarchy must not acquire a profile merely because it has the same repository name or remote.
- Show the matched profile path when it differs from the current working directory.

Project Trust and profile selection are independent decisions. A trusted parent may make a child trusted according to Pi, but it must not create an Advisor profile or choose a provider. Use Pi's effective trust decision, including its supported session and command-line overrides, rather than treating the presence of a `trust.json` entry as the only form of trust.

## User experience

### Entry points and scope selection

Extend `/advisor-models` and `/advisor-settings` with a scope selector before their existing dialogs:

```text
Which configuration do you want to edit?

Global
Default for projects without their own override.

For this project
/Users/jakob.steinmann/vscodeprojects/dealer
Overrides global values for this directory and its descendants.

Project profiles are stored in your Pi user configuration, not in the repository.
```

- Global editing remains available whether or not the current project is trusted.
- Project editing is selectable only for a trusted project.
- In an untrusted project, show the project option as unavailable with a brief instruction to use `/trust` first.
- Do not grant trust automatically or modify Pi's trust decisions.
- Cancelling scope selection changes nothing.
- Selecting a scope alone changes nothing and does not activate a profile or switch a model.
- Display the scope and target directory throughout the subsequent dialog.

### Creating or editing a project profile

When no profile exists for the target directory, explain that the first saved override creates a user-level project profile. Opening a dialog without changing values must not copy global settings into a new profile.

If a profile is inherited from a parent directory, distinguish **the currently effective parent profile** from **the current directory targeted for editing**. This-project editing targets the current canonical directory; it must not silently edit a parent profile affecting sibling projects. Make clear that creating a more specific profile replaces the parent profile as the selected override source, with unoverridden values coming from global defaults.

The model dialog continues to offer Executor and Advisor model selection and their reasoning levels. All configuration settings are eligible for project overrides, including behavior, presentation, disclosure consent, and Jev settings. The settings dialog must make project overrides and inherited values distinguishable. Reuse the existing interaction patterns rather than requiring manual JSON editing.

Users must be able to distinguish explicit overrides from inherited values, for example:

```text
Advisor Models · Project: dealer

Executor: Codex / Luna       [Project override]
Advisor: Codex / Sol         [Project override]
Advisor effort: high        [Inherited from global]
```

Preserve each dialog's existing confirmation and saving behavior. Settings that currently save immediately may continue doing so, but only explicit changes belong in the selected profile. Model choices must still pass the existing availability and authentication checks before saving. Escape must not be presented as undoing changes already saved by an immediate-save dialog.

### Resetting overrides

- Use **Backspace**, the key above Enter that deletes backwards, to remove the selected setting's project override. Show this key binding in the project dialog.
- Resetting removes the override and restores inheritance from global configuration or built-in defaults; it must not save a copy of the inherited value.
- Backspace on an already inherited setting changes nothing and must not modify global settings or a parent profile.
- Offer an explicit, confirmed action to remove all overrides for the target directory. The exact UI for selecting whole-profile removal remains to be designed; it must be distinguishable from the per-setting Backspace action.
- Explain that removing a profile can reveal a parent profile, or global defaults if none matches, including a possible provider change.
- Never delete or modify a parent profile as an incidental effect of resetting the current directory's profile.

### Editing global configuration

Global edits retain their meaning as defaults. When the current project overrides an edited value, explain that the change will not affect that project's effective value. Global editing must not accidentally remove project overrides.

### Activation and automatic behavior

`/advisor` should use the effective configuration automatically; it does not need the scope selector used for editing. Manual consultations, `ask_advisor`, automatic gates, persistent activation, and Scout must agree on the effective profile and model choices.

All configuration-saving actions write to the same user-level `advisor.json`. All existing settings, including Executor and Advisor models, support project overrides. Executor synchronization after `/model` must support updating the project-scoped model rather than silently changing global model defaults when a project profile is effective.

`/advisor-off` turns Advisor off globally, regardless of the current project profile. This command is not project-scoped and must not merely disable Advisor for the current directory. A project profile must not negate the global off action. Global off does not remove project profiles or their model overrides.

Explicit `/advisor` arguments must respect the same global/project configuration distinction. Their target-entry selection remains an implementation-plan detail; whether models or other existing settings are eligible for project overrides is already settled.

## Trust loss, invalid configuration, and provider failures

Trust eligibility must hold when a profile is applied and when project-scoped changes are saved, not only when a settings dialog is first opened.

- If no project profile matches, retain existing global behavior.
- If a matching profile exists but the project is untrusted, do not apply it and do not silently consult the global provider instead. Explain why Advisor use is unavailable until the user explicitly resolves the trust/profile conflict.
- If the selected profile is malformed, references an unavailable model, or lacks usable authentication, report the problem without silently selecting global models, a different profile, or another provider.
- A malformed or unavailable unrelated profile must not change, disable, or block another project's effective configuration. Validate and isolate individual profile entries; editing one project must preserve the entries for other projects.
- Distinguish a configuration or trust error from an Advisor verdict against the user's work.
- Preserve existing distinctions between an unavailable consultation, a blocked tool action, and a blocked session. A profile error must not silently introduce broader blocking behavior.
- Show enough configuration provenance to diagnose which profile and model caused a failure, without exposing credentials.

Removing a profile deliberately may change the effective provider. An unavailable profile must not cause the same change implicitly.

## Configuration boundaries

User-owned profiles can legitimately customize behavior per project; the project itself does not gain authority to change supervision rules. The requirement is not to introduce a new security-policy engine or to claim that model selection is network isolation.

- All configuration fields support explicit project overrides, including models, reasoning levels, tracked/untracked-file consent, Jev settings, and outcome-logging consent. There are no global-only exceptions for configuration settings.
- Credentials, OAuth state, secret-store operations, and API-key migration remain under existing user-level ownership; a profile is not another credential store.
- Outcome logging still requires explicit consent, evaluated from the effective configuration. Project Trust alone never grants logging or disclosure consent. Logging storage remains local under its existing contract; project profiles do not introduce another log store.
- Unknown configuration fields must retain the existing forward-compatibility preservation behavior.
- Existing users with no project profiles must retain their current effective settings and provider selection.
- Manual configuration editing remains supported and documented, alongside the interactive workflow.

## Acceptance criteria

1. A user can choose a Codex Executor/Advisor pair for trusted `dealer` through `/advisor-models` without changing global Trusted Zone defaults.
2. The choice survives restarting or resuming Pi and applies from descendant directories.
3. A sibling directory such as `dealer-copy` does not receive the `dealer` profile.
4. Both configuration commands explain global versus project scope and user-level storage before editing.
5. Untrusted projects cannot create, edit, or apply a project profile through these commands.
6. A matching private profile that becomes ineligible or unavailable does not silently send context to the global work provider.
7. Inherited values follow later global changes; explicit overrides do not. Missing global values use built-in defaults; inherited values are never copied into a profile.
8. Opening a dialog, cancelling scope selection, or cancelling before any saved change creates no profile and freezes no inherited values; previously saved immediate changes remain saved.
9. Backspace on an overridden setting removes that key and restores inheritance; on an inherited setting it changes nothing. Removing a profile requires confirmation and clearly explains the resulting effective scope/provider.
10. All Advisor invocation paths use consistent profile selection; Scout uses the profile's effective Executor.
11. Repository-local `.pi/advisor.json` remains ignored regardless of trust.
12. Model/configuration edits for one scope preserve unrelated scopes, unknown fields, and concurrent user edits.
13. Existing global-only configurations remain valid without migration or behavior changes beyond the added editing-scope prompt.
14. No additional agents, credential copies, installed-plugin patches, or separate Pi installations are required.
15. Global settings and path-keyed project overrides are saved and loaded from the same existing user-level `advisor.json`.
16. All configuration settings can be explicitly overridden for a project; credential ownership and explicit-consent requirements remain intact.
17. Invalid or unavailable unrelated profiles do not affect another project; a selected-profile failure never triggers a silent provider fallback.
18. Creating a more specific profile saves only individual overrides, never a complete copy of its parent profile.
19. `/advisor-off` disables Advisor globally, including when a project profile is effective, without removing project overrides.
20. Executor model synchronization after `/model` supports project-scoped model changes without silently overwriting global model defaults.

## Agreed decisions

- **Storage:** use the existing user-level `advisor.json` for both scopes, with project entries keyed by canonical directory path.
- **Inheritance:** save only explicit project overrides. Resolve values from the nearest selected profile, then global configuration, then built-in defaults; do not accumulate ancestor profiles.
- **Eligible fields:** all existing configuration settings support project overrides, including Executor and Advisor models; profiles do not duplicate credentials.
- **Model changes:** `/model` synchronization supports project-local Executor model configuration. Project-scoped model changes do not silently overwrite global model defaults.
- **Off:** `/advisor-off` is a global off action, not a project override. It disables Advisor across projects without deleting profiles; profiles cannot negate this global off action.
- **Reset:** Backspace removes the selected project override instead of writing an inherited value.
- **Parent profiles:** do not copy a complete parent profile or edit it incidentally when changing individual keys for the current directory.
- **Isolation:** unrelated project profiles, including invalid entries, cannot alter or block another project's configuration. Intended parent-to-descendant matching remains unchanged.

## Decisions still required for the implementation plan

- Exact subsection name, JSON nesting, and profile-entry validation in the shared `advisor.json`; storage location, path keys, and isolation of unrelated entries are already settled.
- Target-entry selection for explicit `/advisor` arguments. Storage in the shared file, eligibility of all existing settings for project overrides, project-local model configuration, and global `/advisor-off` behavior are already settled. Model-picker recovery must not silently cross provider boundaries.
- Representation and merging of nested settings, arrays, explicit empty/disable values, and `null`, distinct from removing an override to restore inheritance.
- Exact whole-profile removal interaction and its confirmation, separate from Backspace on a single setting.
- Whether creating a profile for a broad parent directory needs an additional warning. Worktrees outside the matching hierarchy retain explicit path associations, not repository-name or remote-based matching.

These remaining decisions must be resolved during planning; the agreed decisions above must not be reopened as unspecified behavior.

## Evidence and references

- [Current configuration behavior](configuration.md)
- [Current privacy and consent boundaries](privacy.md)
- [Removal of repository-controlled configuration](https://github.com/philipbrembeck/pi-advisor/commit/9a3eb0fa9d34692ca0a82aafb8ec0328647e4761)
- Current [`loadConfig` and persistence behavior](../src/config/storage.ts) and [project-configuration tests](../test/config-project.test.ts)
- [Pi Project Trust documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)

Baseline inspected: pi-advisor 0.9.0, commit `58b689f`; Pi trust behavior inspected in installed Pi 0.99.1. This document describes a proposed feature, not capabilities available in those versions.
