import { describe, expect, it } from "vitest";
import { renderAllTopComments, renderPR } from "./render.js";
import type { IssueComment } from "./types.js";
import { basePRData } from "./test-helpers.js";

const renderOptions = {
  includeMinimized: false,
  includeFiles: false,
  includeCommits: false,
  commentHeadLimit: 20,
  commentTailLimit: 20,
};

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

describe("renderPR - top-level comment list truncation", () => {
  it("renders a comments in full when head and tail slices fully overlap", () => {
    // A thread this small: both the head(20) and tail(20) queries return
    // all 3 comments, so the slices are identical, not just overlapping.
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 3,
          nodes: manyIssueComments(3, 1),
          tailNodes: manyIssueComments(3, 1),
        },
      }),
      renderOptions,
    );
    expect(output).toContainExactly("## Discussion", 1);
    expect(output).toContainExactly("### Comment by alice", 3);
    expect(output).not.toContain("comments omitted");
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 3)", 1);
    expect(output).not.toContain("id: 4)");
  });

  it("reconciles partially overlapping head/tail slices without duplicating comments", () => {
    // totalCount(25) exceeds the head limit(20) alone, but not head + tail
    // (40), so the head(1-20) and tail(6-25) queries partially overlap
    // (6-20) — every comment should still appear exactly once, in order.
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 25,
          nodes: manyIssueComments(20, 1),
          tailNodes: manyIssueComments(20, 6),
        },
      }),
      renderOptions,
    );
    expect(output).toContainExactly("### Comment by alice", 25);
    expect(output).not.toContain("comments omitted");
    for (let id = 1; id <= 25; id++) {
      expect(output).toContainExactly(`id: ${id})`, 1);
    }
  });

  it("displays comments omitted when totalCount exceeds head + tail", () => {
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 150,
          nodes: manyIssueComments(20, 1),
          tailNodes: manyIssueComments(20, 131),
        },
      }),
      renderOptions,
    );
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 20)", 1);
    expect(output).toContainExactly("### 110 comments omitted", 1);
    expect(output).toContainExactly("id: 131)", 1);
    expect(output).toContainExactly("id: 150)", 1);
    expect(output).not.toContain("id: 21)");
    expect(output).not.toContain("id: 130)");
  });

  it("displays all comments when limits are exactly the number of comments fetched", () => {
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 10,
          nodes: manyIssueComments(10, 1),
          tailNodes: manyIssueComments(10, 26),
        },
      }),
      {
        ...renderOptions,
        commentHeadLimit: 10,
        commentTailLimit: 10,
      },
    );
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 10)", 1);
    expect(output).not.toContain("id: 11)");
    expect(output).not.toContain("id: 45)");
    expect(output).not.toContain("comments omitted");
  });

  it("truncates comments when limits are smaller than the number of comments fetched", () => {
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 50,
          nodes: manyIssueComments(25, 1),
          tailNodes: manyIssueComments(25, 26),
        },
      }),
      {
        ...renderOptions,
        commentHeadLimit: 5,
        commentTailLimit: 5,
      },
    );
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 5)", 1);
    expect(output).not.toContain("id: 6)");
    expect(output).not.toContain("id: 45)");
    expect(output).toContainExactly("### 40 comments omitted", 1);
    expect(output).toContainExactly("id: 46)", 1);
    expect(output).toContainExactly("id: 50)", 1);
    expect(output).not.toContain("id: 51)");
  });

  it("shows only tail comments when head limit is 0", () => {
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 50,
          nodes: manyIssueComments(25, 1),
          tailNodes: manyIssueComments(25, 26),
        },
      }),
      {
        ...renderOptions,
        commentHeadLimit: 0,
        commentTailLimit: 5,
      },
    );
    expect(output).not.toContain("id: 1)");
    expect(output).not.toContain("id: 45)");
    expect(output).toContainExactly("### 45 comments omitted", 1);
    expect(output).toContainExactly("id: 46)", 1);
    expect(output).toContainExactly("id: 50)", 1);
    expect(output).not.toContain("id: 51)");
  });

  it("shows only head comments when tail limit is 0", () => {
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 50,
          nodes: manyIssueComments(25, 1),
          tailNodes: manyIssueComments(25, 26),
        },
      }),
      {
        ...renderOptions,
        commentHeadLimit: 5,
        commentTailLimit: 0,
      },
    );
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 5)", 1);
    expect(output).toContainExactly("### 45 comments omitted", 1);
    expect(output).not.toContain("id: 6)");
  });

  it("shows nothing when head and tail limits are both 0", () => {
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 50,
          nodes: manyIssueComments(1, 1),
          tailNodes: manyIssueComments(0, 46),
        },
      }),
      {
        ...renderOptions,
        commentHeadLimit: 0,
        commentTailLimit: 0,
      },
    );
    expect(output).not.toContain("## Discussion");
    expect(output).not.toContain("### Comment by alice");
    expect(output).not.toContain("### Inline comment");
    expect(output).not.toContain("#### alice");
    expect(output).not.toContain("comments omitted");
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
      {
        ...renderOptions,
        commentHeadLimit: 5,
        commentTailLimit: 5,
      },
    );
    expect(output).toContainExactly("### Comment by alice", 10);
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 5)", 1);
    expect(output).not.toContain("id: 6)");
    expect(output).toContainExactly("### 40 comments omitted", 1);
    expect(output).not.toContain("id: 45)");
    expect(output).toContainExactly("id: 46)", 1);
    expect(output).toContainExactly("id: 50)", 1);
  });
});

