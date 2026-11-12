import { describe, expect, it, vi } from "vitest";

import { scheduleStartupUpdateCheck } from "../../src/main/update/updateCheck";

describe("startup update check scheduling", () => {
  it("AC-R9-08: leaves the interactive startup path before checking", async () => {
    let scheduled: (() => void) | undefined;
    const unref = vi.fn();
    const setTimer = vi.fn((callback: () => void, _delay: number) => {
      scheduled = callback;
      return { unref };
    });
    const check = vi.fn(async () => undefined);

    scheduleStartupUpdateCheck(check, setTimer);

    expect(check).not.toHaveBeenCalled();
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(unref).toHaveBeenCalledOnce();
    scheduled?.();
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
  });
});
