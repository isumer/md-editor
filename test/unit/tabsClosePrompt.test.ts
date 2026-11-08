// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { DocumentClosePrompt } from "../../src/renderer/tabs/closePrompt";
import type { DocumentRecord } from "../../src/renderer/core/document";

function promptFixture(): {
  host: HTMLElement;
  message: HTMLElement;
  prompt: DocumentClosePrompt;
} {
  const host = document.createElement("div");
  host.hidden = true;
  const message = document.createElement("p");
  host.append(message);
  for (const action of ["cancel", "discard", "save"] as const) {
    const button = document.createElement("button");
    button.dataset["action"] = action;
    host.append(button);
  }
  document.body.append(host);
  return { host, message, prompt: new DocumentClosePrompt(host, message) };
}

function named(name: string): DocumentRecord {
  return { name } as DocumentRecord;
}

describe("document close prompt", () => {
  it.each(["cancel", "discard", "save"] as const)(
    "AC-R4-05: %s resolves the one-file close prompt",
    async (answer) => {
      const { host, message, prompt } = promptFixture();

      const pending = prompt.ask([named("note.md")]);
      host.querySelector<HTMLButtonElement>(`[data-action="${answer}"]`)?.click();

      await expect(pending).resolves.toBe(answer);
      expect(message.textContent).toContain("note.md");
      expect(host.hidden).toBe(true);
    },
  );

  it("AC-R4-06: the many-file prompt names every dirty file", async () => {
    const { host, message, prompt } = promptFixture();

    const pending = prompt.ask([named("one.md"), named("two.md")]);
    expect(message.textContent).toContain("one.md");
    expect(message.textContent).toContain("two.md");
    host.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();

    await expect(pending).resolves.toBe("discard");
  });

  it("AC-R4-05: unrelated clicks leave an untitled prompt pending", async () => {
    const { host, message, prompt } = promptFixture();
    let answer: string | null = null;
    const pending = prompt.ask([{ name: null } as DocumentRecord]).then((value) => {
      answer = value;
    });

    host.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(answer).toBeNull();
    expect(message.textContent).toContain("Untitled");
    host.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
    await pending;
  });
});
