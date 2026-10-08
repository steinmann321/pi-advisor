---
id: "04"
dependencies:
  - "01"
  - "02"
  - "03"
---

# Task 04: Runtime safety, documentation, and verification

Deliver one consistent effective profile across every Advisor path, with visible isolated failures and complete user-facing documentation.

## References

- `../design.md#consistent-invocation-and-isolated-failures`
- `../design.md#verification-contract`
- `docs/trusted-project-profiles-requirements.md#trust-loss-invalid-configuration-and-provider-failures`
- `src/tools/consultation.ts`
- `src/tools/register-ask-advisor.ts`
- `src/tools/register-lifecycle.ts`
- `src/commands/manual-command.ts`
- `src/commands/manual-consultation.ts`
- `src/scout.ts`
- `test/config-errors.test.ts`
- `test/consultation.test.ts`
- `README.md`
- `docs/configuration.md`
- `docs/privacy.md`
- `CHANGELOG.md`

## Work

- [x] Ensure manual consultations, `ask_advisor`, automatic gates, persistent activation, and Scout each resolve same effective profile and use effective Executor/Advisor values. **Note:** Consultation captures effective model snapshot; Scout receives it unchanged. Manual command rechecks config after interactive input.
- [x] Surface selected-profile trust, validation, model, and authentication failures with profile/model provenance but no credentials. Reuse existing rendered Advisor call, streaming, response, error, and blocked-state surfaces. **Note:** Model resolution adds source provenance only; existing tool/manual error renderers remain unchanged.
- [x] Preserve fail-open handling for ordinary tool calls when Advisor configuration is unavailable; do not convert configuration/profile errors into broader session blocks or raw tool-block output. **Note:** Verified by `test/config-errors.test.ts`.
- [x] Verify stale effective state is cleared after trust loss, context switch, or selected-profile failure; unrelated invalid profiles remain isolated. **Note:** Verified by `test/profile-runtime-safety.test.ts` and `test/config-project-profiles.test.ts`.
- [x] Update README, configuration, and privacy documentation for user-level path profiles, both scopes, trust prerequisite, reset/removal, all-field project eligibility, Scout/outcome-logging scope, and repository-local configuration prohibition.
- [x] Add delivered behavior to `CHANGELOG.md` only after implementation is complete.
- [ ] (manual testing required) Perform reloaded-TUI verification against existing Advisor rendering for call, streaming, response, error, unavailable consultation, tool block, and session block states. **Note:** Reloaded `dist/index.js` TUI smoke verified inline scope headers and Tab transitions for model and settings flows; Advisor call/stream/response/error/block states remain.

## Verification

- [x] Every invocation path uses same project models/settings and Scout uses effective Executor. **Note:** `test/profile-runtime-safety.test.ts` records effective Scout, consultation, and gate model resolution.
- [x] Trust loss, selected-profile corruption, unavailable models, and missing auth produce visible unavailable/error states without provider/profile fallback. **Note:** Profile trust/corruption coverage in `test/config-project-profiles.test.ts`; authentication provenance in `test/profile-runtime-safety.test.ts`; unavailable-model coverage in `test/activation.test.ts`.
- [x] Unrelated malformed profile does not affect Advisor behavior elsewhere; repository `.pi/advisor.json` is never applied. **Note:** Verified by `test/profile-runtime-safety.test.ts` and `test/config-project.test.ts`.
- [x] Normal config error behavior remains fail-open for unrelated tools; existing tool-only and session-block distinctions remain intact. **Note:** Verified by `test/config-errors.test.ts` and existing gate-policy coverage.
- [x] Documentation describes delivered user behavior without claiming repository-owned profiles or additional credential stores. **Note:** Verified by README and documentation review.
- [x] `bun test`, `bun run typecheck`, `bun run lint`, `bun run format:check`, and diff whitespace check pass. **Note:** `git` rejects requested trailing `--no-stat`; equivalent `git -c diff.stat=false diff --no-ext-diff --check` passed.
