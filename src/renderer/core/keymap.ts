import type { CommandContext, CommandRegistry } from "./commands";

export type KeyBindings = Readonly<Record<string, string | undefined>>;

// Mod is Ctrl on Windows/Linux and Meta on macOS. The menu displays the same chords
// with registerAccelerator: false, so these are the only bindings that fire.
export const DEFAULT_BINDINGS: KeyBindings = Object.freeze({
  "Mod-o": "file.open",
  "Mod-s": "file.save",
  "Mod-Shift-s": "file.saveAs",
  "Mod-Shift-c": "file.compareOpen",
  // On win32 AltGr arrives as Ctrl+Alt+<char> and stays text (chordForEvent),
  // so these chords fire only on a deliberate Ctrl+Alt or on macOS Cmd+Alt.
  "Mod-Alt-h": "file.exportHtml",
  "Mod-Alt-p": "file.exportPdf",
  "Mod-z": "undo",
  "Mod-Shift-z": "redo",
  "Mod-y": "redo",
});

const DARWIN_DEFAULT_BINDINGS: KeyBindings = Object.freeze({
  ...DEFAULT_BINDINGS,
  "Mod-y": undefined,
});

function defaultBindings(platform: string): KeyBindings {
  return platform === "darwin" ? DARWIN_DEFAULT_BINDINGS : DEFAULT_BINDINGS;
}

export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault(): void;
}

export interface KeydownTarget {
  addEventListener(
    type: "keydown",
    listener: (event: KeyEventLike) => void,
    useCapture: boolean,
  ): void;
  removeEventListener(
    type: "keydown",
    listener: (event: KeyEventLike) => void,
    useCapture: boolean,
  ): void;
}

export interface KeymapOptions {
  registry: CommandRegistry;
  context: CommandContext;
  platform: string;
  bindings?: KeyBindings;
}

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "Symbol",
  "SymbolLock",
  "OS",
]);

const PHYSICAL_KEY = /^(?:Key([A-Z])|Digit([0-9]))$/;

function normalizedKey(key: string, code: string | undefined): string | null {
  if (key.length === 0 || MODIFIER_KEYS.has(key)) {
    return null;
  }
  // A non-Latin layout (e.g. Cyrillic) types another letter: chords follow the physical key.
  const physical = key.length === 1 && key > "\u007f" ? PHYSICAL_KEY.exec(code ?? "") : null;
  if (physical) {
    return (physical[1] ?? physical[2] ?? "").toLowerCase();
  }
  return key.length === 1 ? key.toLowerCase() : key;
}

export function chordForEvent(
  event: KeyEventLike,
  platform: string,
): string | null {
  const key = normalizedKey(event.key, event.code);
  if (key === null) {
    return null;
  }
  // On Windows AltGr arrives as Ctrl+Alt and must stay text input.
  if (platform === "win32" && event.ctrlKey && event.altKey &&
    event.key.length === 1) {
    return null;
  }
  const apple = platform === "darwin";
  const parts: string[] = [];
  if (apple ? event.metaKey : event.ctrlKey) {
    parts.push("Mod");
  }
  if (apple && event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (!apple && event.metaKey) {
    parts.push("Meta");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (parts.length === 0) {
    return null;
  }
  return `${parts.join("-")}-${key}`;
}

export function bindingForEvent(
  event: KeyEventLike,
  platform: string,
  bindings: KeyBindings = defaultBindings(platform),
): string | undefined {
  const chord = chordForEvent(event, platform);
  return chord === null ? undefined : bindings[chord];
}

export function installKeymap(
  target: KeydownTarget,
  options: KeymapOptions,
): () => void {
  const listener = (event: KeyEventLike): void => {
    const commandId = bindingForEvent(event, options.platform, options.bindings);
    if (commandId === undefined) {
      return;
    }
    event.preventDefault();
    void options.registry.run(commandId, options.context, undefined, undefined);
  };
  target.addEventListener("keydown", listener, true);
  return () => {
    target.removeEventListener("keydown", listener, true);
  };
}
