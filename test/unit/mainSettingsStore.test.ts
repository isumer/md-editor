import { describe, expect, it, vi, beforeEach } from "vitest";
import { SettingsStore } from "../../src/main/app/settings";
import { DEFAULT_SETTINGS } from "../../src/shared/settings/settings";

function createMockControl() {
  return {
    readSettings: vi.fn(),
    writeSettings: vi.fn(),
  };
}

function createFullSettings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): typeof DEFAULT_SETTINGS {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("SettingsStore (main)", () => {
  it("reads settings from control", async () => {
    const control = createMockControl();
    control.readSettings.mockResolvedValue({ ok: true, value: { theme: "dark", fontSize: 16 } });

    const store = new SettingsStore("/tmp/settings.json", control);
    const settings = await store.read();

    expect(settings).toEqual({ ...DEFAULT_SETTINGS, theme: "dark", fontSize: 16 });
    expect(control.readSettings).toHaveBeenCalledWith("/tmp/settings.json");
  });

  it("returns defaults when read fails", async () => {
    const control = createMockControl();
    control.readSettings.mockResolvedValue({ ok: false, error: { code: "ERROR", messageKey: "error", params: {}, retryable: false } });

    const store = new SettingsStore("/tmp/settings.json", control);
    const settings = await store.read();

    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("writes settings through control", async () => {
    const control = createMockControl();
    control.writeSettings.mockResolvedValue({ ok: true, value: {} });

    const store = new SettingsStore("/tmp/settings.json", control);
    await store.write(createFullSettings({ theme: "dark", fontSize: 16 }));

    expect(control.writeSettings).toHaveBeenCalledWith("/tmp/settings.json", createFullSettings({ theme: "dark", fontSize: 16 }));
  });

  it("throws when write fails", async () => {
    const control = createMockControl();
    control.writeSettings.mockResolvedValue({ ok: false, error: { code: "ERROR", messageKey: "error", params: {}, retryable: false } });

    const store = new SettingsStore("/tmp/settings.json", control);
    await expect(store.write(createFullSettings({ theme: "dark", fontSize: 16 }))).rejects.toThrow();
  });
});