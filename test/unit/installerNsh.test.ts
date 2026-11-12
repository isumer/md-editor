import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateInstallerNsh } from "../../scripts/gen-installer-nsh.mjs";

describe("Windows shell installer", () => {
  it("AC-R9-04: generated installer registry operations match the committed golden file", async () => {
    const repositoryRoot = path.resolve(__dirname, "../..");
    const [tableText, packageText, golden] = await Promise.all([
      fs.readFile(path.join(repositoryRoot, "build/shell-integration.json"), "utf8"),
      fs.readFile(path.join(repositoryRoot, "package.json"), "utf8"),
      fs.readFile(path.join(repositoryRoot, "build/installer.nsh"), "utf8"),
    ]);

    expect(generateInstallerNsh(JSON.parse(tableText), JSON.parse(packageText))).toBe(golden);
  });

  it("AC-R9-04: installs exact per-user file and folder commands and removes their keys", () => {
    const generated = generateInstallerNsh({
      entries: [
        {
          key: "Software\\Classes\\*\\shell\\{productKey}Edit",
          label: "Edit with {productName}",
          argument: "%1",
        },
        {
          key: "Software\\Classes\\Directory\\shell\\{productKey}Open",
          label: "Open folder in {productName}",
          argument: "%1",
        },
        {
          key: "Software\\Classes\\Directory\\Background\\shell\\{productKey}Open",
          label: "Open folder in {productName}",
          argument: "%V",
        },
      ],
    }, { productName: "SolidMD" });

    expect(generated).toContain(
      'WriteRegStr HKCU "Software\\Classes\\*\\shell\\SolidMDEdit" "" "Edit with SolidMD"',
    );
    expect(generated).toContain(
      'WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\SolidMDOpen\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"\'',
    );
    expect(generated).toContain(
      'WriteRegStr HKCU "Software\\Classes\\Directory\\Background\\shell\\SolidMDOpen\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%V"\'',
    );
    expect(generated.match(/DeleteRegKey HKCU/g)).toHaveLength(3);
    expect(generated).not.toContain("HKLM");
  });
});
