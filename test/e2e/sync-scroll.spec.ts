import path from "node:path";

import { expect, test } from "@playwright/test";

import { closeEditor, launchEditor, repositoryRoot } from "./helpers";

const syncFixture = path.join(repositoryRoot, "test/fixtures/views/sync-scroll.md");

async function scrollEditorToLine(page: import("@playwright/test").Page, line: number) {
  await page.getByTestId("editor").locator(".cm-scroller").evaluate((element, value) => {
    const line = element.querySelector<HTMLElement>(".cm-line");
    if (line === null) throw new Error("Editor has no visible line");
    const lineHeight = line.getBoundingClientRect().height;
    element.scrollTop = (value - 1) * lineHeight;
    element.dispatchEvent(new Event("scroll"));
  }, line);
}

test("AC-R3-01: editor scrolling brings the matching heading into preview", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    await expect(page.getByTestId("preview").getByRole("heading", { name: "Heading 40" }))
      .toBeAttached();
    await scrollEditorToLine(page, 96);

    await expect.poll(() => page.getByTestId("preview").evaluate((preview) => {
      const top = preview.getBoundingClientRect().top;
      const headings = [...preview.querySelectorAll("h2")];
      return headings.find((heading) => heading.getBoundingClientRect().bottom > top)?.textContent;
    })).toMatch(/Heading (19|20|21)/);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R3-02: preview scrolling brings the matching line into the editor", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    const heading = page.getByTestId("preview").getByRole("heading", { name: "Heading 20" });
    await expect(heading).toBeAttached();
    await heading.evaluate((element) => element.parentElement?.scrollIntoView());

    await expect.poll(() => page.getByTestId("editor").locator(".cm-scroller").evaluate((scroller) => {
      const top = scroller.getBoundingClientRect().top;
      const lines = [...scroller.querySelectorAll(".cm-line")];
      return lines.find((line) => line.getBoundingClientRect().bottom > top &&
        line.textContent?.startsWith("## "))?.textContent ?? "";
    }))
      .toMatch(/Heading (19|20|21)/);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R3-03: synchronized scrolling does not feed back", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    await expect(page.getByTestId("preview").getByRole("heading", { name: "Heading 40" }))
      .toBeAttached();
    await scrollEditorToLine(page, 110);
    await expect.poll(() => page.getByTestId("preview").evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    const positions = await page.evaluate(() => ({
      editor: document.querySelector<HTMLElement>(".cm-scroller")?.scrollTop ?? -1,
      preview: document.querySelector<HTMLElement>("#preview")?.scrollTop ?? -1,
    }));
    await expect.poll(() => page.evaluate(() => ({
      editor: document.querySelector<HTMLElement>(".cm-scroller")?.scrollTop ?? -1,
      preview: document.querySelector<HTMLElement>("#preview")?.scrollTop ?? -1,
    }))).toEqual(positions);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R3-04: the View menu disables sync scroll", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    await expect(page.getByTestId("preview").getByRole("heading", { name: "Heading 40" }))
      .toBeAttached();
    await application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById("view-sync-scroll")?.click());
    const before = await page.getByTestId("preview").evaluate((element) => element.scrollTop);
    await scrollEditorToLine(page, 150);
    await expect.poll(() => page.getByTestId("preview").evaluate((element) => element.scrollTop))
      .toBe(before);
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem("syncScroll.enabled"))).toBe("false");
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R3-05: sync scroll coalesces a fling into animation frames", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    await expect(page.getByTestId("preview").getByRole("heading", { name: "Heading 40" }))
      .toBeAttached();
    const durations = await page.getByTestId("editor").locator(".cm-scroller")
      .evaluate(async (element) => {
        const samples: number[] = [];
        for (let index = 0; index < 30; index += 1) {
          const start = performance.now();
          element.scrollTop = index * 100;
          element.dispatchEvent(new Event("scroll"));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          samples.push(performance.now() - start);
        }
        return samples.sort((left, right) => left - right);
      });
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(32);
  } finally {
    await closeEditor(application, page);
  }
});
