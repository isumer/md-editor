import { describe, expect, it, vi } from "vitest";

import {
  createCommandRegistry,
  type CommandContext,
} from "../../src/renderer/core/commands";
import {
  createContextKeys,
  evaluateWhen,
} from "../../src/renderer/core/contextKeys";

const keys = (...values: string[]): ReadonlySet<string> => new Set(values);

describe("evaluateWhen", () => {
  it.each([
    ["a", keys("a"), true],
    ["a", keys(), false],
    ["unknownKey", keys("a"), false],
    ["!a", keys("a"), false],
    ["!a", keys(), true],
    ["!!a", keys("a"), true],
    ["a && b", keys("a", "b"), true],
    ["a && b", keys("a"), false],
    ["a || b", keys("a"), true],
    ["a || b", keys(), false],
    ["a && b || c", keys("c"), true],
    ["a || b && c", keys("a"), true],
    ["(a || b) && c", keys("a"), false],
    ["(a || b) && c", keys("a", "c"), true],
    ["!(a && b)", keys("a"), true],
    ["! ( a || b )", keys("a", "b"), false],
    ["editorFocus && !hasSelection", keys("editorFocus"), true],
    ["editorFocus && !hasSelection", keys("editorFocus", "hasSelection"), false],
  ])("evaluates %s against %j as %s", (when, contextKeys, expected) => {
    expect(evaluateWhen(when, contextKeys)).toBe(expected);
  });

  it.each([
    "",
    "a &&",
    "&& a",
    "(a",
    "a)",
    "a b",
    "a & b",
    "a | b",
    "!",
    "()",
    "a && (b ||)",
  ])("treats malformed expression %j as false", (when) => {
    expect(evaluateWhen(when, keys("a", "b"))).toBe(false);
  });
});

describe("context key service", () => {
  it("stores a flat set and notifies subscribers only on change", () => {
    const service = createContextKeys(["editorFocus"]);
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    expect([...service.get()]).toEqual(["editorFocus"]);
    service.set(["editorFocus"]);
    expect(listener).not.toHaveBeenCalled();

    service.set(["editorFocus", "hasSelection"]);
    expect(listener).toHaveBeenCalledWith(new Set(["editorFocus", "hasSelection"]));

    service.set([]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(service.get().has("editorFocus")).toBe(false);

    unsubscribe();
    service.set(["editorFocus"]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns a copy that callers cannot mutate", () => {
    const service = createContextKeys(["a"]);
    const snapshot = service.get();
    (snapshot as Set<string>).add("b");
    expect([...service.get()]).toEqual(["a"]);
  });
});

describe("command registry", () => {
  function setup(): {
    registry: ReturnType<typeof createCommandRegistry>;
    context: CommandContext;
  } {
    return {
      registry: createCommandRegistry(),
      context: { contextKeys: createContextKeys() },
    };
  }

  it("registers commands by id and runs them with their arguments", async () => {
    const { registry, context } = setup();
    const run = vi.fn();
    const command = { id: "file.open", titleKey: "menu.open" as const, run };

    const unregister = registry.register(command);

    expect(registry.get("file.open")).toBe(command);
    expect(registry.list()).toEqual([command]);
    await expect(registry.run("file.open", context, { path: "a.md" }, "menu"))
      .resolves.toBe(true);
    expect(run).toHaveBeenCalledWith(context, { path: "a.md" }, "menu");

    unregister();
    expect(registry.get("file.open")).toBeUndefined();
  });

  it("refuses to replace a registered command id", () => {
    const { registry } = setup();
    registry.register({ id: "undo", titleKey: "menu.undo", run: vi.fn() });
    expect(() =>
      registry.register({ id: "undo", titleKey: "menu.undo", run: vi.fn() })
    ).toThrow("Duplicate command id: undo");
  });

  it("does not run a command whose when clause is not satisfied", async () => {
    const { registry, context } = setup();
    const run = vi.fn();
    registry.register({
      id: "file.save",
      titleKey: "menu.save",
      when: "editorFocus",
      run,
    });

    await expect(registry.run("file.save", context)).resolves.toBe(false);
    expect(run).not.toHaveBeenCalled();

    context.contextKeys.set(["editorFocus"]);
    await expect(registry.run("file.save", context)).resolves.toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs a command with no when clause and ignores unknown ids", async () => {
    const { registry, context } = setup();
    const run = vi.fn();
    registry.register({ id: "redo", titleKey: "menu.redo", run });

    await expect(registry.run("redo", context)).resolves.toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    await expect(registry.run("missing", context)).resolves.toBe(false);
  });

  it("awaits asynchronous commands", async () => {
    const { registry, context } = setup();
    let finished = false;
    registry.register({
      id: "file.saveAs",
      titleKey: "menu.saveAs",
      run: async () => {
        await Promise.resolve();
        finished = true;
      },
    });

    await expect(registry.run("file.saveAs", context)).resolves.toBe(true);
    expect(finished).toBe(true);
  });
});
