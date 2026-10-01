import type { ConfigKey } from "../config/schema.ts";
import type { AdvisorConfig } from "../config/types.ts";
import type { AdvisorSettings } from "./types.ts";

export type SettingsEditScope =
  | { kind: "global" }
  | {
      kind: "project";
      inheritedProfilePath?: string;
      overrideKeys: readonly ConfigKey[];
      profileExists: boolean;
      target: string;
    };

const SETTING_CONFIG_KEYS = {
  alwaysOn: "alwaysOn",
  autoLoopGate: "advisorAutoLoopGate",
  blockOnBlocked: "advisorBlockOnBlocked",
  collapseResponses: "advisorCollapseResponses",
  completionGate: "advisorCompletionGate",
  context: "contextMaxChars",
  customRule: "advisorCustomInvocation",
  disableSameModel: "advisorDisableSameModel",
  effort: "advisorEffort",
  failureGate: "advisorFailureGate",
  failureMode: "gateFailureMode",
  gitContext: "advisorGitContext",
  gitContextMaxChars: "advisorGitContextMaxChars",
  herdrIntegration: "advisorHerdrIntegration",
  jevDigestMaxChars: "advisorJevDigestMaxChars",
  jevFilter: "advisorJevFilterEnabled",
  jevFilterNoulMargin: "advisorJevFilterNoulMargin",
  jevFilterOverrideWindow: "advisorJevFilterOverrideWindow",
  jevFilterSkipConfidence: "advisorJevFilterSkipConfidence",
  jevModel: "advisorJevModel",
  jevPricePerMtok: "advisorJevPricePerMtok",
  jevTimeoutMs: "advisorJevTimeoutMs",
  jevTransport: "advisorJevTransport",
  jevTurnGateEveryTurns: "advisorJevTurnGateEveryTurns",
  jevTurnGateNoulThreshold: "advisorJevTurnGateNoulThreshold",
  loopThreshold: "advisorLoopThreshold",
  maxCallsPerSession: "advisorMaxCallsPerSession",
  modelWhitelist: "advisorModelWhitelist",
  outcomeLogging: "advisorOutcomeLogging",
  planGate: "advisorPlanGate",
  redactSecrets: "advisorRedactSecrets",
  scoutEnabled: "advisorScoutEnabled",
  scoutTimeoutMs: "advisorScoutTimeoutMs",
  sessionSummary: "advisorSessionSummary",
  showUsageDetails: "showUsageDetails",
  showUsageFooter: "showUsageFooter",
  simpleMode: "simpleMode",
  toolPolicies: "advisorToolPolicies",
  toolResultMaxBytes: "advisorToolResultMaxBytes",
  toolResultMaxLines: "advisorToolResultMaxLines",
  trackedFileContent: "advisorTrackedFileContent",
  untrackedContent: "advisorUntrackedContent",
} as const satisfies Record<string, ConfigKey>;

const isSettingId = (id: string): id is keyof typeof SETTING_CONFIG_KEYS =>
  Object.hasOwn(SETTING_CONFIG_KEYS, id);

export const settingConfigKey = (id: string): ConfigKey | undefined =>
  isSettingId(id) ? SETTING_CONFIG_KEYS[id] : undefined;

export const settingConfigValue = (
  id: string,
  settings: AdvisorSettings
): Partial<AdvisorConfig> => {
  const key = settingConfigKey(id);
  if (!key) {
    return {};
  }
  const values = {
    advisor: undefined,
    advisorAutoLoopGate: settings.autoLoopGate,
    advisorBlockOnBlocked: settings.blockOnBlocked,
    advisorCollapseResponses: settings.collapseResponses,
    advisorCompletionGate: settings.completionGate,
    advisorCustomInvocation: settings.customRule ?? "",
    advisorDisableSameModel: settings.disableSameModel,
    advisorEffort: settings.effort ?? "",
    advisorFailureGate: settings.failureGate,
    advisorGitContext: settings.gitContext,
    advisorGitContextMaxChars: settings.gitContextMaxChars,
    advisorHerdrIntegration: settings.herdrIntegration,
    advisorJevDigestMaxChars: settings.jevDigestMaxChars,
    advisorJevFilterEnabled: settings.jevFilterEnabled,
    advisorJevFilterNoulMargin: settings.jevFilterNoulMargin,
    advisorJevFilterOverrideWindow: settings.jevFilterOverrideWindow,
    advisorJevFilterSkipConfidence: settings.jevFilterSkipConfidence,
    advisorJevModel: settings.jevModel ?? "",
    advisorJevPricePerMtok: settings.jevPricePerMtok,
    advisorJevTimeoutMs: settings.jevTimeoutMs,
    advisorJevTransport: settings.jevTransport,
    advisorJevTurnGateEveryTurns: settings.jevTurnGateEveryTurns,
    advisorJevTurnGateNoulThreshold: settings.jevTurnGateNoulThreshold,
    advisorLoopThreshold: settings.loopThreshold,
    advisorMaxCallsPerSession: settings.maxCallsPerSession,
    advisorModelWhitelist: settings.modelWhitelist,
    advisorOutcomeLogging: settings.outcomeLogging,
    advisorPlanGate: settings.planGate,
    advisorRedactSecrets: settings.redactSecrets,
    advisorScoutEnabled: settings.scoutEnabled,
    advisorScoutTimeoutMs: settings.scoutTimeoutMs,
    advisorSessionSummary: settings.sessionSummary,
    advisorToolPolicies: settings.toolPolicies,
    advisorToolResultMaxBytes: settings.toolResultMaxBytes,
    advisorToolResultMaxLines: settings.toolResultMaxLines,
    advisorTrackedFileContent: settings.trackedFileContent,
    advisorUntrackedContent: settings.untrackedContent,
    alwaysOn: settings.alwaysOn,
    contextMaxChars: settings.contextMaxChars,
    executor: undefined,
    executorEffort: undefined,
    gateFailureMode: settings.failureMode,
    showUsageDetails: settings.showUsageDetails,
    showUsageFooter: settings.showUsageFooter,
    simpleMode: settings.simpleMode,
  } satisfies { [Key in ConfigKey]: AdvisorConfig[Key] };
  const value: Partial<AdvisorConfig> = {};
  Object.assign(value, { [key]: values[key] });
  return value;
};
