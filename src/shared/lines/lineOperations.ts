export type SortOrder =
  | "ascending"
  | "descending"
  | "ascending-ignore-case"
  | "descending-ignore-case";

function compareCodeUnits(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function sortLines(
  lines: readonly string[],
  order: SortOrder,
): string[] {
  const ignoreCase =
    order === "ascending-ignore-case" || order === "descending-ignore-case";
  const direction =
    order === "descending" || order === "descending-ignore-case" ? -1 : 1;
  return [...lines].sort(
    (left, right) =>
      direction *
      compareCodeUnits(
        ignoreCase ? left.toLowerCase() : left,
        ignoreCase ? right.toLowerCase() : right,
      ),
  );
}

export function removeDuplicateLines(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    if (!seen.has(line)) {
      seen.add(line);
      result.push(line);
    }
  }
  return result;
}

export function removeConsecutiveDuplicateLines(
  lines: readonly string[],
): string[] {
  const result: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line !== lines[index - 1]) {
      result.push(line);
    }
  }
  return result;
}

export function removeEmptyLines(
  lines: readonly string[],
  whitespaceIsEmpty: boolean,
): string[] {
  return lines.filter(
    (line) => line !== "" && !(whitespaceIsEmpty && /^[ \t]*$/.test(line)),
  );
}

export function trimTrailingWhitespace(lines: readonly string[]): string[] {
  return lines.map((line) => line.replace(/[ \t]+$/, ""));
}
