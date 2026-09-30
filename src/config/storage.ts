import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { isRecord, isString } from "../content-utils.ts";
import type { RecordValue } from "../content-utils.ts";
import { applyConfig, applyProjectConfig, resetDefaults } from "./defaults.ts";
import {
  canonicalProjectDirectory,
  projectProfileEntry,
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
import type { PersistedConfigKey } from "./schema.ts";
import { setAdvisorOutcomeLoggingRef, setPersistedModelRefs } from "./state.ts";
import type { AdvisorConfig } from "./types.ts";
import { unknownConfigKeys, validateConfig } from "./validation.ts";

export const configPaths = (_ctx: ExtensionContext) => [
  join(getAgentDir(), "advisor.json"),
];

type SavedConfigKey = PersistedConfigKey;
type ConfigState = { [Key in SavedConfigKey]: AdvisorConfig[Key] };
type StoredConfig = AdvisorConfig & RecordValue;

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

export const loadConfig = (ctx: ExtensionContext) => {
  resetDefaults();
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
  return existsSync(path) ? path : null;
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

export const saveProjectConfig = (
  ctx: ExtensionContext,
  overrides: ProjectOverrides
) => {
  if (!ctx.isProjectTrusted()) {
    throw new Error("Project profiles require Pi Project Trust.");
  }
  const path = join(getAgentDir(), "advisor.json");
  const target = canonicalProjectDirectory(ctx.cwd);
  const existing = readExistingConfig(path);
  const profiles = isRecord(existing[PROJECT_PROFILES_KEY])
    ? { ...existing[PROJECT_PROFILES_KEY] }
    : {};
  profiles[target] = projectProfileEntry(validateProjectOverrides(overrides));
  writeFileSync(
    path,
    `${JSON.stringify({ ...existing, [PROJECT_PROFILES_KEY]: profiles }, null, 2)}\n`
  );
  resetConfigCache();
  return path;
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
