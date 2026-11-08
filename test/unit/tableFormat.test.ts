import { describe, expect, it } from "vitest";

import { formatTable } from "../../src/shared/format/tableFormat";

describe("AC-R13-07: table formatter", () => {
  it("AC-R13-07: aligns every column to its widest cell", () => {
    const lines = [
      "| Name | ID | Description |",
      "| - | - | - |",
      "| A | 1 | Short |",
      "| Longer name | 22 | A longer description |",
      "| Mid | 333 | Text |",
      "| Z | 4 | End |",
    ];

    expect(formatTable(lines)).toEqual([
      "| Name        | ID  | Description          |",
      "| ----------- | --- | -------------------- |",
      "| A           | 1   | Short                |",
      "| Longer name | 22  | A longer description |",
      "| Mid         | 333 | Text                 |",
      "| Z           | 4   | End                  |",
    ]);
  });

  it("AC-R13-07: keeps each column's alignment", () => {
    const lines = [
      "| a | name | three | length |",
      "| - | :- | -: | :-: |",
      "| b | row | four | short |",
    ];

    expect(formatTable(lines)[1]).toBe("| --- | :--- | ----: | :----: |");
  });

  it("AC-R13-07: pads to the three-character minimum", () => {
    expect(formatTable(["| a | b |", "| - | - |"])).toEqual([
      "| a   | b   |",
      "| --- | --- |",
    ]);
  });

  it("AC-R13-07: keeps an escaped pipe inside its cell", () => {
    expect(formatTable(["| a \\| b | c |", "| - | - |"])).toEqual([
      "| a \\| b | c   |",
      "| ------ | --- |",
    ]);
  });

  it("AC-R13-07: treats a pipe after an even backslash run as a separator", () => {
    expect(
      formatTable(["| a \\\\| b | c |", "| - | - | - |", "| x | y | z |"]),
    ).toEqual([
      "| a \\\\ | b   | c   |",
      "| ---- | --- | --- |",
      "| x    | y   | z   |",
    ]);
  });

  it("AC-R13-07: keeps an escaped pipe at the end of a row", () => {
    expect(formatTable(["x | a \\|", "- | -"])).toEqual([
      "| x   | a \\| |",
      "| --- | ---- |",
    ]);
  });

  it("AC-R13-07: accepts rows without outer pipes", () => {
    expect(formatTable(["| long | b |", "--- | ---", "a | b"])).toEqual([
      "| long | b   |",
      "| ---- | --- |",
      "| a    | b   |",
    ]);
  });

  it("AC-R13-07: formats the output again to the same lines", () => {
    const once = formatTable([
      "item | value | note",
      "--- | :---: | ---:",
      "| a \\| b | longer | x |",
    ]);

    expect(formatTable(once)).toEqual(once);
  });

  it("AC-R13-07: rejects an invalid table", () => {
    expect(() => formatTable(["| a |"])).toThrowError(
      "table needs a header and a delimiter row",
    );
    for (const delimiter of ["", "a", "::"]) {
      expect(() => formatTable(["a", delimiter])).toThrowError(
        "invalid delimiter row",
      );
    }
    expect(() => formatTable(["a | b", "- | -", "a"])).toThrowError(
      "table row has the wrong number of cells",
    );
    expect(() => formatTable(["a | b", "- | -", "a | b | c"])).toThrowError(
      "table row has the wrong number of cells",
    );
  });

  it("AC-R13-07: does not change its input", () => {
    const input = Object.freeze([
      Object.freeze("| a | b |"),
      Object.freeze("| - | - |"),
    ]);

    const result = formatTable(input);

    expect(result).not.toBe(input);
    expect(input).toEqual(["| a | b |", "| - | - |"]);
  });
});
