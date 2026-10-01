import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { isRecord, isString } from "../content-utils.ts";
import type { RecordValue } from "../content-utils.ts";
import { applyConfig, applyProjectConfig, resetDefaults } from "./defaults.ts";
import {
  canonicalProjectDirectory,
  projectProfileAt,
  projectProfileEntry,
  projectProfileKeyAt,
  PROJECT_PROFILES_KEY,
  selectProjectProfile,
  validateProjectOverrides,
} from "./project-profiles.ts";
import type { ProjectOverrides } from "./project-profiles.ts";
import {
  CONFIG_SCHEMA,
  configuredModelRef,
  SAVED_CONFIG_KEYS,
} from "./schema.ts";
import type { ConfigKey, PersistedConfigKey } from "./schema.ts";
import {
  advisorEffortRef,
  advisorRef,
  executorEffortRef,
  executorRef,
  setAdvisorOutcomeLoggingRef,
  setAlwaysOnRef,
  setPersistedModelRefs,
} from "./state.ts";
import type { AdvisorConfig } from "./types.ts";
import { unknownConfigKeys, validateConfig } from "./validation.ts";

export const configPaths = (_ctx: ExtensionContext) => [
  join(getAgentDir(), "advisor.json"),
];

type SavedConfigKey = PersistedConfigKey;
type ConfigState = { [Key in SavedConfigKey]: AdvisorConfig[Key] };
type StoredConfig = AdvisorConfig & RecordValue;

export type EffectiveModelSource =
  | { kind: "default" }
  | { kind: "global" }
  | { kind: "project"; path: string };

export interface EffectiveConfigSnapshot {
  advisor: string;
  advisorEffort?: string;
  advisorSource: EffectiveModelSource;
  configPath: string | null;
  executor: string;
  executorEffort?: string;
  executorSource: EffectiveModelSource;
  profilePath?: string;
}

export const effectiveModelSourceDescription = (
  source: EffectiveModelSource
) => {
  if (source.kind === "project") {
    return `Source: selected project profile at ${source.path}.`;
  }
  if (source.kind === "global") {
    return "Source: global advisor.json.";
  }
  return "Source: built-in default.";
};
let effectiveConfigSnapshot: EffectiveConfigSnapshot = {
  advisor: "",
  advisorSource: { kind: "default" },
  configPath: null,
  executor: "",
  executorSource: { kind: "default" },
};

export const getEffectiveConfigSnapshot = () => effectiveConfigSnapshot;

const currentConfigState = (): ConfigState =>
  // SAFETY: SAVED_CONFIG_KEYS enumerates ConfigState keys from CONFIG_SCHEMA.
  Object.fromEntries(
    SAVED_CONFIG_KEYS.map((key) => [key, CONFIG_SCHEMA[key].current()])
  ) as ConfigState;

const sameConfigValue = <Value>(left: Value, right: Value) =>
  JSON.stringify(left) === JSON.stringify(right);

const RESERVED_ADVISOR_JSON_KEYS = new Set([
  "typesafe_api_key",
  PROJECT_PROFILES_KEY,
]);

export const readExistingConfig = (path: string): RecordValue => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const shouldPersistConfigKey = (
  key: SavedConfigKey,
  persistAdvisor: boolean,
  persistExecutor: boolean
) =>
  (key !== "advisor" || persistAdvisor) &&
  (key !== "executor" || persistExecutor);

const applyChangedConfigValues = (
  existing: RecordValue,
  current: ConfigState,
  changedKeys: readonly SavedConfigKey[],
  persistAdvisor: boolean,
  persistExecutor: boolean
): RecordValue => {
  const dropped = new Set<string>();
  const data: RecordValue = { ...existing };
  for (const key of changedKeys) {
    if (!shouldPersistConfigKey(key, persistAdvisor, persistExecutor)) {
      continue;
    }
    const value = current[key];
    const isEmptyModelRef = (key === "advisor" || key === "executor") && !value;
    if (value === undefined || isEmptyModelRef) {
      dropped.add(key);
    } else {
      data[key] = value;
    }
  }
  if (dropped.size === 0) {
    return data;
  }
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !dropped.has(key))
  );
};

