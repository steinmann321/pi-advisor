import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { applyConfig, resetDefaults } from "../config/defaults.ts";
import {
  getAdvisorSettings,
  getPersistedModelRefs,
  setAdvisorAutoLoopGateRef,
  setAdvisorBlockOnBlockedRef,
  setAdvisorCollapseResponsesRef,
  setAdvisorCompletionGateRef,
  setAdvisorCustomInvocationRef,
  setAdvisorDisableSameModelRef,
  setAdvisorEffortRef,
  setAdvisorFailureGateRef,
  setAdvisorFailureModeRef,
  setAdvisorGitContextMaxCharsRef,
  setAdvisorGitContextRef,
  setAdvisorHerdrIntegrationRef,
  setAdvisorJevDigestMaxCharsRef,
  setAdvisorJevFilterEnabledRef,
  setAdvisorJevFilterNoulMarginRef,
  setAdvisorJevFilterOverrideWindowRef,
  setAdvisorJevFilterSkipConfidenceRef,
  setAdvisorJevModelRef,
  setAdvisorJevPricePerMtokRef,
  setAdvisorJevTimeoutMsRef,
  setAdvisorJevTransportRef,
  setAdvisorJevTurnGateEveryTurnsRef,
  setAdvisorJevTurnGateNoulThresholdRef,
  setAdvisorLoopThresholdRef,
  setAdvisorMaxCallsPerSessionRef,
  setAdvisorModelWhitelistRef,
  setAdvisorOutcomeLoggingRef,
  setAdvisorPlanGateRef,
  setAdvisorRedactSecretsRef,
  setAdvisorScoutEnabledRef,
  setAdvisorScoutTimeoutMsRef,
  setAdvisorSessionSummaryRef,
  setAdvisorToolPoliciesRef,
  setAdvisorToolResultMaxBytesRef,
  setAdvisorToolResultMaxLinesRef,
  setAdvisorTrackedFileContentRef,
  setAdvisorUntrackedContentRef,
  setAlwaysOnRef,
  setContextMaxCharsRef,
  setShowUsageDetailsRef,
  setShowUsageFooterRef,
  setSimpleModeRef,
} from "../config/state.ts";
import {
  loadConfig,
  readGlobalConfig,
  removeProjectConfig,
  saveConfig,
  updateGlobalConfig,
  updateProjectConfig,
} from "../config/storage.ts";
import {
  DEFAULT_JEV_DIGEST_MAX_CHARS,
  DEFAULT_JEV_FILTER_NOUL_MARGIN,
  DEFAULT_JEV_FILTER_OVERRIDE_WINDOW,
  DEFAULT_JEV_FILTER_SKIP_CONFIDENCE,
  DEFAULT_JEV_MODEL,
  DEFAULT_JEV_PRICE_PER_MTOK,
  DEFAULT_JEV_TIMEOUT_MS,
  DEFAULT_JEV_TRANSPORT,
  DEFAULT_JEV_TURN_GATE_EVERY_TURNS,
  DEFAULT_JEV_TURN_GATE_NOUL_THRESHOLD,
  DEFAULT_SCOUT_TIMEOUT_MS,
} from "../config/types.ts";
import { settingConfigKey, settingConfigValue } from "../ui/settings-scope.ts";
import type { SettingsEditScope } from "../ui/settings-scope.ts";
import type { AdvisorSettings } from "../ui/types.ts";

const applySessionSettings = (settings: AdvisorSettings) => {
  setAdvisorEffortRef(
    settings.effort === "Default (Model Default)" ? undefined : settings.effort
  );
  setContextMaxCharsRef(settings.contextMaxChars);
  setAdvisorPlanGateRef(settings.planGate);
  setAdvisorFailureGateRef(settings.failureGate);
  setAdvisorCompletionGateRef(settings.completionGate);
  setAdvisorDisableSameModelRef(settings.disableSameModel ?? true);
  setAdvisorCollapseResponsesRef(settings.collapseResponses);
  setAdvisorCustomInvocationRef(settings.customRule);
  setAdvisorBlockOnBlockedRef(settings.blockOnBlocked ?? true);
  setAdvisorAutoLoopGateRef(settings.autoLoopGate ?? true);
  setAdvisorLoopThresholdRef(settings.loopThreshold ?? 3);
  setAdvisorMaxCallsPerSessionRef(settings.maxCallsPerSession);
  setAdvisorModelWhitelistRef(settings.modelWhitelist ?? []);
  setAdvisorSessionSummaryRef(settings.sessionSummary ?? false);
  setAdvisorScoutEnabledRef(settings.scoutEnabled ?? false);
  setAdvisorScoutTimeoutMsRef(
    settings.scoutTimeoutMs ?? DEFAULT_SCOUT_TIMEOUT_MS
  );
  setShowUsageDetailsRef(settings.showUsageDetails ?? true);
  setShowUsageFooterRef(settings.showUsageFooter ?? false);
  setSimpleModeRef(settings.simpleMode ?? false);
  setAlwaysOnRef(settings.alwaysOn ?? false);
  setAdvisorFailureModeRef(settings.failureMode ?? "block-session");
  setAdvisorHerdrIntegrationRef(settings.herdrIntegration ?? true);
};

