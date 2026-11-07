type Alignment = "none" | "left" | "right" | "center";

function trimCell(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/g, "");
}

function isEscapedPipe(value: string, pipeIndex: number): boolean {
  let backslashCount = 0;
  for (
    let index = pipeIndex - 1;
    index >= 0 && value[index] === "\\";
    index -= 1
  ) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

function splitRow(line: string): string[] {
  let content = trimCell(line);
  if (content.startsWith("|")) {
    content = content.slice(1);
  }
  if (content.endsWith("|") && !isEscapedPipe(content, content.length - 1)) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let cellStart = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscapedPipe(content, index)) {
      cells.push(trimCell(content.slice(cellStart, index)));
      cellStart = index + 1;
    }
  }
  cells.push(trimCell(content.slice(cellStart)));
  return cells;
}

function delimiterAlignment(cell: string): Alignment {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) {
    return "center";
  }
  if (left) {
    return "left";
  }
  if (right) {
    return "right";
  }
  return "none";
}

function delimiterCell(width: number, alignment: Alignment): string {
  switch (alignment) {
    case "none":
      return "-".repeat(width);
    case "left":
      return `:${"-".repeat(width - 1)}`;
    case "right":
      return `${"-".repeat(width - 1)}:`;
    case "center":
      return `:${"-".repeat(width - 2)}:`;
  }
}

function tableWidths(rows: readonly (readonly string[])[]): number[] {
  const firstRow = rows[0];
  if (firstRow === undefined) {
    return [];
  }
  return firstRow.map((_, column) =>
    Math.max(3, ...rows.map((row) => row[column]?.length ?? 0)),
  );
}

function outputRow(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

export function formatTable(lines: readonly string[]): string[] {
  if (lines.length < 2) {
    throw new Error("table needs a header and a delimiter row");
  }

  const rows = lines.map(splitRow);
  const delimiter = rows[1];
  if (
    delimiter === undefined ||
    delimiter.some((cell) => !/^:?-+:?$/.test(cell))
  ) {
    throw new Error("invalid delimiter row");
  }
  if (rows.some((row) => row.length !== delimiter.length)) {
    throw new Error("table row has the wrong number of cells");
  }

  const contentRows = rows.filter((_, index) => index !== 1);
  const widths = tableWidths(contentRows);
  return rows.map((row, rowIndex) => {
    if (rowIndex === 1) {
      return outputRow(
        row.map((cell, column) =>
          delimiterCell(widths[column] ?? 3, delimiterAlignment(cell)),
        ),
      );
    }
    return outputRow(
      row.map((cell, column) => cell.padEnd(widths[column] ?? 3, " ")),
    );
  });
}
