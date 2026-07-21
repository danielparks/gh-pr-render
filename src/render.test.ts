import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  renderPR,
  blockquote,
  formatCloseStatus,
  formatReactions,
} from "./render.js";
import type { PRData, PullRequest, ReactionGroup } from "./types.js";

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

describe("renderPR - danielparks-test/gh-pr-render-fixtures #2", () => {
  const data = loadFixture("danielparks-test", "gh-pr-render-fixtures", 2);

  it("renders without minimized comments", async () => {
    await expect(
      renderPR(data, { includeMinimized: false }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks-test", "gh-pr-render-fixtures", 2, ""),
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

function basePull(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: "Test PR",
    state: "open",
    draft: false,
    body: null,
    user: { login: "alice" },
    head: { ref: "feature", sha: "abc123" },
    base: { ref: "main", sha: "def456" },
    html_url: "https://github.com/owner/repo/pull/1",
    created_at: "2026-01-01T00:00:00Z",
    closed_at: null,
    merged: false,
    merged_at: null,
    merged_by: null,
    labels: [],
    milestone: null,
    assignees: [],
    requested_reviewers: [],
    requested_teams: [],
    reactionGroups: [],
    ...overrides,
  };
}

describe("formatCloseStatus", () => {
  it("returns [] for an open PR", () => {
    expect(formatCloseStatus(basePull())).toEqual([]);
  });

  it("reports a merge with who merged it", () => {
    const pull = basePull({
      state: "closed",
      merged: true,
      merged_at: "2026-01-03T00:00:00Z",
      merged_by: { login: "bob" },
      closed_at: "2026-01-03T00:00:00Z",
    });
    expect(formatCloseStatus(pull)).toEqual([
      "**Merged:** 2 days later by bob",
    ]);
  });

  it("reports a merge without a merger as a fallback", () => {
    const pull = basePull({
      state: "closed",
      merged: true,
      merged_at: "2026-01-03T00:00:00Z",
      merged_by: null,
      closed_at: "2026-01-03T00:00:00Z",
    });
    expect(formatCloseStatus(pull)).toEqual(["**Merged:** 2 days later"]);
  });

  it("reports a close without a merge", () => {
    const pull = basePull({
      state: "closed",
      closed_at: "2026-01-02T00:00:00Z",
    });
    expect(formatCloseStatus(pull)).toEqual(["**Closed:** 1 day later"]);
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
