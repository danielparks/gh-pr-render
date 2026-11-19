import { describe, expect, it } from "vitest";
import { trimDiffHunk } from "./hunk.js";

const noCap = { limit: 0, start: null } as const;

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
      start: { line: 23, side: "RIGHT" },
    });
    expect(out.split("\n")).toEqual(["… 22 more lines above", ...added(8, 23)]);
  });

  it("finds the start when the other side is interleaved in the middle", () => {
    const hunk = [
      "@@ -1,3 +1,2 @@",
      "-gone 1",
      "-gone 2",
      "+kept 1",
      "-gone 3",
      "+kept 2",
    ].join("\n");
    // New-side lines 1–2 are `+kept 1` and `+kept 2`, with `-gone 3` between.
    const out = trimDiffHunk(hunk, {
      limit: 2,
      start: { line: 1, side: "RIGHT" },
    });
    expect(out).toBe("… 2 more lines above\n+kept 1\n-gone 3\n+kept 2");
  });

  it("finds a start on a different side than the end", () => {
    const hunk = [
      "@@ -1,3 +1,2 @@",
      "-gone 1",
      "-gone 2",
      "+kept 1",
      "-gone 3",
      "+kept 2",
    ].join("\n");
    // Old-side line 2 is `-gone 2`; the comment ends on `+kept 2`.
    const out = trimDiffHunk(hunk, {
      limit: 2,
      start: { line: 2, side: "LEFT" },
    });
    expect(out).toBe("… 1 more line above\n-gone 2\n+kept 1\n-gone 3\n+kept 2");
  });

  it("numbers context lines on both sides", () => {
    const hunk = "@@ -5,3 +10,3 @@\n a\n-b\n+c\n d\n+e";
    // New-side 10 is ` a`, old-side 6 is `-b`.
    const right = { limit: 0, start: { line: 10, side: "RIGHT" } } as const;
    const left = { limit: 0, start: { line: 6, side: "LEFT" } } as const;
    expect(trimDiffHunk(hunk, right)).toBe(" a\n-b\n+c\n d\n+e");
    expect(trimDiffHunk(hunk, left)).toBe("-b\n+c\n d\n+e");
  });

  it("assumes the last line if the start isn’t in the hunk", () => {
    const hunk = ["@@ -0,0 +1,30 @@", ...added(30)].join("\n");
    const out = trimDiffHunk(hunk, {
      limit: 3,
      start: { line: 99, side: "RIGHT" },
    });
    expect(out).toBe(["… 27 more lines above", ...added(3, 28)].join("\n"));
  });

  it("assumes the last line if there is no header to number lines by", () => {
    const out = trimDiffHunk(added(10).join("\n"), {
      limit: 2,
      start: { line: 3, side: "RIGHT" },
    });
    expect(out).toBe("… 8 more lines above\n+line 9\n+line 10");
  });

  it("ignores “No newline” markers when numbering and ending", () => {
    const hunk = "@@ -1 +1,3 @@\n x\n-a\n+b\n+c\n\\ No newline at end of file";
    // New-side 2 is `+b`.
    const out = trimDiffHunk(hunk, {
      limit: 2,
      start: { line: 2, side: "RIGHT" },
    });
    expect(out).toBe(
      "… 1 more line above\n+b\n+c\n\\ No newline at end of file",
    );
  });

  it("shows only the last line when there’s a marker and no range", () => {
    const hunk = "@@ -1 +1,2 @@\n x\n+b\n\\ No newline at end of file";
    expect(trimDiffHunk(hunk, { limit: 1, start: null })).toBe(
      "+b\n\\ No newline at end of file",
    );
  });
});
