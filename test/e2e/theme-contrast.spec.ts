import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  launchEditor,
  repositoryRoot,
  stubOpenDialog,
} from "./helpers";

const workspaceFixture = path.join(repositoryRoot, "test/fixtures/workspace");
const documentPath = path.join(workspaceFixture, "about.md");
const secondPath = path.join(repositoryRoot, "test/fixtures/compare/lines/right.txt");

const THEME_BACKGROUND = {
  light: "rgb(255, 255, 255)",
  dark: "rgb(13, 17, 23)",
} as const;

interface ContrastFailure {
  element: string;
  colour: string;
  background: string;
  ratio: number;
  required: number;
}

async function contrastFailures(page: Page): Promise<ContrastFailure[]> {
  return page.evaluate(() => {
    interface Color {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    function parseColor(value: string): Color {
      const match = /^rgba?\(([^)]+)\)$/.exec(value);
      const body = match?.[1];
      if (body === undefined) {
        throw new Error(`cannot parse colour ${value}`);
      }
      const parts = body.split(/[ ,/]+/).filter((part) => part !== "").map(Number);
      return {
        r: parts[0] ?? 0,
        g: parts[1] ?? 0,
        b: parts[2] ?? 0,
        a: parts[3] ?? 1,
      };
    }

    function linearize(channel: number): number {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }

    function luminance(color: Color): number {
      return 0.2126 * linearize(color.r)
        + 0.7152 * linearize(color.g)
        + 0.0722 * linearize(color.b);
    }

    function ratio(a: Color, b: Color): number {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }

    function format(color: Color): string {
      return `rgb(${String(Math.round(color.r))}, ${String(Math.round(color.g))}, ${String(Math.round(color.b))})`;
    }

    function blend(top: Color, bottom: Color): Color {
      const alpha = top.a + bottom.a * (1 - top.a);
      if (alpha === 0) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
        a: alpha,
      };
    }

    function effectiveBackground(element: Element): Color {
      const layers: Color[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const layer = parseColor(getComputedStyle(node).backgroundColor);
        if (layer.a > 0) {
          layers.push(layer);
          if (layer.a >= 1) {
            break;
          }
        }
      }
      let result: Color = { r: 255, g: 255, b: 255, a: 1 };
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];
        if (layer !== undefined) {
          result = blend(layer, result);
        }
      }
      return result;
    }

    function visible(element: Element): boolean {
      const style = getComputedStyle(element);
      if (
        style.display === "none"
        || style.visibility === "hidden"
        || Number(style.opacity) === 0
        || element.getClientRects().length === 0
      ) {
        return false;
      }
      return true;
    }

    function ownText(element: Element): boolean {
      for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "") {
          return true;
        }
      }
      return false;
    }

    function describe(element: Element): string {
      const id = element.id === "" ? "" : `#${element.id}`;
      const classes = Array.from(element.classList).slice(0, 2).join(".");
      const selector = classes === "" ? "" : `.${classes}`;
      const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${element.tagName.toLowerCase()}${id}${selector} "${text}"`;
    }

    function requiredRatio(element: Element): number {
      const style = getComputedStyle(element);
      const size = Number.parseFloat(style.fontSize);
      const weight = style.fontWeight === "bold" ? 700 : Number(style.fontWeight);
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      return large ? 3 : 4.5;
    }

    const failures: ContrastFailure[] = [];
    for (const element of Array.from(document.querySelectorAll("*"))) {
      if (!visible(element) || !ownText(element)) {
        continue;
      }
      const style = getComputedStyle(element);
      const background = effectiveBackground(element);
      const opacity = parseColor(style.color);
      const text = opacity.a < 1 ? blend(opacity, background) : opacity;
      const value = ratio(text, background);
      const required = requiredRatio(element);
      if (value < required) {
        failures.push({
          element: describe(element),
          colour: format(text),
          background: format(background),
          ratio: value,
          required,
        });
      }
    }
    return failures;
  });
}

async function expectReadable(page: Page, context: string): Promise<void> {
  const failures = await contrastFailures(page);
  const details = failures
    .map((failure) =>
      `${failure.element}: text ${failure.colour} on ${failure.background} is `
      + `${failure.ratio.toFixed(2)}:1, needs ${String(failure.required)}:1`)
    .join("\n");
  expect(failures, `${context}\n${details}`).toEqual([]);
}

async function applyTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await expect.poll(() => page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  )).toBe(THEME_BACKGROUND[theme]);
}

async function openWorkspace(page: Page, application: Parameters<typeof stubOpenDialog>[0]) {
  await stubOpenDialog(application, workspaceFixture);
  await page.getByRole("button", { name: "Open Folder" }).click();
  await expect(page.getByTestId("workspace-tree")).toBeVisible();
  await page.getByTestId("workspace-tree").getByRole("button", { name: "about.md" }).click();
  await expect(page.getByTestId("preview").locator("h1")).toHaveText("About this workspace");
}

for (const theme of ["light", "dark"] as const) {
  test(`chrome text meets the contrast floor in the ${theme} theme`, async () => {
    const { application, page } = await launchEditor(documentPath);
    try {
      await applyTheme(page, theme);
      await openWorkspace(page, application);

      const row = page.getByTestId("workspace-row").first();
      const sidebarBackground = await page.getByRole("complementary", { name: "Workspace" })
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      await row.hover();
      await expect.poll(() => row.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      )).not.toBe(sidebarBackground);
      await expectReadable(page, `${theme}: workspace sidebar hover`);

      await stubOpenDialog(application, secondPath);
      await clickMenuItem(application, "file-open");
      await expect(page.getByRole("tab", { name: /right\.txt/ })).toBeVisible();

      await clickMenuItem(application, "file-compare-open");
      await expect(page.getByTestId("compare-view")).toBeVisible();
      await expect(page.getByTestId("compare-left-heading")).toBeVisible();
      await expect(page.locator(".compare-selected").first()).toBeVisible();
      await expectReadable(page, `${theme}: compare view`);

      await page.getByRole("tab", { name: /right\.txt/ }).click();
      await clickMenuItem(application, "file-merge-open");
      await expect(page.getByTestId("merge-view")).toBeVisible();
      await expect(page.getByTestId("merge-left")).toBeVisible();
      await expectReadable(page, `${theme}: merge view`);
    } finally {
      await closeEditor(application, page);
    }
  });
}