describe("renderPR - omitted comments marker", () => {
  it("names the comments subcommand with the PR URL", () => {
    const output = renderPR(
      basePRData({
        topComments: {
          totalCount: 100,
          nodes: manyIssueComments(20, 1),
          tailNodes: manyIssueComments(20, 81),
        },
      }),
      renderOptions,
    );
    expect(output).toContain(
      "### 60 comments omitted — run `gh-pr-render comments https://github.com/owner/repo/pull/1` to see all",
    );
  });
});

describe("renderAllTopComments", () => {
  const pullRequest = {
    number: 42,
    url: "https://github.com/acme/widgets/pull/42",
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("includes PR context header and every comment without truncation", () => {
    const output = renderAllTopComments(
      manyIssueComments(50, 1),
      pullRequest,
      false,
    );
    expect(output).toContain(
      "Part of [PR #42](https://github.com/acme/widgets/pull/42)",
    );
    expect(output).not.toContain("comments omitted");
    for (let id = 1; id <= 50; id++) {
      expect(output).toContain(`(id: ${id}):`);
    }
  });

  it("skips minimized comments unless asked", () => {
    const comments = [
      baseIssueComment({ databaseId: 1 }),
      baseIssueComment({
        databaseId: 2,
        isMinimized: true,
        minimizedReason: "SPAM",
      }),
    ];
    const hidden = renderAllTopComments(comments, pullRequest, false);
    expect(hidden).not.toContain("id: 2");
    const shown = renderAllTopComments(comments, pullRequest, true);
    expect(shown).toContain("id: 2, minimized: SPAM");
  });

  it("says so when there are no comments", () => {
    expect(renderAllTopComments([], pullRequest, false)).toContain(
      "No comments.",
    );
  });
});

describe("renderPR - body line limit", () => {
  const longBody = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join(
    "\n",
  );
  const render = (bodyLineLimit?: number, body = longBody): string =>
    renderPR(
      basePRData({
        topComments: {
          totalCount: 1,
          nodes: [baseIssueComment({ body })],
          tailNodes: [],
        },
      }),
      bodyLineLimit === undefined
        ? renderOptions
        : { ...renderOptions, bodyLineLimit },
    );

  it("cuts a long body and says how to see the rest", () => {
    const output = render(3);
    expect(output).toContain("> line 3\n");
    expect(output).not.toContain("line 4");
    expect(output).toContain(
      "\n\n… 7 more lines omitted — run `gh-pr-render comments https://github.com/owner/repo/pull/1` to see all",
    );
  });

  it("uses the singular for one omitted line", () => {
    expect(render(9)).toContain("… 1 more line omitted");
  });

  it("leaves a body at exactly the limit alone", () => {
    const output = render(10);
    expect(output).toContain("> line 10");
    expect(output).not.toContain("omitted");
  });

  it("does not limit with 0", () => {
    const output = render(0, Array(500).fill("x").join("\n"));
    expect(output).not.toContain("omitted");
  });

  it("has a default limit", () => {
    const output = render(undefined, Array(500).fill("x").join("\n"));
    expect(output).toContain("… 450 more lines omitted");
  });

  it("is not applied by the comments subcommand", () => {
    const output = renderAllTopComments(
      [baseIssueComment({ body: Array(500).fill("x").join("\n") })],
      {
        number: 1,
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      false,
    );
    expect(output).not.toContain("omitted");
  });
});
