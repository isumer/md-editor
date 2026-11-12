// @vitest-environment jsdom

import { beforeEach, expect, it } from "vitest";

import { viewsFeature } from "../../src/renderer/features/views/wiring";

beforeEach(() => {
  document.body.innerHTML = `
    <main id="workspace">
      <section id="editor"></section>
      <div id="divider"></div>
      <section id="preview"></section>
    </main>`;
  localStorage.clear();
});

function installViews() {
  const workspace = document.querySelector<HTMLElement>("#workspace");
  const preview = document.querySelector<HTMLElement>("#preview");
  const editor = document.querySelector<HTMLElement>("#editor");
  if (workspace === null || preview === null || editor === null) {
    throw new Error("Missing view fixture");
  }
  const hooks = viewsFeature.create({
    editor: { scrollDOM: editor },
    preview,
    workspace,
  } as unknown as Parameters<typeof viewsFeature.create>[0]);
  return { hooks, workspace };
}

it("AC-R2-01: exposes mode changes only as command handlers", () => {
  const { hooks, workspace } = installViews();

  hooks.commands?.["view.editor"]?.();
  expect(workspace.dataset["viewMode"]).toBe("editor");
  hooks.commands?.["view.preview"]?.();
  expect(workspace.dataset["viewMode"]).toBe("preview");
  hooks.commands?.["view.split"]?.();
  expect(workspace.dataset["viewMode"]).toBe("split");
});

it("does not expose commands when the view controller cannot start", () => {
  document.querySelector("#divider")?.remove();

  expect(installViews().hooks.commands).toBeUndefined();
});
