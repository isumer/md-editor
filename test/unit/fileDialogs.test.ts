import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  fromId: vi.fn(),
  showOpenDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromId: electron.fromId },
  dialog: { showOpenDialog: electron.showOpenDialog, showSaveDialog: vi.fn() },
}));

import { FileDialogs } from "../../src/main/services/fileDialogs";

beforeEach(() => {
  vi.clearAllMocks();
  electron.fromId.mockReturnValue(null);
});

describe("folder dialog", () => {
  it("AC-R11-01: returns the chosen folder for an owned window", async () => {
    const window = { id: 3 };
    electron.fromId.mockReturnValue(window);
    electron.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/documents/notes"],
    });

    await expect(new FileDialogs().chooseFolderPath(3))
      .resolves.toBe("/documents/notes");

    expect(electron.showOpenDialog).toHaveBeenCalledWith(window, {
      properties: ["openDirectory"],
    });
  });

  it("AC-R11-01: uses no owner window when the window is gone", async () => {
    electron.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/documents/notes"],
    });

    await expect(new FileDialogs().chooseFolderPath(4))
      .resolves.toBe("/documents/notes");

    expect(electron.showOpenDialog).toHaveBeenCalledWith({
      properties: ["openDirectory"],
    });
  });

  it("AC-R11-01: a cancel or an empty selection returns no path", async () => {
    electron.showOpenDialog
      .mockResolvedValueOnce({ canceled: true, filePaths: ["/documents/notes"] })
      .mockResolvedValueOnce({ canceled: false, filePaths: [] });

    await expect(new FileDialogs().chooseFolderPath(5)).resolves.toBeNull();
    await expect(new FileDialogs().chooseFolderPath(5)).resolves.toBeNull();
  });
});
