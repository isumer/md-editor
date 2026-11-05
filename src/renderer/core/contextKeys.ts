export interface ContextKeyService {
  get(): ReadonlySet<string>;
  set(keys: Iterable<string>): void;
  subscribe(listener: (keys: ReadonlySet<string>) => void): () => void;
}

export function createContextKeys(
  initial: Iterable<string> = [],
): ContextKeyService {
  let keys = new Set(initial);
  const listeners = new Set<(keys: ReadonlySet<string>) => void>();

  return {
    get: () => new Set(keys),
    set(next) {
      const updated = new Set(next);
      if (updated.size === keys.size && [...updated].every((key) => keys.has(key))) {
        return;
      }
      keys = updated;
      const snapshot: ReadonlySet<string> = new Set(keys);
      for (const listener of [...listeners]) {
        listener(snapshot);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type Token =
  | { kind: "key"; name: string }
  | { kind: "operator"; value: "!" | "&&" | "||" | "(" | ")" };

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*/;

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const character = input[index] ?? "";
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (input.startsWith("&&", index) || input.startsWith("||", index)) {
      tokens.push({ kind: "operator", value: input.slice(index, index + 2) as "&&" | "||" });
      index += 2;
      continue;
    }
    if (character === "!" || character === "(" || character === ")") {
      tokens.push({ kind: "operator", value: character });
      index += 1;
      continue;
    }
    const match = KEY_PATTERN.exec(input.slice(index));
    if (!match) {
      return null;
    }
    tokens.push({ kind: "key", name: match[0] });
    index += match[0].length;
  }
  return tokens;
}

function evaluateTokens(tokens: readonly Token[], keys: ReadonlySet<string>): boolean | null {
  let position = 0;
  const peek = (): Token | undefined => tokens[position];

  function parseOr(): boolean | null {
    let value = parseAnd();
    if (value === null) {
      return null;
    }
    for (;;) {
      const token = peek();
      if (token?.kind !== "operator" || token.value !== "||") {
        return value;
      }
      position += 1;
      const right = parseAnd();
      if (right === null) {
        return null;
      }
      value = value || right;
    }
  }

  function parseAnd(): boolean | null {
    let value = parseUnary();
    if (value === null) {
      return null;
    }
    for (;;) {
      const token = peek();
      if (token?.kind !== "operator" || token.value !== "&&") {
        return value;
      }
      position += 1;
      const right = parseUnary();
      if (right === null) {
        return null;
      }
      value = value && right;
    }
  }

  function parseUnary(): boolean | null {
    const token = peek();
    if (token?.kind === "operator" && token.value === "!") {
      position += 1;
      const value = parseUnary();
      return value === null ? null : !value;
    }
    return parsePrimary();
  }

  function parsePrimary(): boolean | null {
    const token = peek();
    if (token === undefined) {
      return null;
    }
    position += 1;
    if (token.kind === "key") {
      return keys.has(token.name);
    }
    if (token.value !== "(") {
      return null;
    }
    const value = parseOr();
    if (value === null) {
      return null;
    }
    const closing = peek();
    if (closing?.kind !== "operator" || closing.value !== ")") {
      return null;
    }
    position += 1;
    return value;
  }

  const result = parseOr();
  return result === null || position !== tokens.length ? null : result;
}

export function evaluateWhen(
  when: string,
  keys: ReadonlySet<string>,
): boolean {
  const tokens = tokenize(when);
  return tokens === null ? false : evaluateTokens(tokens, keys) ?? false;
}