const applyJevSettings = (settings: AdvisorSettings) => {
  setAdvisorJevFilterEnabledRef(settings.jevFilterEnabled ?? false);
  setAdvisorJevFilterSkipConfidenceRef(
    settings.jevFilterSkipConfidence ?? DEFAULT_JEV_FILTER_SKIP_CONFIDENCE
  );
  setAdvisorJevFilterNoulMarginRef(
    settings.jevFilterNoulMargin ?? DEFAULT_JEV_FILTER_NOUL_MARGIN
  );
  setAdvisorJevFilterOverrideWindowRef(
    settings.jevFilterOverrideWindow ?? DEFAULT_JEV_FILTER_OVERRIDE_WINDOW
  );
  setAdvisorJevModelRef(settings.jevModel ?? DEFAULT_JEV_MODEL);
  setAdvisorJevTimeoutMsRef(settings.jevTimeoutMs ?? DEFAULT_JEV_TIMEOUT_MS);
  setAdvisorJevDigestMaxCharsRef(
    settings.jevDigestMaxChars ?? DEFAULT_JEV_DIGEST_MAX_CHARS
  );
  setAdvisorJevPricePerMtokRef(
    settings.jevPricePerMtok ?? DEFAULT_JEV_PRICE_PER_MTOK
  );
  setAdvisorJevTransportRef(settings.jevTransport ?? DEFAULT_JEV_TRANSPORT);
  setAdvisorJevTurnGateEveryTurnsRef(
    settings.jevTurnGateEveryTurns ?? DEFAULT_JEV_TURN_GATE_EVERY_TURNS
  );
  setAdvisorJevTurnGateNoulThresholdRef(
    settings.jevTurnGateNoulThreshold ?? DEFAULT_JEV_TURN_GATE_NOUL_THRESHOLD
  );
};

const applyDisclosureSettings = (settings: AdvisorSettings) => {
  setAdvisorToolResultMaxLinesRef(settings.toolResultMaxLines ?? 2000);
  setAdvisorToolResultMaxBytesRef(settings.toolResultMaxBytes ?? 50 * 1024);
  setAdvisorRedactSecretsRef(settings.redactSecrets ?? false);
  setAdvisorGitContextRef(settings.gitContext ?? "summary");
  setAdvisorGitContextMaxCharsRef(settings.gitContextMaxChars ?? 20_000);
  setAdvisorToolPoliciesRef(settings.toolPolicies ?? {});
  setAdvisorTrackedFileContentRef(settings.trackedFileContent ?? false);
  setAdvisorUntrackedContentRef(settings.untrackedContent ?? false);
  setAdvisorOutcomeLoggingRef(settings.outcomeLogging ?? false);
};

const applyAdvisorSettings = (settings: AdvisorSettings) => {
  applySessionSettings(settings);
  applyJevSettings(settings);
  applyDisclosureSettings(settings);
};

export const getGlobalAdvisorSettings = (ctx: ExtensionContext) => {
  const global = readGlobalConfig(ctx);
  resetDefaults();
  applyConfig(global);
  const settings = getAdvisorSettings();
  try {
    loadConfig(ctx);
  } catch {
    resetDefaults();
    applyConfig(global);
  }
  return settings;
};

export const saveAdvisorSettings = (
  ctx: ExtensionContext,
  settings: AdvisorSettings
) => {
  applyAdvisorSettings(settings);
  const persisted = getPersistedModelRefs();
  saveConfig(ctx, {
    persistAdvisor: Boolean(persisted.advisor),
    persistExecutor: Boolean(persisted.executor),
  });
  updateGlobalConfig(ctx, {
    advisorOutcomeLogging: settings.outcomeLogging ?? false,
  });
};

const reloadSettings = (ctx: ExtensionContext) => {
  loadConfig(ctx);
  return getAdvisorSettings();
};

export const saveScopedAdvisorSetting = (
  ctx: ExtensionContext,
  scope: SettingsEditScope,
  id: string,
  settings: AdvisorSettings
) => {
  const value = settingConfigValue(id, settings);
  if (Object.keys(value).length === 0) {
    return getAdvisorSettings();
  }
  if (scope.kind === "global") {
    updateGlobalConfig(ctx, value);
    return getGlobalAdvisorSettings(ctx);
  }
  updateProjectConfig(ctx, (overrides) => ({ ...overrides, ...value }));
  return reloadSettings(ctx);
};

export const resetProjectAdvisorSetting = (
  ctx: ExtensionContext,
  id: string
) => {
  const key = settingConfigKey(id);
  if (!key) {
    return;
  }
  updateProjectConfig(ctx, (overrides) =>
    Object.fromEntries(
      Object.entries(overrides).filter(([override]) => override !== key)
    )
  );
  return reloadSettings(ctx);
};

export const removeProjectAdvisorSettings = (ctx: ExtensionContext) => {
  if (!removeProjectConfig(ctx)) {
    return;
  }
  return reloadSettings(ctx);
};
