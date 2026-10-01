---
id: "02"
dependencies:
  - "01"
---

# Task 02: Scoped settings and profile management

Let users edit every Advisor setting globally or for current trusted project, while showing effective provenance and keeping profile lifecycle explicit.

## References

- `../design.md#explicit-editing-scope-and-visible-inheritance`
- `../design.md#backspace-removes-an-override`
- `docs/trusted-project-profiles-requirements.md#entry-points-and-scope-selection`
- `docs/trusted-project-profiles-requirements.md#creating-or-editing-a-project-profile`
- `docs/trusted-project-profiles-requirements.md#resetting-overrides`
- `src/commands/settings-commands.ts`
- `src/commands/settings-persistence.ts`
- `src/ui/settings-selector.ts`
- `src/ui/settings-items.ts`
- `src/ui/settings-mutations.ts`
- `test/settings-selector.test.ts`
- `test/settings-navigation.test.ts`

## Work

- [x] Add reusable Global / For this project scope selection before `/advisor-settings`, including canonical target path, user-level storage explanation, inherited parent-profile provenance, and disabled project scope with `/trust` guidance when ineligible.
- [x] Pass selected editing scope through settings loading, mutation, and persistence without flattening inherited values into target profile overrides.
- [x] Render project settings with scope, target directory, explicit-override versus inherited provenance, and parent-profile precedence warning where relevant.
- [x] Support Backspace on a project setting to delete only that explicit override; inherited rows remain unchanged and global/parent data is never modified.
- [x] Add project-only confirmed whole-profile removal. Confirmation must state resulting profile/global source and possible provider change; removal must not remove a parent entry.
- [x] Recheck trust immediately before every project-scoped save or removal, surface failure, and preserve current safety state.
- [x] Keep settings immediate-save and Escape semantics. Opening, selecting scope, or cancelling before change must create no profile.
- [-] Cover default, validation, persistence, reset, and navigation behavior for every setting in both scopes, including disclosure, Jev, Scout, outcome logging, arrays, and object settings.

## Verification

- [x] `/advisor-settings` explains destination before edits and leaves global settings available in untrusted projects. **Note:** Verified by `test/settings-scoped-profiles.test.ts` and reloaded Pi TUI.
- [x] First project save writes only changed keys under user-level `projectProfiles`; cancel paths write nothing. **Note:** Verified by sparse-save assertions in `test/settings-scoped-profiles.test.ts`.
- [x] Backspace restores Global/default inheritance and final reset retains an empty child profile until explicit confirmed removal. **Note:** Verified by selector and persistence assertions in `test/settings-scoped-profiles.test.ts`.
- [x] Whole-profile removal explains and exposes resulting parent/global provider only after confirmation. **Note:** Verified by `test/settings-scoped-profiles.test.ts` confirmation and target-only removal tests.
- [ ] (manual testing required) Each setting has automated default, validation, persistence, and UI-navigation coverage for project scope. **Note:** `test/settings-scoped-profiles.test.ts` validates and persists every setting row, including arrays, objects, disclosure, Jev, Scout, and outcome logging; per-control project-scope navigation still needs coverage.
- [ ] (manual testing required) Reloaded TUI verifies selector, inherited/override rows, reset, confirmation, cancel, trust-error, and save-error states against existing Advisor UI patterns. **Note:** Reloaded Pi TUI verified scope chooser, untrusted guidance, trusted project scope, and removal row; interactive reset, confirmation/cancel, trust-error, and save-error states remain.
