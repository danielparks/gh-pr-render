import { describe, expect, it } from "vitest";
import { renderPR } from "./render.js";
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
