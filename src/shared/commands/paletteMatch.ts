export interface PaletteEntry {
  readonly id: string;
  readonly title: string;
}

export interface PaletteMatch {
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly positions: readonly number[];
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function removeWhitespace(value: string): string {
  return value.replace(/\s/gu, "");
}

function isWordStart(title: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  const previousCharacter = title[index - 1];
  return previousCharacter === undefined || !LETTER_OR_DIGIT.test(previousCharacter);
}

function scorePositions(title: string, positions: readonly number[]): number {
  let score = 0;
  let previousPosition: number | undefined;
  for (const position of positions) {
    score += 1;
    if (isWordStart(title, position)) {
      score += 5;
    }
    if (previousPosition !== undefined && position === previousPosition + 1) {
      score += 3;
    }
    previousPosition = position;
  }
  return score;
}

export function matchTitle(
  query: string,
  title: string,
):
  | { readonly score: number; readonly positions: readonly number[] }
  | undefined {
  const compactQuery = removeWhitespace(query);
  const positions: number[] = [];
  let titleIndex = 0;
  for (let queryIndex = 0; queryIndex < compactQuery.length; queryIndex += 1) {
    const queryCharacter = compactQuery[queryIndex];
    if (queryCharacter === undefined) {
      return undefined;
    }
    const lowerQueryCharacter = queryCharacter.toLowerCase();
    while (
      titleIndex < title.length &&
      title[titleIndex]?.toLowerCase() !== lowerQueryCharacter
    ) {
      titleIndex += 1;
    }
    if (titleIndex === title.length) {
      return undefined;
    }
    positions.push(titleIndex);
    titleIndex += 1;
  }
  return { score: scorePositions(title, positions), positions };
}

function compareCodeUnits(first: string, second: string): number {
  if (first < second) {
    return -1;
  }
  return first > second ? 1 : 0;
}

function recentIndexes(recentIds: readonly string[]): ReadonlyMap<string, number> {
  const indexes = new Map<string, number>();
  for (let index = 0; index < recentIds.length; index += 1) {
    const id = recentIds[index];
    if (id !== undefined && !indexes.has(id)) {
      indexes.set(id, index);
    }
  }
  return indexes;
}

function compareMatches(
  first: PaletteMatch,
  second: PaletteMatch,
  recent: ReadonlyMap<string, number>,
): number {
  if (first.score !== second.score) {
    return second.score - first.score;
  }
  const firstRecent = recent.get(first.id);
  const secondRecent = recent.get(second.id);
  if (firstRecent !== undefined || secondRecent !== undefined) {
    if (firstRecent === undefined) return 1;
    if (secondRecent === undefined) return -1;
    if (firstRecent !== secondRecent) return firstRecent - secondRecent;
  }
  const titleOrder = compareCodeUnits(first.title, second.title);
  return titleOrder === 0 ? compareCodeUnits(first.id, second.id) : titleOrder;
}

export function rankCommands(
  query: string,
  entries: readonly PaletteEntry[],
  recentIds: readonly string[] = [],
  maxResults = 50,
): readonly PaletteMatch[] {
  if (!Number.isInteger(maxResults) || maxResults <= 0) {
    return [];
  }
  const seenIds = new Set<string>();
  const matches: PaletteMatch[] = [];
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      continue;
    }
    seenIds.add(entry.id);
    const match = matchTitle(query, entry.title);
    if (match !== undefined) {
      matches.push({ id: entry.id, title: entry.title, ...match });
    }
  }
  const recent = recentIndexes(recentIds);
  matches.sort((first, second) => compareMatches(first, second, recent));
  return matches.slice(0, maxResults);
}
