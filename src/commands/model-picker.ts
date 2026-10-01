import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { SearchableModelSelector } from "../ui/model-selector.ts";
import {
  effortChoices,
  getAvailableModelRefs,
  selectedEffort,
} from "./model-options.ts";

export interface AdvisorModelSelection {
  advisor: string;
  advisorEffort: string | undefined;
  executor: string;
  executorEffort: string | undefined;
}

export interface AdvisorModelPickerOptions {
  advisor: string | undefined;
  advisorEffort: string | undefined;
  executor: string | undefined;
  executorEffort: string | undefined;
  selectAdvisor: boolean;
  selectExecutor: boolean;
  scopeLabel?: string;
}

export const selectAdvisorModels = async (
  ctx: ExtensionContext,
  options: AdvisorModelPickerOptions
): Promise<AdvisorModelSelection | undefined> => {
  if (!ctx.hasUI) {
    return undefined;
  }
  const refs = getAvailableModelRefs(ctx);
  if (refs && refs.length === 0) {
    ctx.ui.notify(
      "No selectable models are available. Configure a provider with /login or models.json, then retry.",
      "error"
    );
    return undefined;
  }
  const allOptions = [
    ...new Set(
      refs ??
        [options.executor, options.advisor].filter((ref): ref is string =>
          Boolean(ref)
        )
    ),
  ];
  let { advisor, advisorEffort, executor, executorEffort } = options;

  if (options.selectExecutor) {
    const selectedExecutor = await ctx.ui.custom<string | undefined>(
      (tui, theme, keybindings, done) =>
        new SearchableModelSelector({
          allOptions,
          currentOption: executor || undefined,
          keybindings,
          onCancel: () => done(undefined),
          onSelect: done,
          theme,
          title: `Select Executor Model${options.scopeLabel ? ` · ${options.scopeLabel}` : ""}`,
          tui,
        })
    );
    if (!selectedExecutor) {
      return undefined;
    }
    const selectedExecutorEffort = await ctx.ui.select(
      `Select Executor Reasoning/Thinking Level${options.scopeLabel ? ` · ${options.scopeLabel}` : ""}`,
      effortChoices(executorEffort)
    );
    if (!selectedExecutorEffort) {
      return undefined;
    }
    executor = selectedExecutor;
    executorEffort = selectedEffort(selectedExecutorEffort);
  }

  if (options.selectAdvisor) {
    const selectedAdvisor = await ctx.ui.custom<string | undefined>(
      (tui, theme, keybindings, done) =>
        new SearchableModelSelector({
          allOptions,
          currentOption: advisor || undefined,
          keybindings,
          onCancel: () => done(undefined),
          onSelect: done,
          theme,
          title: `Select Advisor Model${options.scopeLabel ? ` · ${options.scopeLabel}` : ""}`,
          tui,
        })
    );
    if (!selectedAdvisor) {
      return undefined;
    }
    const selectedAdvisorEffort = await ctx.ui.select(
      `Select Advisor Reasoning/Thinking Level${options.scopeLabel ? ` · ${options.scopeLabel}` : ""}`,
      effortChoices(advisorEffort)
    );
    if (!selectedAdvisorEffort) {
      return undefined;
    }
    advisor = selectedAdvisor;
    advisorEffort = selectedEffort(selectedAdvisorEffort);
  }

  if (!(advisor && executor)) {
    return undefined;
  }
  return { advisor, advisorEffort, executor, executorEffort };
};