let loadedConfigState: ConfigState | undefined;
let loadedConfigPath: string | undefined;

const readConfig = (path: string): StoredConfig => {
  const config: unknown = JSON.parse(readFileSync(path, "utf-8"));
  validateConfig(config, path);
  // SAFETY: validateConfig accepted config as AdvisorConfig and JSON object.
  return config as StoredConfig;
};

const configCache = new Map<
  string,
  { config: StoredConfig; identity: string }
>();
const warnedUnknownConfigIdentities = new Set<string>();

export const resetConfigCache = () => {
  configCache.clear();
  warnedUnknownConfigIdentities.clear();
};

const configIdentity = (path: string): string => {
  try {
    const stats = statSync(path, { bigint: true });
    return `${stats.mtimeNs}:${stats.ctimeNs}:${stats.size}:${stats.ino}:${stats.dev}`;
  } catch {
    return `unstattable:${process.hrtime.bigint()}`;
  }
};

const readConfigCached = (path: string): StoredConfig => {
  const identity = configIdentity(path);
  const cached = configCache.get(path);
  if (cached?.identity === identity) {
    return cached.config;
  }
  const config = readConfig(path);
  configCache.set(path, { config, identity });
  return config;
};

export const readGlobalConfig = (_ctx: ExtensionContext): StoredConfig => {
  const path = join(getAgentDir(), "advisor.json");
  const empty: StoredConfig = {};
  return existsSync(path) ? readConfigCached(path) : empty;
};

const loadGlobalConfig = (ctx: ExtensionContext, path: string) => {
  const config = existsSync(path) ? readConfigCached(path) : undefined;
  if (!config) {
    return;
  }
  const unknownKeys = unknownConfigKeys(config).filter(
    (key) => !RESERVED_ADVISOR_JSON_KEYS.has(key)
  );
  const warningIdentity = `${path}:${configIdentity(path)}`;
  if (
    unknownKeys.length > 0 &&
    ctx.hasUI &&
    !warnedUnknownConfigIdentities.has(warningIdentity)
  ) {
    ctx.ui.notify(
      `Advisor configuration at ${path} contains unrecognized key(s) ${unknownKeys.map((key) => JSON.stringify(key)).join(", ")}. They were preserved but ignored; check for typos or upgrade pi-advisor.`,
      "warning"
    );
    warnedUnknownConfigIdentities.add(warningIdentity);
  }
  return config;
};

const modelSource = (
  globalConfig: StoredConfig | undefined,
  selected: ReturnType<typeof selectProjectProfile>,
  key: "advisor" | "executor"
): EffectiveModelSource => {
  if (selected && key in selected.profile.overrides) {
    return { kind: "project", path: selected.path };
  }
  if (globalConfig && key in globalConfig) {
    return { kind: "global" };
  }
  return { kind: "default" };
};

export const loadConfig = (ctx: ExtensionContext) => {
  resetDefaults();
  effectiveConfigSnapshot = {
    advisor: "",
    advisorSource: { kind: "default" },
    configPath: null,
    executor: "",
    executorSource: { kind: "default" },
  };
  const path = join(getAgentDir(), "advisor.json");
  const globalConfig = loadGlobalConfig(ctx, path);
  const selected = selectProjectProfile(
    globalConfig?.[PROJECT_PROFILES_KEY],
    ctx.cwd
  );
  if (selected && !ctx.isProjectTrusted()) {
    throw new Error(
      `Project profile at ${selected.path} is unavailable because Pi does not trust ${canonicalProjectDirectory(ctx.cwd)}.`
    );
  }
  if (globalConfig) {
    applyConfig(globalConfig);
  }
  if (selected) {
    applyProjectConfig(selected.profile.overrides);
  }
  if (globalConfig?.alwaysOn !== true) {
    setAlwaysOnRef(false);
  }
  setPersistedModelRefs(
    configuredModelRef(
      selected?.profile.overrides.advisor ?? globalConfig?.advisor
    ),
    configuredModelRef(
      selected?.profile.overrides.executor ?? globalConfig?.executor
    )
  );
  setAdvisorOutcomeLoggingRef(
    selected?.profile.overrides.advisorOutcomeLogging ??
      globalConfig?.advisorOutcomeLogging === true
  );
  loadedConfigState = currentConfigState();
  loadedConfigPath = path;
  effectiveConfigSnapshot = {
    advisor: advisorRef,
    advisorEffort: advisorEffortRef,
    advisorSource: modelSource(globalConfig, selected, "advisor"),
    configPath: existsSync(path) ? path : null,
    executor: executorRef,
    executorEffort: executorEffortRef,
    executorSource: modelSource(globalConfig, selected, "executor"),
    profilePath: selected?.path,
  };
  return effectiveConfigSnapshot.configPath;
};

