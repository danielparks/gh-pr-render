import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { renderPR, blockquote, formatReactions } from "./render.js";
import type { PRData, ReactionGroup } from "./types.js";

function loadFixture(owner: string, repo: string, prNumber: number): PRData {
  const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));
  const path = join(fixturesDir, owner, repo, `${prNumber}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as PRData;
}

function snapshotPath(
  owner: string,
  repo: string,
  prNumber: number,
  variant: string,
): string {
  const snapshotsDir = fileURLToPath(new URL("../snapshots", import.meta.url));
  return join(snapshotsDir, `${owner}-${repo}-${prNumber}${variant}.md`);
}

describe("renderPR - danielparks/htmlize #66", () => {
  const data = loadFixture("danielparks", "htmlize", 66);

  it("renders without minimized comments", async () => {
    await expect(
      renderPR(data, { includeMinimized: false }),
    ).toMatchFileSnapshot(snapshotPath("danielparks", "htmlize", 66, ""));
  });

  it("renders with minimized comments", async () => {
    await expect(
      renderPR(data, { includeMinimized: true }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks", "htmlize", 66, ".with-minimized"),
    );
  });
});

describe("renderPR - danielparks-test/gh-pr-render-fixtures #1", () => {
  const data = loadFixture("danielparks-test", "gh-pr-render-fixtures", 1);

  it("renders without minimized comments", async () => {
    await expect(
      renderPR(data, { includeMinimized: false }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks-test", "gh-pr-render-fixtures", 1, ""),
    );
  });

  it("renders with minimized comments", async () => {
    await expect(
      renderPR(data, { includeMinimized: true }),
    ).toMatchFileSnapshot(
      snapshotPath(
        "danielparks-test",
        "gh-pr-render-fixtures",
        1,
        ".with-minimized",
      ),
    );
  });
});

describe("formatReactions", () => {
  it("returns [] for no groups", () => {
    expect(formatReactions([], "#### Reactions")).toEqual([]);
  });

  it("returns [] when every group is empty", () => {
    const groups: ReactionGroup[] = [
      { content: "THUMBS_UP", reactors: { totalCount: 0, nodes: [] } },
    ];
    expect(formatReactions(groups, "#### Reactions")).toEqual([]);
  });

  it("lists reactor logins for a single group", () => {
    const groups: ReactionGroup[] = [
      {
        content: "THUMBS_UP",
        reactors: {
          totalCount: 2,
          nodes: [{ login: "alice" }, { login: "bob" }],
        },
      },
    ];
    expect(formatReactions(groups, "#### Reactions")).toEqual([
      "",
      "#### Reactions",
      "",
      "- 👍 alice, bob",
    ]);
  });

  it("notes remaining reactors past the fetched cap", () => {
    const groups: ReactionGroup[] = [
      {
        content: "HOORAY",
        reactors: {
          totalCount: 8,
          nodes: [{ login: "alice" }, { login: "bob" }],
        },
      },
    ];
    expect(formatReactions(groups, "#### Reactions")).toEqual([
      "",
      "#### Reactions",
      "",
      "- 🎉 alice, bob (+6 more)",
    ]);
  });

  it("skips empty groups but keeps non-empty ones", () => {
    const groups: ReactionGroup[] = [
      { content: "THUMBS_DOWN", reactors: { totalCount: 0, nodes: [] } },
      {
        content: "EYES",
        reactors: { totalCount: 1, nodes: [{ login: "carol" }] },
      },
    ];
    expect(formatReactions(groups, "#### Reactions")).toEqual([
      "",
      "#### Reactions",
      "",
      "- 👀 carol",
    ]);
  });

  it("renders multiple groups as separate bullets", () => {
    const groups: ReactionGroup[] = [
      {
        content: "THUMBS_UP",
        reactors: { totalCount: 1, nodes: [{ login: "alice" }] },
      },
      {
        content: "HOORAY",
        reactors: { totalCount: 1, nodes: [{ login: "bob" }] },
      },
    ];
    expect(formatReactions(groups, "#### Reactions")).toEqual([
      "",
      "#### Reactions",
      "",
      "- 👍 alice",
      "- 🎉 bob",
    ]);
  });

  it("uses the provided heading", () => {
    const groups: ReactionGroup[] = [
      {
        content: "ROCKET",
        reactors: { totalCount: 1, nodes: [{ login: "alice" }] },
      },
    ];
    expect(formatReactions(groups, "## Reactions")).toEqual([
      "",
      "## Reactions",
      "",
      "- 🚀 alice",
    ]);
  });
});

describe("blockquote", () => {
  it("quotes empty string", () => {
    expect(blockquote("")).toEqual(">");
  });

  it("quotes string without newlines", () => {
    expect(blockquote("abc")).toEqual("> abc");
  });

  it("quotes single newline", () => {
    expect(blockquote("\n")).toEqual(">");
  });

  it("quotes single line", () => {
    expect(blockquote("abc\n")).toEqual("> abc");
  });

  it("quotes multiple lines", () => {
    expect(blockquote("abc\ndef\nghi\n")).toEqual("> abc\n> def\n> ghi");
  });

  it("quotes middle empty line", () => {
    expect(blockquote("first\n\nthird")).toEqual("> first\n>\n> third");
  });

  it("quotes middle whitespace line", () => {
    expect(blockquote("first\n  \nthird")).toEqual("> first\n>   \n> third");
  });

  it("quotes single line (CRLF)", () => {
    expect(blockquote("abc\r\n")).toEqual("> abc");
  });

  it("quotes multiple lines (CRLF)", () => {
    expect(blockquote("abc\r\ndef\r\nghi\r\n")).toEqual("> abc\n> def\n> ghi");
  });

  it("quotes middle empty line (CRLF)", () => {
    expect(blockquote("first\r\n\r\nthird")).toEqual("> first\n>\n> third");
  });

  it("quotes middle whitespace line (CRLF)", () => {
    expect(blockquote("first\r\n  \r\nthird")).toEqual(
      "> first\n>   \n> third",
    );
  });
});
