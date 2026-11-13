// @vitest-environment jsdom

import { beforeEach, expect, it } from "vitest";

import { syncScrollFeature } from "../../src/renderer/features/list";

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

function installSyncScroll() {
  const editorScroll = document.createElement("div");
  const preview = document.createElement("div");
  document.body.append(editorScroll, preview);
  const hooks = syncScrollFeature.create({
    editor: { scrollDOM: editorScroll },
    preview,
  } as unknown as Parameters<typeof syncScrollFeature.create>[0]);
  return hooks;
}

it("AC-R3-04: the feature command toggles sync scroll", () => {
  const hooks = installSyncScroll();

  hooks.commands?.["view.syncScroll"]?.();

  expect(localStorage.getItem("syncScroll.enabled")).toBe("false");
});