export interface SaveConfigOptions {
  persistAdvisor?: boolean;
  persistExecutor?: boolean;
}

export const saveConfig = (
  _ctx: ExtensionContext,
  options: SaveConfigOptions = {}
) => {
  const path = join(getAgentDir(), "advisor.json");
  const persistAdvisor = options.persistAdvisor ?? true;
  const persistExecutor = options.persistExecutor ?? true;
  const existing = readExistingConfig(path);
  const current = currentConfigState();
  const baseline = loadedConfigPath === path ? loadedConfigState : undefined;
  const changedKeys = baseline
    ? SAVED_CONFIG_KEYS.filter(
        (key) => !sameConfigValue(current[key], baseline[key])
      )
    : [...SAVED_CONFIG_KEYS];
  if (changedKeys.length === 0) {
    return path;
  }
  const data = applyChangedConfigValues(
    existing,
    current,
    changedKeys,
    persistAdvisor,
    persistExecutor
  );
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  resetConfigCache();
  const nextLoadedState = { ...current };
  if (!persistAdvisor) {
    nextLoadedState.advisor = baseline
      ? baseline.advisor
      : configuredModelRef(
          isString(existing.advisor) ? existing.advisor : undefined
        );
  }
  if (!persistExecutor) {
    nextLoadedState.executor = baseline
      ? baseline.executor
      : configuredModelRef(
          isString(existing.executor) ? existing.executor : undefined
        );
  }
  loadedConfigState = nextLoadedState;
  loadedConfigPath = path;
  return path;
};

export interface ProjectSettingsProfile {
  inheritedProfilePath?: string;
  overrideKeys: ConfigKey[];
  profileExists: boolean;
  overrides: AdvisorConfig;
  target: string;
}

const requireProjectTrust = (ctx: ExtensionContext) => {
  if (!ctx.isProjectTrusted()) {
    throw new Error("Project profiles require Pi Project Trust.");
  }
};

const freshProjectConfig = (ctx: ExtensionContext) => {
  const path = join(getAgentDir(), "advisor.json");
  const existing = readExistingConfig(path);
  const profiles = existing[PROJECT_PROFILES_KEY];
  const target = canonicalProjectDirectory(ctx.cwd);
  return { existing, path, profiles, target };
};

const writeConfig = (path: string, data: RecordValue) => {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  resetConfigCache();
};

const applyExplicitValues = (
  existing: AdvisorConfig,
  values: Partial<AdvisorConfig>
): ProjectOverrides =>
  Object.fromEntries(
    Object.entries({ ...existing, ...values }).filter(
      ([, value]) => value !== undefined
    )
  );

export const getProjectSettingsProfile = (
  ctx: ExtensionContext
): ProjectSettingsProfile => {
  const { profiles, target } = freshProjectConfig(ctx);
  const targetProfile = projectProfileAt(profiles, target);
  const selected = selectProjectProfile(profiles, ctx.cwd);
  return {
    inheritedProfilePath:
      selected?.path === target ? undefined : selected?.path,
    // SAFETY: targetProfile overrides passed project-profile validation, which allows only ConfigKey names.
    overrideKeys: Object.keys(targetProfile?.overrides ?? {}) as ConfigKey[],
    overrides: targetProfile?.overrides ?? {},
    profileExists: Boolean(targetProfile),
    target,
  };
};

