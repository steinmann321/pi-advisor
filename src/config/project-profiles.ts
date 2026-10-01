import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { isRecord } from "../content-utils.ts";
import type { JsonValue, RecordValue } from "../content-utils.ts";
import { configKeys } from "./schema.ts";
import type { AdvisorConfig } from "./types.ts";
import { validateConfig } from "./validation.ts";

export const PROJECT_PROFILES_KEY = "projectProfiles";

export interface ProjectProfile {
  overrides: AdvisorConfig;
}

export interface SelectedProjectProfile {
  path: string;
  profile: ProjectProfile;
}

export type ProjectOverrides = {
  [Key in keyof AdvisorConfig]?: JsonValue;
};

const CONFIG_KEYS = new Set<string>(configKeys);

export const canonicalProjectDirectory = (path: string) => {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
};

const isAncestorPath = (ancestor: string, descendant: string) =>
  ancestor === descendant || descendant.startsWith(`${ancestor}${sep}`);

const invalidProfile = (path: string, detail: string): never => {
  throw new TypeError(`Invalid project profile at ${path}: ${detail}.`);
};

const validateOverrides = (value: JsonValue, path: string): AdvisorConfig => {
  if (!isRecord(value)) {
    return invalidProfile(path, "overrides must be a JSON object");
  }
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) {
      return invalidProfile(
        path,
        `unrecognized override key ${JSON.stringify(key)}`
      );
    }
  }
  try {
    validateConfig(value, path);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return invalidProfile(path, detail);
  }
  // SAFETY: validateConfig verified every present key against AdvisorConfig schema.
  return value as AdvisorConfig;
};

const validateProfile = (value: JsonValue, path: string): ProjectProfile => {
  if (!isRecord(value)) {
    return invalidProfile(path, "expected an object with overrides");
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "overrides") {
    return invalidProfile(path, "expected only an overrides object");
  }
  return { overrides: validateOverrides(value.overrides, path) };
};

export const projectProfileKeyAt = (
  profiles: JsonValue | undefined,
  directory: string
): string | undefined => {
  if (profiles === undefined) {
    return;
  }
  if (!isRecord(profiles)) {
    throw new TypeError("Invalid projectProfiles: expected a JSON object.");
  }
  const path = canonicalProjectDirectory(directory);
  const keys = Object.keys(profiles).filter(
    (key) => isAbsolute(key) && canonicalProjectDirectory(key) === path
  );
  if (keys.length > 1) {
    throw new TypeError(
      `Invalid project profile at ${path}: duplicate canonical directory.`
    );
  }
  return keys[0];
};

export const projectProfileAt = (
  profiles: JsonValue | undefined,
  directory: string
): ProjectProfile | undefined => {
  const key = projectProfileKeyAt(profiles, directory);
  if (!key || !isRecord(profiles)) {
    return;
  }
  return validateProfile(profiles[key], canonicalProjectDirectory(directory));
};

export const selectProjectProfile = (
  profiles: JsonValue | undefined,
  cwd: string
): SelectedProjectProfile | undefined => {
  if (profiles === undefined) {
    return;
  }
  if (!isRecord(profiles)) {
    throw new TypeError("Invalid projectProfiles: expected a JSON object.");
  }
  const directory = canonicalProjectDirectory(cwd);
  const candidates = Object.entries(profiles)
    .filter(([path]) => isAbsolute(path))
    .map(([path, value]) => ({
      path: canonicalProjectDirectory(path),
      value,
    }))
    .filter(({ path }) => isAncestorPath(path, directory))
    .toSorted((left, right) => right.path.length - left.path.length);
  const [selected, next] = candidates;
  if (!selected) {
    return;
  }
  if (next?.path === selected.path) {
    throw new TypeError(
      `Invalid project profile at ${selected.path}: duplicate canonical directory.`
    );
  }
  return {
    path: selected.path,
    profile: validateProfile(selected.value, selected.path),
  };
};

export const validateProjectOverrides = (
  overrides: ProjectOverrides
): AdvisorConfig =>
  validateOverrides({ ...overrides }, "project profile overrides");

export const projectProfileEntry = (overrides: AdvisorConfig): RecordValue => ({
  overrides: { ...overrides },
});
