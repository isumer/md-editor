import type { MenuContribution } from "../../shared/ipc/menu";

export const CONTRIBUTION_INTERVAL_MS = 100;

export interface ContributionPump {
  push(contribution: MenuContribution): void;
  flush(): void;
}

export interface ContributionPumpOptions {
  apply(contribution: MenuContribution): void;
  intervalMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

// Leading application keeps start-up snappy; pushes inside the next 100 ms window
// collapse into one trailing application so the final state is never lost.
export function createContributionPump(
  options: ContributionPumpOptions,
): ContributionPump {
  const interval = options.intervalMs ?? CONTRIBUTION_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  let latest: MenuContribution | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastApplied = Number.NEGATIVE_INFINITY;

  function applyNow(contribution: MenuContribution): void {
    lastApplied = now();
    options.apply(contribution);
  }

  return {
    push(contribution) {
      latest = contribution;
      if (timer !== null) {
        return;
      }
      const remaining = interval - (now() - lastApplied);
      if (remaining <= 0) {
        latest = null;
        applyNow(contribution);
        return;
      }
      timer = setTimer(() => {
        timer = null;
        if (latest !== null) {
          const pending = latest;
          latest = null;
          applyNow(pending);
        }
      }, remaining);
    },
    flush() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      if (latest !== null) {
        const pending = latest;
        latest = null;
        applyNow(pending);
      }
    },
  };
}
