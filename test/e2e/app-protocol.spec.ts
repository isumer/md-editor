import { expect, test } from "@playwright/test";

import { launchEditor } from "./helpers";

test("the renderer loads from the app bundle origin", {
  tag: "@AC-SEC-14",
  annotation: { type: "AC-SEC-14" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await expect(page.getByTestId("editor")).toBeVisible();

    expect(await page.evaluate(() => location.origin)).toBe("app://bundle");
    const response = await page.evaluate(async () => {
      const result = await fetch("app://bundle/index.html");
      return { ok: result.ok, body: await result.text() };
    });
    expect(response.ok).toBe(true);
    expect(response.body).toContain("<main id=\"workspace\">");
  } finally {
    await application.close();
  }
});

test("the app protocol returns no content outside the bundle host and path", {
  tag: "@AC-SEC-14",
  annotation: { type: "AC-SEC-14" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await expect(page.getByTestId("editor")).toBeVisible();

    const pathResponse = await page.evaluate(async () => {
      const response = await fetch("app://bundle/../package.json");
      return { ok: response.ok, status: response.status, body: await response.text() };
    });
    const hostResponse = await application.evaluate(async ({ net }) => {
      const response = await net.fetch("app://other/index.html");
      return { ok: response.ok, status: response.status, body: await response.text() };
    });
    expect(pathResponse).toEqual({ ok: false, status: 404, body: "" });
    expect(hostResponse).toEqual({ ok: false, status: 404, body: "" });
  } finally {
    await application.close();
  }
});

test("the content security policy reports and blocks inline script and eval", {
  tag: "@AC-SEC-15",
  annotation: { type: "AC-SEC-15" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await expect(page.getByTestId("editor")).toBeVisible();

    await page.evaluate(() => {
      const probe = globalThis as typeof globalThis & {
        cspProbe?: {
          blockedUris: string[];
          evalResult: number | null;
          inlineRan: boolean;
        };
      };
      probe.cspProbe = { blockedUris: [], evalResult: null, inlineRan: false };
      document.addEventListener("securitypolicyviolation", (event) => {
        probe.cspProbe?.blockedUris.push(event.blockedURI);
      });
      const script = document.createElement("script");
      script.textContent = "globalThis.cspProbe.inlineRan = true";
      document.body.append(script);
    });
    // Playwright evaluation permits unsafe eval by default, so use Chromium's
    // normal page setting to exercise the document CSP.
    const devtools = await page.context().newCDPSession(page);
    const evaluation = await devtools.send("Runtime.evaluate", {
      expression: "globalThis.cspProbe.evalResult = eval(\"1\")",
      allowUnsafeEvalBlockedByCSP: false,
    });
    await devtools.detach();

    await expect.poll(() => page.evaluate(() => {
      const probe = globalThis as typeof globalThis & {
        cspProbe?: { blockedUris: string[] };
      };
      return probe.cspProbe?.blockedUris ?? [];
    })).toEqual(expect.arrayContaining(["inline", "eval"]));
    expect(await page.evaluate(() => {
      const probe = globalThis as typeof globalThis & {
        cspProbe?: { evalResult: number | null; inlineRan: boolean };
      };
      return probe.cspProbe;
    })).toMatchObject({ evalResult: null, inlineRan: false });
    expect(evaluation.exceptionDetails).toBeDefined();
  } finally {
    await application.close();
  }
});

test("the content security policy reports and blocks file images", {
  tag: "@AC-SEC-15",
  annotation: { type: "AC-SEC-15" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    const localResourceErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" &&
        message.text() === "Not allowed to load local resource: file:///etc/hostname") {
        localResourceErrors.push(message.text());
      }
    });
    await expect(page.getByTestId("editor")).toBeVisible();

    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(policy).toBe(
      "default-src 'self'; img-src 'self' data: https: doc-asset:; " +
      "style-src 'self' 'unsafe-inline'; worker-src 'self'; script-src 'self'",
    );

    await page.evaluate(() => {
      const probe = globalThis as typeof globalThis & {
        fileImageProbe?: { blockedUris: string[]; loaded: boolean; settled: boolean };
      };
      probe.fileImageProbe = { blockedUris: [], loaded: false, settled: false };
      document.addEventListener("securitypolicyviolation", (event) => {
        probe.fileImageProbe?.blockedUris.push(event.blockedURI);
      });
      const image = document.createElement("img");
      image.addEventListener("load", () => {
        if (probe.fileImageProbe) {
          probe.fileImageProbe.loaded = true;
          probe.fileImageProbe.settled = true;
        }
      });
      image.addEventListener("error", () => {
        if (probe.fileImageProbe) {
          probe.fileImageProbe.settled = true;
        }
      });
      image.src = "file:///etc/hostname";
      document.body.append(image);
      // Chromium's local-resource gate precedes CSP reporting for the image;
      // fetching the same URL also proves the document policy reports it.
      void fetch(image.src).catch(() => undefined);
    });

    await expect.poll(() => page.evaluate(() => {
      const probe = globalThis as typeof globalThis & {
        fileImageProbe?: { blockedUris: string[]; settled: boolean };
      };
      return probe.fileImageProbe;
    })).toMatchObject({ blockedUris: ["file"], settled: true });
    await expect.poll(() => localResourceErrors).toEqual([
      "Not allowed to load local resource: file:///etc/hostname",
    ]);
    expect(await page.evaluate(() => {
      const probe = globalThis as typeof globalThis & {
        fileImageProbe?: { loaded: boolean };
      };
      return probe.fileImageProbe?.loaded;
    })).toBe(false);
  } finally {
    await application.close();
  }
});

test("the live renderer preferences keep every isolation control enabled", {
  tag: "@AC-SEC-15",
  annotation: { type: "AC-SEC-15" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await expect(page.getByTestId("editor")).toBeVisible();

    const preferences = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        return null;
      }
      const contents = window.webContents as typeof window.webContents & {
        getLastWebPreferences(): {
          sandbox?: boolean;
          contextIsolation?: boolean;
          webSecurity?: boolean;
          nodeIntegration?: boolean;
        };
      };
      const live = contents.getLastWebPreferences();
      return {
        sandbox: live.sandbox,
        contextIsolation: live.contextIsolation,
        webSecurity: live.webSecurity,
        nodeIntegration: live.nodeIntegration,
      };
    });
    expect(preferences).toEqual({
      sandbox: true,
      contextIsolation: true,
      webSecurity: true,
      nodeIntegration: false,
    });
  } finally {
    await application.close();
  }
});
