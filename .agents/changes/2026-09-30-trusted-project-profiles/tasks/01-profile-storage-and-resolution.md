---
id: "01"
dependencies: []
---

# Task 01: Profile storage and resolution

Add safe user-owned, path-associated project profiles to global `advisor.json`. Profile resolution must produce one effective configuration without re-enabling repository-controlled configuration.

## References

- `../design.md#one-user-level-configuration-file`
- `../design.md#nearest-profile-then-global-settings-then-defaults`
- `../design.md#pi-project-trust-remains-mandatory`
- `../design.md#verification-contract`
- `docs/trusted-project-profiles-requirements.md#directory-matching-and-inheritance`
- `src/config/storage.ts`
- `src/config/schema.ts`
- `src/config/defaults.ts`
- `src/config/validation.ts`
- `test/config-storage.test.ts`
- `test/config-project.test.ts`

## Work

- [x] Add reserved `projectProfiles` section to user-level `advisor.json`, keyed by canonical absolute directories; each entry contains atomic `overrides` with only explicit setting keys.
- [x] Implement canonical path identity, ancestor-boundary matching, nearest-profile selection, and symlink resolution with safe absolute-path fallback when realpath is unavailable.
- [x] Resolve effective values as selected profile override, then global value, then built-in default; never merge multiple ancestor profiles or load repository `.pi/advisor.json`.
- [x] Preserve explicit `false`, `0`, `""`, `{}`, and `[]`; treat absent keys as inheritance and `null` or other invalid selected-profile values as profile errors. An explicit empty model remains unset and makes activation unavailable rather than inheriting a global provider.
- [x] Validate profile entries independently. Ignore and preserve malformed unrelated entries; report a selected malformed profile with its path and no fallback to parent/global models.
- [x] Recheck Pi effective trust during resolution. A matching untrusted profile must become unavailable without applying stale effective state or choosing another provider.
- [x] Make scoped writes merge against fresh disk data, preserving global settings, other profiles, unknown fields, and external concurrent edits. Retain an empty child entry after its final override is reset.
- [x] Update config cache identity/invalidation for profile path, canonical working directory, trust state, and external `advisor.json` rewrites.
- [x] Add storage, validation, inheritance, sibling-boundary, symlink, trust-revocation, cache-switch, selected-invalid, unrelated-invalid, empty-child, and concurrent-write coverage.

## Verification

- [x] Trusted descendant resolves only nearest matching profile; sibling prefixes and external worktrees do not match. **Note:** Verified by `test/config-project-profiles.test.ts` nearest boundary test.
- [x] Effective values inherit from globals/defaults without flattening or copying parent/global values into a profile. **Note:** Verified by sparse override and saved-profile assertions in `test/config-project-profiles.test.ts`.
- [x] Invalid, unavailable, or untrusted selected profiles never select a parent or global provider; unrelated bad entries leave other projects usable. **Note:** Verified by selected-invalid and trust-revocation tests in `test/config-project-profiles.test.ts`.
- [x] Repository `.pi/advisor.json` remains ignored under every trust state. **Note:** Verified by existing `test/config-project.test.ts` repository-config tests.
- [x] Scoped saves preserve unknown fields and unrelated profiles after external edits. **Note:** Verified by fresh-disk write assertions in `test/config-project-profiles.test.ts`.
- [x] Relevant config tests, `bun run typecheck`, `bun run lint`, and `bun run format:check` pass. **Note:** Verified locally; focused config suite and full test suite pass.
