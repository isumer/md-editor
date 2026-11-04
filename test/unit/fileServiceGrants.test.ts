import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  fromId: vi.fn(() => null),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromId: electron.fromId },
  dialog: {
    showOpenDialog: electron.showOpenDialog,
    showSaveDialog: electron.showSaveDialog,
  },
}));

import { GrantTable } from "../../src/main/grants/grantTable";
import { FileService } from "../../src/main/services/file";

let temporaryDirectory: string;
let targetPath: string;

beforeEach(async () => {
  vi.clearAllMocks();
  electron.fromId.mockReturnValue(null);
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-grants-"));
  targetPath = path.join(temporaryDirectory, "protected.md");
  await fs.writeFile(targetPath, "original", "utf8");
});

afterEach(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

async function expectRejectedWithoutWrite(
  service: FileService,
  windowId: number,
  grant: string,
): Promise<void> {
  await expect(service.save(windowId, { grant, text: "attacker text" }))
    .rejects.toMatchObject({ code: "GRANT_INVALID" });
  await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original");
}

describe("file service grants", () => {
  it("AC-R5-12: handles canceled dialogs without an owning window", async () => {
    const service = new FileService(new GrantTable());
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    await expect(service.open(1)).resolves.toBeNull();
    await expect(service.saveAs(1, { grant: null, text: "text" }))
      .resolves.toBeNull();
  });

  it("AC-R5-10: opens and saves dialog paths without an owning window", async () => {
    const grants = new GrantTable();
    const service = new FileService(grants);
    const openedPath = path.join(temporaryDirectory, "opened.md");
    const savedPath = path.join(temporaryDirectory, "saved.md");
    await fs.writeFile(openedPath, "opened", "utf8");
    electron.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [openedPath],
    });
    electron.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: savedPath,
    });

    await expect(service.open(1)).resolves.toMatchObject({
      name: "opened.md",
      text: "opened",
    });
    await expect(service.saveAs(1, { grant: null, text: "saved" }))
      .resolves.toMatchObject({ name: "saved.md" });
    await expect(fs.readFile(savedPath, "utf8")).resolves.toBe("saved");
  });

  it("AC-SEC-09: rejects an other-window grant without writing", async () => {
    const grants = new GrantTable();
    const service = new FileService(grants);
    const grant = grants.issue(1, targetPath, "document");

    await expectRejectedWithoutWrite(service, 2, grant);
  });

  it("AC-SEC-09: rejects a revoked grant without writing", async () => {
    const grants = new GrantTable();
    const service = new FileService(grants);
    const grant = grants.issue(1, targetPath, "document");
    grants.revokeDocument(1, grant);

    await expectRejectedWithoutWrite(service, 1, grant);
  });

  it("AC-SEC-09: rejects a forged handle without writing", async () => {
    await expectRejectedWithoutWrite(new FileService(new GrantTable()), 1, "forged");
  });

  it("AC-SEC-09: rejects a raw path in place of a grant without writing", async () => {
    await expectRejectedWithoutWrite(
      new FileService(new GrantTable()),
      1,
      targetPath,
    );
  });
});
