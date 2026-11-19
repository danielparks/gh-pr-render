import { describe, expect, it } from "vitest";
import { trimDiffHunk } from "./hunk.js";

const noCap = { limit: 0, rangeLines: 1, side: null } as const;

function added(count: number, from = 1): string[] {
  return Array.from({ length: count }, (_, i) => `+line ${from + i}`);
}

describe("trimDiffHunk", () => {
  it("keeps only the last block of changes", () => {
    const hunk = "@@ -1,3 +1,3 @@\n a\n-b\n+c\n d\n-e\n+f";
    expect(trimDiffHunk(hunk, noCap)).toBe("-e\n+f");
  });

  it("always drops the header", () => {
    expect(trimDiffHunk("@@ -0,0 +1,2 @@\n+a\n+b", noCap)).toBe("+a\n+b");
  });

  it("ignores a trailing newline", () => {
    expect(trimDiffHunk("@@ -1 +1 @@\n-a\n+b\n", noCap)).toBe("-a\n+b");
  });

  it("handles a hunk with no header", () => {
    expect(trimDiffHunk("-a\n+b", noCap)).toBe("-a\n+b");
  });

  it("shows the commented line when it is a context line", () => {
    expect(trimDiffHunk("@@ -1,2 +1,2 @@\n-a\n+b\n c", noCap)).toBe(" c");
  });

  it("does not truncate at or under the limit", () => {
    const hunk = ["@@ -0,0 +1,5 @@", ...added(5)].join("\n");
    expect(trimDiffHunk(hunk, { ...noCap, limit: 5 })).toBe(
      added(5).join("\n"),
    );
  });

  it("keeps the last N lines and notes the rest when over the limit", () => {
    const hunk = ["@@ -0,0 +1,30 @@", ...added(30)].join("\n");
    expect(trimDiffHunk(hunk, { ...noCap, limit: 3 })).toBe(
      ["… 27 more lines above", ...added(3, 28)].join("\n"),
    );
  });

  it("uses the singular for one omitted line", () => {
    const hunk = ["@@ -0,0 +1,4 @@", ...added(4)].join("\n");
    expect(trimDiffHunk(hunk, { ...noCap, limit: 3 }).split("\n")[0]).toBe(
      "… 1 more line above",
    );
  });

  it("does not count lines dropped by the last-block trim as omitted", () => {
    const hunk = ["@@ -1,9 +1,9 @@", " ctx", " ctx", ...added(6)].join("\n");
    expect(trimDiffHunk(hunk, { ...noCap, limit: 4 })).toBe(
      ["… 2 more lines above", ...added(4, 3)].join("\n"),
    );
  });

  it("never cuts into a multi-line comment range", () => {
    const hunk = ["@@ -0,0 +1,30 @@", ...added(30)].join("\n");
    const out = trimDiffHunk(hunk, {
      limit: 3,
      rangeLines: 8,
      side: "RIGHT",
    });
    expect(out.split("\n")).toEqual(["… 22 more lines above", ...added(8, 23)]);
  });

  it("counts the range on the comment's side only", () => {
    const hunk = [
      "@@ -1,4 +1,2 @@",
      "-gone 1",
      "-gone 2",
      "+kept 1",
      "-gone 3",
      "+kept 2",
    ].join("\n");
    // Two RIGHT-side lines: +kept 1 and +kept 2, with -gone 3 in between.
    const out = trimDiffHunk(hunk, { limit: 2, rangeLines: 2, side: "RIGHT" });
    expect(out.split("\n").slice(1)).toEqual(["+kept 1", "-gone 3", "+kept 2"]);
  });

  it("extends past the last-block heuristic to include the range", () => {
    const hunk = "@@ -1,4 +1,4 @@\n a\n b\n+c\n d\n+e";
    expect(trimDiffHunk(hunk, { limit: 0, rangeLines: 3, side: "RIGHT" })).toBe(
      "+c\n d\n+e",
    );
  });

  it("ignores “No newline” markers when counting", () => {
    const hunk = "@@ -1 +1,3 @@\n x\n-a\n+b\n+c\n\\ No newline at end of file";
    const out = trimDiffHunk(hunk, { limit: 2, rangeLines: 2, side: "RIGHT" });
    expect(out).toBe(
      "… 1 more line above\n+b\n+c\n\\ No newline at end of file",
    );
  });
});
