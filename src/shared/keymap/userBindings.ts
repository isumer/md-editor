export type Bindings = Readonly<Record<string, string | undefined>>;
export type BindingProblemReason =
  | "invalid-table" | "invalid-chord" | "invalid-command"
  | "unreachable-chord" | "duplicate";
export interface BindingProblem {
  readonly chord: string;
  readonly reason: BindingProblemReason;
}
export interface ResolvedBindings {
  readonly bindings: Bindings;
  readonly problems: readonly BindingProblem[];
}

const MODIFIERS = ["Mod", "Ctrl", "Meta", "Alt", "Shift"] as const;
const MODIFIER_SET = new Set(MODIFIERS);
const NAMED_KEYS = new Set([
  "Enter", "Escape", "Tab", "Backspace", "Delete", "Insert",
  "Home", "End", "PageUp", "PageDown",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
]);

function isValidKey(key: string): boolean {
  if (key.length === 1) {
    return key !== "-" && key !== " " && key !== "\t" && key !== "\n" && key !== "\r";
  }
  return NAMED_KEYS.has(key);
}

export function normalizeChord(chord: string, platform: string): string | null {
  if (chord === "") {
    return null;
  }
  const parts = chord.split("-");
  if (parts.length < 2) {
    return null;
  }
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  if (modifiers.length === 0) {
    return null;
  }

  const seenModifiers = new Set<string>();
  for (const mod of modifiers) {
    if (!MODIFIER_SET.has(mod as typeof MODIFIERS[number])) {
      return null;
    }
    if (seenModifiers.has(mod)) {
      return null;
    }
    seenModifiers.add(mod);
  }

  if (key === undefined || !isValidKey(key)) {
    return null;
  }

  if (platform === "darwin") {
    if (seenModifiers.has("Meta")) {
      return null;
    }
  } else {
    if (seenModifiers.has("Ctrl")) {
      return null;
    }
  }

  const normalizedModifiers = MODIFIERS.filter(m => seenModifiers.has(m));
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
  return `${normalizedModifiers.join("-")}-${normalizedKey}`;
}

export function resolveUserBindings(
  defaults: Bindings,
  user: unknown,
  platform: string,
): ResolvedBindings {
  const bindings: Record<string, string | undefined> = { ...defaults };
  const problems: BindingProblem[] = [];

  if (user === null || Array.isArray(user) || typeof user !== "object") {
    return {
      bindings: Object.freeze(bindings),
      problems: Object.freeze([{ chord: "", reason: "invalid-table" }]),
    };
  }

  const userObj = user as Record<string, unknown>;
  const seenNormalized = new Set<string>();

  for (const [chord, value] of Object.entries(userObj)) {
    const normalized = normalizeChord(chord, platform);
    if (normalized === null) {
      problems.push({ chord, reason: "invalid-chord" });
      continue;
    }

    if (platform === "win32" && normalized.startsWith("Mod-Alt-")) {
      const keyPart = normalized.slice("Mod-Alt-".length);
      if (keyPart.length === 1) {
        problems.push({ chord, reason: "unreachable-chord" });
        continue;
      }
    }

    if (seenNormalized.has(normalized)) {
      problems.push({ chord, reason: "duplicate" });
      continue;
    }
    seenNormalized.add(normalized);

    if (value === null) {
      bindings[normalized] = undefined;
    } else if (typeof value === "string" && value !== "" && !/\s/.test(value)) {
      bindings[normalized] = value;
    } else {
      problems.push({ chord, reason: "invalid-command" });
    }
  }

  return {
    bindings: Object.freeze(bindings),
    problems: Object.freeze(problems),
  };
}