export const updateGlobalConfig = (
  _ctx: ExtensionContext,
  values: Partial<AdvisorConfig>
) => {
  const path = join(getAgentDir(), "advisor.json");
  validateConfig(values, path);
  const existing = readExistingConfig(path);
  const data: RecordValue = {};
  for (const [key, value] of Object.entries(existing)) {
    if (!(key in values)) {
      data[key] = value;
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      data[key] = value;
    }
  }
  writeConfig(path, data);
  return path;
};

export const updateGlobalConfigValues = (
  _ctx: ExtensionContext,
  values: Partial<AdvisorConfig>
) => {
  const path = join(getAgentDir(), "advisor.json");
  validateConfig(values, path);
  const existing = readExistingConfig(path);
  const data = applyExplicitValues(existing, values);
  writeConfig(path, data);
  return path;
};

export const updateProjectConfigAt = (
  ctx: ExtensionContext,
  directory: string,
  update: (overrides: AdvisorConfig) => ProjectOverrides
) => {
  requireProjectTrust(ctx);
  const {
    existing,
    path,
    profiles: existingProfiles,
  } = freshProjectConfig(ctx);
  const target = canonicalProjectDirectory(directory);
  const profileKey = projectProfileKeyAt(existingProfiles, target);
  const profiles = Object.fromEntries(
    Object.entries(isRecord(existingProfiles) ? existingProfiles : {}).filter(
      ([key]) => key !== profileKey || profileKey === target
    )
  );
  const overrides = projectProfileAt(existingProfiles, target)?.overrides ?? {};
  profiles[target] = projectProfileEntry(
    validateProjectOverrides(update({ ...overrides }))
  );
  writeConfig(path, { ...existing, [PROJECT_PROFILES_KEY]: profiles });
  return path;
};

export const updateProjectConfig = (
  ctx: ExtensionContext,
  update: (overrides: AdvisorConfig) => ProjectOverrides
) => updateProjectConfigAt(ctx, ctx.cwd, update);

export const updateProjectConfigValues = (
  ctx: ExtensionContext,
  directory: string,
  values: Partial<AdvisorConfig>
) =>
  updateProjectConfigAt(ctx, directory, (overrides) =>
    applyExplicitValues(overrides, values)
  );

export const getEffectiveProjectProfile = (ctx: ExtensionContext) => {
  const { profiles } = freshProjectConfig(ctx);
  return selectProjectProfile(profiles, ctx.cwd);
};

export const saveProjectConfig = (
  ctx: ExtensionContext,
  overrides: ProjectOverrides
) => updateProjectConfig(ctx, () => overrides);

export const removeProjectConfig = (ctx: ExtensionContext) => {
  requireProjectTrust(ctx);
  const {
    existing,
    path,
    profiles: existingProfiles,
    target,
  } = freshProjectConfig(ctx);
  const profileKey = projectProfileKeyAt(existingProfiles, target);
  if (!isRecord(existingProfiles) || !profileKey) {
    return false;
  }
  const profiles = Object.fromEntries(
    Object.entries(existingProfiles).filter(([key]) => key !== profileKey)
  );
  writeFileSync(
    path,
    `${JSON.stringify({ ...existing, [PROJECT_PROFILES_KEY]: profiles }, null, 2)}\n`
  );
  resetConfigCache();
  return true;
};

export const saveGlobalOutcomeLogging = (enabled: boolean) => {
  const path = join(getAgentDir(), "advisor.json");
  const existing = readExistingConfig(path);
  writeFileSync(
    path,
    `${JSON.stringify({ ...existing, advisorOutcomeLogging: enabled }, null, 2)}\n`
  );
  resetConfigCache();
  return path;
};
