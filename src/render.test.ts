import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  renderPR,
  blockquote,
  formatState,
  formatReactions,
  renderCommits,
} from "./render.js";
import {
  DEFAULT_COMMENT_HEAD_LIMIT,
  DEFAULT_COMMENT_TAIL_LIMIT,
} from "./limits.js";
import type {
  Commit,
  IssueComment,
  PRData,
  PullRequest,
  ReactionGroup,
  ReviewThread,
  ThreadComment,
} from "./types.js";

const defaultCommentLimits = {
  commentHeadLimit: DEFAULT_COMMENT_HEAD_LIMIT,
  commentTailLimit: DEFAULT_COMMENT_TAIL_LIMIT,
};

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
      renderPR(data, {
        includeMinimized: false,
        includeFiles: true,
        includeCommits: true,
        ...defaultCommentLimits,
      }),
    ).toMatchFileSnapshot(snapshotPath("danielparks", "htmlize", 66, ""));
  });

  it("renders with minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: true,
        includeFiles: true,
        includeCommits: true,
        ...defaultCommentLimits,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks", "htmlize", 66, ".with-minimized"),
    );
  });
});

describe("renderPR - danielparks-test/gh-pr-render-fixtures #1", () => {
  const data = loadFixture("danielparks-test", "gh-pr-render-fixtures", 1);

  it("renders without minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: true,
        includeCommits: true,
        ...defaultCommentLimits,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks-test", "gh-pr-render-fixtures", 1, ""),
    );
  });

  it("renders with minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: true,
        includeFiles: true,
        includeCommits: true,
        ...defaultCommentLimits,
      }),
    ).toMatchFileSnapshot(
      snapshotPath(
        "danielparks-test",
        "gh-pr-render-fixtures",
        1,
        ".with-minimized",
      ),
    );
  });

  it("renders without the changed-files list", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: false,
        includeCommits: true,
        ...defaultCommentLimits,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks-test", "gh-pr-render-fixtures", 1, ".no-files"),
    );
  });

  it("renders without the commits list", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: true,
        includeCommits: false,
        ...defaultCommentLimits,
      }),
    ).toMatchFileSnapshot(
      snapshotPath(
        "danielparks-test",
        "gh-pr-render-fixtures",
        1,
        ".no-commits",
      ),
    );
  });

  it("renders without either the changed-files or commits list", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: false,
        includeCommits: false,
        ...defaultCommentLimits,
      }),
    ).toMatchFileSnapshot(
      snapshotPath(
        "danielparks-test",
        "gh-pr-render-fixtures",
        1,
        ".no-files-no-commits",
      ),
    );
  });
});

describe("renderPR - danielparks-test/gh-pr-render-fixtures #2", () => {
  const data = loadFixture("danielparks-test", "gh-pr-render-fixtures", 2);

  it("renders without minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: true,
        includeCommits: true,
        ...defaultCommentLimits,
      }),
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

function baseThreadComment(
  overrides: Partial<ThreadComment> = {},
): ThreadComment {
  return {
    databaseId: 1,
    author: { login: "alice" },
    body: "comment",
    createdAt: "2026-01-01T00:00:00Z",
    isMinimized: false,
    minimizedReason: null,
    diffHunk: "@@ -1,1 +1,1 @@\n-old\n+new\n",
    reactionGroups: [],
    ...overrides,
  };
}

function manyThreadComments(count: number, startId: number): ThreadComment[] {
  return Array.from({ length: count }, (_, i) =>
    baseThreadComment({
      databaseId: startId + i,
      createdAt: `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`,
    }),
  );
}

function baseIssueComment(overrides: Partial<IssueComment> = {}): IssueComment {
  return {
    databaseId: 1,
    author: { login: "alice" },
    body: "comment",
    createdAt: "2026-01-01T00:00:00Z",
    isMinimized: false,
    minimizedReason: null,
    reactionGroups: [],
    ...overrides,
  };
}

function manyIssueComments(count: number, startId: number): IssueComment[] {
  return Array.from({ length: count }, (_, i) =>
    baseIssueComment({
      databaseId: startId + i,
      createdAt: `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`,
    }),
  );
}

function baseThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "THREAD_1",
    isResolved: false,
    isOutdated: false,
    path: "file.py",
    line: 10,
    comments: {
      totalCount: 1,
      nodes: manyThreadComments(1, 1),
      tailNodes: manyThreadComments(1, 1),
    },
    ...overrides,
  };
}

function basePRData(overrides: Partial<PRData> = {}): PRData {
  return {
    pull: basePull(),
    files: [],
    commits: [],
    topComments: { totalCount: 0, nodes: [], tailNodes: [] },
    reviews: [],
    reviewThreads: [],
    ...overrides,
  };
}

const renderOptions = {
  includeMinimized: false,
  includeFiles: false,
  includeCommits: false,
  ...defaultCommentLimits,
};

describe("renderPR - comment list truncation", () => {
  it("renders a thread's comments in full when head and tail slices fully overlap", () => {
    // A thread this small: both the head(20) and tail(20) queries return
    // all 3 comments, so the slices are identical, not just overlapping.
    const thread = baseThread({
      comments: {
        totalCount: 3,
        nodes: manyThreadComments(3, 1),
        tailNodes: manyThreadComments(3, 1),
      },
    });
    const output = renderPR(
      basePRData({ reviewThreads: [thread] }),
      renderOptions,
    );
    expect(output).not.toContain("omitted");
    expect(output).toContain("id: 1)");
    expect(output).toContain("id: 3)");
  });

  it("reconciles partially overlapping head/tail slices without duplicating comments", () => {
    // totalCount(25) exceeds the head limit(20) alone, but not head + tail
    // (40), so the head(1-20) and tail(6-25) queries partially overlap
    // (6-20) — every comment should still appear exactly once, in order.
    const thread = baseThread({
      comments: {
        totalCount: 25,
        nodes: manyThreadComments(20, 1),
        tailNodes: manyThreadComments(20, 6),
      },
    });
    const output = renderPR(
      basePRData({ reviewThreads: [thread] }),
      renderOptions,
    );
    expect(output).not.toContain("omitted");
    for (let id = 1; id <= 25; id++) {
      expect(output.match(new RegExp(`\\(id: ${id}\\)`, "g"))).toHaveLength(1);
    }
  });

  it("truncates a thread's comments to head and tail when totalCount exceeds head + tail", () => {
    const thread = baseThread({
      comments: {
        totalCount: 150,
        nodes: manyThreadComments(20, 1),
        tailNodes: manyThreadComments(20, 131),
      },
    });
    const output = renderPR(
      basePRData({ reviewThreads: [thread] }),
      renderOptions,
    );
    expect(output).toContain("id: 1)");
    expect(output).toContain("id: 20)");
    expect(output).toContain("#### 110 comments omitted");
    expect(output).toContain("id: 131)");
    expect(output).toContain("id: 150)");
    expect(output).not.toContain("id: 21)");
    expect(output).not.toContain("id: 130)");
  });

  it("truncates top-level PR comments to head and tail", () => {
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 50,
          nodes: manyIssueComments(20, 1),
          tailNodes: manyIssueComments(20, 31),
        },
      }),
      renderOptions,
    );
    expect(output).toContain("id: 1)");
    expect(output).toContain("id: 20)");
    expect(output).toContain("### 10 comments omitted");
    expect(output).toContain("id: 31)");
    expect(output).toContain("id: 50)");
    expect(output).not.toContain("id: 21)");
  });
});
