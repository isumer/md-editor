import { ChangeSet, Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { DocumentMirror } from "../../src/shared/replication/mirror";

function applyChanges(document: Text, changes: unknown): Text {
  return ChangeSet.fromJSON(changes).apply(document);
}

function text(value: string): Text {
  return Text.of(value.split("\n"));
}

describe("document mirror", () => {
  it("AC-R5-19: serves only the exact synced epoch and version", () => {
    const mirror = new DocumentMirror<Text, unknown>(applyChanges);
    const initial = text("one");
    const change = ChangeSet.of({ from: 3, insert: " two" }, initial.length);

    mirror.attach("doc", 1, 0, initial);
    mirror.change("doc", 1, 0, 1, change.toJSON());

    expect(mirror.docAt("doc", 1, 1)?.toString()).toBe("one two");
    expect(mirror.docAt("doc", 1, 0)).toBeUndefined();
    expect(mirror.docAt("doc", 2, 1)).toBeUndefined();
  });

  it("AC-R5-19: drops old epochs and replaces stale copies on attach", () => {
    const mirror = new DocumentMirror<Text, unknown>(applyChanges);
    const current = text("current");
    mirror.attach("doc", 2, 0, current);

    mirror.change("doc", 1, 0, 1, ChangeSet.empty(current.length).toJSON());
    expect(mirror.docAt("doc", 2, 0)).toBe(current);

    mirror.change("doc", 2, 4, 5, ChangeSet.empty(current.length).toJSON());
    expect(mirror.docAt("doc", 2, 0)).toBeUndefined();
    mirror.attach("doc", 1, 0, text("older"));
    expect(mirror.docAt("doc", 1, 0)).toBeUndefined();
    mirror.attach("doc", 2, 5, text("resynced"));
    expect(mirror.docAt("doc", 2, 5)?.toString()).toBe("resynced");
  });

  it("AC-R5-19: a malformed applicable change makes the copy unavailable", () => {
    const mirror = new DocumentMirror<Text, unknown>(applyChanges);
    mirror.attach("doc", 1, 0, text("short"));

    mirror.change("doc", 1, 0, 1, [99]);

    expect(mirror.docAt("doc", 1, 1)).toBeUndefined();
  });

  it("AC-R5-19: detaching removes the document copy", () => {
    const mirror = new DocumentMirror<Text, unknown>(applyChanges);
    mirror.attach("doc", 1, 0, text("attached"));

    mirror.detach("doc");

    expect(mirror.docAt("doc", 1, 0)).toBeUndefined();
  });
});

interface Generator {
  next(limit: number): number;
}

function generator(seed: number): Generator {
  let state = seed >>> 0;
  return {
    next(limit) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state % limit;
    },
  };
}

function randomInsert(random: Generator): string {
  const alphabet = ["a", "b", "c", "\n", "xy"] as const;
  return alphabet[random.next(alphabet.length)] ?? "";
}

function runProperty(seed: number): void {
  const random = generator(seed);
  let mirror = new DocumentMirror<Text, unknown>(applyChanges);
  let epoch = 0;
  let version = 0;
  let document = Text.empty;
  let versions = new Map<number, Text>([[0, document]]);
  mirror.attach("doc", epoch, version, document);

  for (let step = 0; step < 30; step += 1) {
    const action = random.next(6);
    if (action === 0) {
      epoch += 1;
      version = 0;
      document = text(randomInsert(random));
      versions = new Map([[version, document]]);
      mirror.attach("doc", epoch, version, document);
      expect(mirror.docAt("doc", epoch, version)?.eq(document), `seed ${seed}`).toBe(true);
    } else if (action === 1) {
      mirror = new DocumentMirror<Text, unknown>(applyChanges);
    } else if (action === 2 && epoch > 0) {
      mirror.change("doc", epoch - 1, version, version + 1, []);
    } else if (action === 3 && version > 0) {
      mirror.change("doc", epoch, version - 1, version, []);
    } else if (action === 4) {
      mirror.attach("doc", epoch, version, document);
      expect(mirror.docAt("doc", epoch, version)?.eq(document), `seed ${seed}`).toBe(true);
    } else {
      const from = random.next(document.length + 1);
      const change = ChangeSet.of({ from, insert: randomInsert(random) }, document.length);
      mirror.change("doc", epoch, version, version + 1, change.toJSON());
      document = change.apply(document);
      version += 1;
      versions.set(version, document);
    }

    const requestedVersion = random.next(version + 2);
    const mirrored = mirror.docAt("doc", epoch, requestedVersion);
    const expected = versions.get(requestedVersion);
    expect(mirrored === undefined || expected?.eq(mirrored), `seed ${seed}`).toBe(true);
  }
}

describe("document mirror property", () => {
  it("AC-R5-19: never returns text other than the renderer version over 500 seeds", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      runProperty(seed);
    }
  });
});
