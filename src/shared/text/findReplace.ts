export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface TextMatch {
  start: number;
  end: number;
}

interface MatchRecord extends TextMatch {
  groups: readonly (string | undefined)[];
}

const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

function escapeMetacharacters(query: string): string {
  return query.replace(REGEX_METACHARACTERS, "\\$&");
}

function buildRegExp(query: string, options: FindOptions): RegExp {
  const source = options.regex ? query : escapeMetacharacters(query);
  return new RegExp(source, options.matchCase ? "g" : "gi");
}

function isWordCharacterAt(text: string, index: number): boolean {
  const character = text[index];
  return character !== undefined && WORD_CHARACTER.test(character);
}

function isWholeWord(text: string, start: number, end: number): boolean {
  return !isWordCharacterAt(text, start - 1) && !isWordCharacterAt(text, end);
}

function collectMatches(
  text: string,
  query: string,
  options: FindOptions,
): MatchRecord[] {
  if (query === "") {
    return [];
  }

  let pattern: RegExp;
  try {
    pattern = buildRegExp(query, options);
  } catch {
    return [];
  }

  const matches: MatchRecord[] = [];
  let found = pattern.exec(text);
  while (found !== null) {
    const start = found.index;
    const end = start + found[0].length;
    if (start === end) {
      pattern.lastIndex = start + 1;
      found = pattern.exec(text);
      continue;
    }
    if (!options.wholeWord || isWholeWord(text, start, end)) {
      matches.push({ start, end, groups: found.slice(1) });
    }
    found = pattern.exec(text);
  }
  return matches;
}

function expandReplacement(
  replacement: string,
  matchedText: string,
  groups: readonly (string | undefined)[],
): string {
  let result = "";
  let index = 0;
  while (index < replacement.length) {
    const character = replacement[index];
    const next = replacement[index + 1];
    if (character !== "$" || next === undefined) {
      result += character;
      index += 1;
      continue;
    }
    if (next === "$") {
      result += "$";
      index += 2;
      continue;
    }
    if (next === "&") {
      result += matchedText;
      index += 2;
      continue;
    }
    if (next >= "1" && next <= "9") {
      const afterNext = replacement[index + 2];
      const hasSecondDigit =
        afterNext !== undefined && afterNext >= "0" && afterNext <= "9";
      const digits = hasSecondDigit ? next + afterNext : next;
      result += groups[Number(digits) - 1] ?? "";
      index += 1 + digits.length;
      continue;
    }
    result += "$";
    index += 1;
  }
  return result;
}

export function findMatches(
  text: string,
  query: string,
  options: FindOptions,
): TextMatch[] {
  return collectMatches(text, query, options).map(({ start, end }) => ({
    start,
    end,
  }));
}

export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  options: FindOptions,
): { text: string; count: number } {
  const matches = collectMatches(text, query, options);
  let result = "";
  let cursor = 0;
  for (const match of matches) {
    result += text.slice(cursor, match.start);
    const matchedText = text.slice(match.start, match.end);
    result += options.regex
      ? expandReplacement(replacement, matchedText, match.groups)
      : replacement;
    cursor = match.end;
  }
  result += text.slice(cursor);
  return { text: result, count: matches.length };
}
