import { describe, expect, it } from "vitest";
import {
  blockquote,
  formatState,
  formatReactions,
  renderCommits,
} from "./render.js";
import type { Commit, ReactionGroup } from "./types.js";
import { basePull } from "./test-helpers.js";

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

describe("formatState", () => {
  it("returns 'open' for an open PR", () => {
    expect(formatState(basePull())).toEqual("open");
  });

  it("reports a merge with who merged it", () => {
    const pull = basePull({
      state: "closed",
      merged: true,
      merged_at: "2026-01-03T00:00:00Z",
      merged_by: { login: "bob" },
      closed_at: "2026-01-03T00:00:00Z",
    });
    expect(formatState(pull)).toEqual("merged 2 days later by bob");
  });

  it("reports a merge without a merger as a fallback", () => {
    const pull = basePull({
      state: "closed",
      merged: true,
      merged_at: "2026-01-03T00:00:00Z",
      merged_by: null,
      closed_at: "2026-01-03T00:00:00Z",
    });
    expect(formatState(pull)).toEqual("merged 2 days later");
  });

  it("reports a merge without time metadata", () => {
    const pull = basePull({
      state: "closed",
      merged: true,
      merged_at: null,
      merged_by: null,
      closed_at: null,
    });
    expect(formatState(pull)).toEqual("merged");
  });

  it("reports a close without a merge", () => {
    const pull = basePull({
      state: "closed",
      merged: false,
      merged_at: null,
      merged_by: null,
      closed_at: "2026-01-02T00:00:00Z",
    });
    expect(formatState(pull)).toEqual("closed without merge 1 day later");
  });

  it("reports a close without a merge without time metadata", () => {
    const pull = basePull({
      state: "closed",
      merged: false,
      merged_at: null,
      merged_by: null,
      closed_at: null,
    });
    expect(formatState(pull)).toEqual("closed without merge");
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

function baseCommit(overrides: Partial<Commit> = {}): Commit {
  return {
    sha: "997eb921cd14895ba5f10e8610fb8a5658eb45e2",
    commit: { message: "Add feature", author: { name: "alice" } },
    author: { login: "alice" },
    ...overrides,
  };
}

describe("renderCommits", () => {
  it("returns just the heading for no commits", () => {
    expect(renderCommits([])).toEqual(["", "## Commits", "", "No commits."]);
  });

  it("shortens the sha and uses the message's first line as the subject", () => {
    const commit = baseCommit({
      commit: {
        message: "Add feature\n\nLonger explanation in the body.",
        author: { name: "alice" },
      },
    });
    expect(renderCommits([commit])).toEqual([
      "",
      "## Commits",
      "",
      "- `997eb92` Add feature (alice)",
    ]);
  });

  it("falls back to the git author name when there's no GitHub account", () => {
    const commit = baseCommit({
      author: null,
      commit: { message: "Bump dependency", author: { name: "bot-tool" } },
    });
    expect(renderCommits([commit])).toEqual([
      "",
      "## Commits",
      "",
      "- `997eb92` Bump dependency (bot-tool)",
    ]);
  });

  it("falls back to 'unknown' when neither author is available", () => {
    const commit = baseCommit({
      author: null,
      commit: { message: "Bump dependency", author: null },
    });
    expect(renderCommits([commit])).toEqual([
      "",
      "## Commits",
      "",
      "- `997eb92` Bump dependency (unknown)",
    ]);
  });

  it("lists multiple commits in order", () => {
    const commits = [
      baseCommit({
        sha: "zzzzzzz1234",
        commit: { message: "First", author: { name: "alice" } },
      }),
      baseCommit({
        sha: "aaaaaaa5678",
        commit: { message: "Second", author: { name: "alice" } },
      }),
    ];
    expect(renderCommits(commits)).toEqual([
      "",
      "## Commits",
      "",
      "- `zzzzzzz` First (alice)",
      "- `aaaaaaa` Second (alice)",
    ]);
  });
});
