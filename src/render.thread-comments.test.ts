import { describe, expect, it } from "vitest";
import { renderPR, renderSingleThread } from "./render.js";
import type { ReviewThread, ThreadComment } from "./types.js";
import { basePRData } from "./test-helpers.js";

const renderOptions = {
  includeMinimized: false,
  includeFiles: false,
  includeCommits: false,
  commentHeadLimit: 20,
  commentTailLimit: 20,
};

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

describe("renderPR - thread comment list truncation", () => {
  it("renders a comments in full when head and tail slices fully overlap", () => {
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
    expect(output).toContainExactly("## Discussion", 1);
    expect(output).toContainExactly("### Inline comment", 1);
    expect(output).toContainExactly("#### alice", 3);
    expect(output).not.toContain("comments omitted");
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 3)", 1);
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
    expect(output).not.toContain("comments omitted");
    expect(output).toContainExactly("#### alice", 25);
    for (let id = 1; id <= 25; id++) {
      expect(output).toContainExactly(`id: ${id})`, 1);
    }
  });

  it("displays comments omitted when totalCount exceeds head + tail", () => {
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
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 20)", 1);
    expect(output).toContainExactly("#### 110 comments omitted", 1);
    expect(output).toContainExactly("id: 131)", 1);
    expect(output).toContainExactly("id: 150)", 1);
    expect(output).not.toContain("id: 21)");
    expect(output).not.toContain("id: 130)");
  });

  it("includes the thread command hint in the omission message", () => {
    const thread = baseThread({
      id: "RT_kwDOExampleThread",
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
    expect(output).toContain(
      "#### 110 comments omitted — run `gh-pr-render thread RT_kwDOExampleThread` to see all",
    );
  });

  it("displays all comments when limits are exactly the number of comments fetched", () => {
    const thread = baseThread({
      comments: {
        totalCount: 10,
        nodes: manyThreadComments(10, 1),
        tailNodes: manyThreadComments(10, 26),
      },
    });
    const output = renderPR(basePRData({ reviewThreads: [thread] }), {
      ...renderOptions,
      commentHeadLimit: 10,
      commentTailLimit: 10,
    });
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 10)", 1);
    expect(output).not.toContain("id: 11)");
    expect(output).not.toContain("id: 45)");
    expect(output).not.toContain("comments omitted");
  });

  it("truncates comments when limits are smaller than the number of comments fetched", () => {
    const thread = baseThread({
      comments: {
        totalCount: 50,
        nodes: manyThreadComments(25, 1),
        tailNodes: manyThreadComments(25, 26),
      },
    });
    const output = renderPR(basePRData({ reviewThreads: [thread] }), {
      ...renderOptions,
      commentHeadLimit: 5,
      commentTailLimit: 5,
    });
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 5)", 1);
    expect(output).not.toContain("id: 6)");
    expect(output).not.toContain("id: 45)");
    expect(output).toContainExactly("#### 40 comments omitted", 1);
    expect(output).toContainExactly("id: 46)", 1);
    expect(output).toContainExactly("id: 50)", 1);
    expect(output).not.toContain("id: 51)");
  });

  it("shows only tail comments when head limit is 0", () => {
    const thread = baseThread({
      comments: {
        totalCount: 50,
        nodes: manyThreadComments(25, 1),
        tailNodes: manyThreadComments(25, 26),
      },
    });
    const output = renderPR(basePRData({ reviewThreads: [thread] }), {
      ...renderOptions,
      commentHeadLimit: 0,
      commentTailLimit: 5,
    });
    expect(output).not.toContain("id: 1)");
    expect(output).not.toContain("id: 45)");
    expect(output).toContainExactly("#### 45 comments omitted", 1);
    expect(output).toContainExactly("id: 46)", 1);
    expect(output).toContainExactly("id: 50)", 1);
    expect(output).not.toContain("id: 51)");
  });

  it("shows only head comments when tail limit is 0", () => {
    const thread = baseThread({
      comments: {
        totalCount: 50,
        nodes: manyThreadComments(25, 1),
        tailNodes: manyThreadComments(25, 26),
      },
    });
    const output = renderPR(basePRData({ reviewThreads: [thread] }), {
      ...renderOptions,
      commentHeadLimit: 5,
      commentTailLimit: 0,
    });
    expect(output).toContainExactly("id: 1)", 1);
    expect(output).toContainExactly("id: 5)", 1);
    expect(output).toContainExactly("#### 45 comments omitted", 1);
    expect(output).not.toContain("id: 6)");
  });

  it("shows nothing when head and tail limits are both 0", () => {
    const thread = baseThread({
      comments: {
        totalCount: 50,
        nodes: manyThreadComments(1, 1),
        tailNodes: manyThreadComments(0, 46),
      },
    });
    const output = renderPR(basePRData({ reviewThreads: [thread] }), {
      ...renderOptions,
      commentHeadLimit: 0,
      commentTailLimit: 0,
    });
    expect(output).not.toContain("## Discussion");
    expect(output).not.toContain("### Inline comment");
    expect(output).not.toContain("#### alice");
    expect(output).not.toContain("comments omitted");
  });
});

describe("renderSingleThread", () => {
  const pullRequest = {
    number: 42,
    url: "https://github.com/acme/widgets/pull/42",
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("includes PR context header linking to the pull request", () => {
    const thread = baseThread();
    const output = renderSingleThread(thread, pullRequest, false);
    expect(output).toContain(
      "Part of [PR #42](https://github.com/acme/widgets/pull/42)",
    );
  });

  it("renders all comments without truncation", () => {
    const thread = baseThread({
      comments: {
        totalCount: 5,
        nodes: manyThreadComments(5, 1),
        tailNodes: [],
      },
    });
    const output = renderSingleThread(thread, pullRequest, false);
    expect(output).not.toContain("comments omitted");
    for (let id = 1; id <= 5; id++) {
      expect(output).toContain(`id: ${id})`);
    }
  });

  it("includes the thread command hint only when comments are omitted via renderPR (not renderSingleThread)", () => {
    // renderSingleThread never omits — all comments are in `nodes`.
    const thread = baseThread({
      id: "THREAD_1",
      comments: {
        totalCount: 50,
        nodes: manyThreadComments(50, 1),
        tailNodes: [],
      },
    });
    const output = renderSingleThread(thread, pullRequest, false);
    expect(output).not.toContain("comments omitted");
    expect(output).toContainExactly("#### alice", 50);
  });
});

describe("renderPR - diff hunk limit", () => {
  const hunk = [
    "@@ -0,0 +1,30 @@",
    ...Array.from({ length: 30 }, (_, i) => `+l${i + 1}`),
  ].join("\n");
  const data = (thread: Partial<ReviewThread> = {}) =>
    basePRData({
      reviewThreads: [
        baseThread({
          comments: {
            totalCount: 1,
            nodes: [baseThreadComment({ diffHunk: hunk })],
            tailNodes: [],
          },
          ...thread,
        }),
      ],
    });

  it("caps the hunk at the default limit with an omitted note", () => {
    const out = renderPR(data(), renderOptions);
    expect(out).toContain("… 20 more lines above\n+l21\n");
    expect(out).not.toContain("+l20\n");
    expect(out).toContain("+l21\n");
  });

  it("honors a custom limit, and 0 for unlimited", () => {
    expect(renderPR(data(), { ...renderOptions, diffHunkLimit: 2 })).toContain(
      "… 28 more lines above\n+l29\n+l30\n",
    );
    expect(renderPR(data(), { ...renderOptions, diffHunkLimit: 0 })).toContain(
      "```diff\n+l1\n+l2\n",
    );
  });

  it("keeps the whole commented range from the thread's original lines", () => {
    const out = renderPR(
      data({ originalStartLine: 5, originalLine: 30, diffSide: "RIGHT" }),
      renderOptions,
    );
    expect(out).toContain("… 4 more lines above\n+l5\n");
  });

  it("applies the limit to renderSingleThread", () => {
    const out = renderSingleThread(
      data().reviewThreads[0]!,
      {
        number: 1,
        url: "https://example.com/1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      false,
      3,
    );
    expect(out).toContain("… 27 more lines above");
  });
});

describe("renderPR - thread location", () => {
  const location = (thread: Partial<ReviewThread>): string => {
    const out = renderPR(
      basePRData({ reviewThreads: [baseThread(thread)] }),
      renderOptions,
    );
    return /### Inline comment on (.*?) \(id:/.exec(out)?.[1] ?? "";
  };

  it("shows a single line", () => {
    expect(location({ line: 10 })).toBe("`file.py` line 10");
  });

  it("shows a multi-line range", () => {
    expect(location({ line: 10, startLine: 4 })).toBe("`file.py` lines 4–10");
  });

  it("falls back to the original lines for outdated threads", () => {
    expect(
      location({ line: null, originalLine: 12, originalStartLine: 8 }),
    ).toBe("`file.py` lines 8–12 (when commented)");
  });

  it("notes comments on the old side of the diff", () => {
    expect(location({ line: 10, diffSide: "LEFT" })).toBe(
      "`file.py` line 10 (old file)",
    );
    expect(location({ line: null, originalLine: 3, diffSide: "LEFT" })).toBe(
      "`file.py` line 3 (when commented, old file)",
    );
  });

  it("labels both ends of a range that spans both sides", () => {
    expect(
      location({
        line: 9,
        startLine: 5,
        diffSide: "RIGHT",
        startDiffSide: "LEFT",
      }),
    ).toBe("`file.py` lines 5 (old file) – 9 (new file)");
    expect(
      location({
        line: null,
        originalLine: 3,
        originalStartLine: 40,
        diffSide: "RIGHT",
        startDiffSide: "LEFT",
      }),
    ).toBe("`file.py` lines 40 (old file) – 3 (new file) (when commented)");
  });

  it("recognizes a range across sides with the same line number", () => {
    expect(
      location({
        line: 9,
        startLine: 9,
        diffSide: "RIGHT",
        startDiffSide: "LEFT",
      }),
    ).toBe("`file.py` lines 9 (old file) – 9 (new file)");
  });

  it("shows just the path when no line is known", () => {
    expect(location({ line: null })).toBe("`file.py`");
  });
});

describe("renderPR - thread body line limit", () => {
  const body = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
  const thread = baseThread({
    comments: {
      totalCount: 1,
      nodes: [baseThreadComment({ body })],
      tailNodes: [],
    },
  });

  it("cuts a long body and names the thread subcommand", () => {
    const output = renderPR(basePRData({ reviewThreads: [thread] }), {
      ...renderOptions,
      bodyLineLimit: 3,
    });
    expect(output).not.toContain("line 4");
    expect(output).toContain(
      "\n\n… 7 more lines omitted — run `gh-pr-render thread THREAD_1` to see all",
    );
  });

  it("is not applied by renderSingleThread", () => {
    const output = renderSingleThread(
      thread,
      {
        number: 1,
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      false,
    );
    expect(output).toContain("> line 10");
    expect(output).not.toContain("omitted");
  });
});

describe("renderPR - collapsed resolved threads", () => {
  const resolved = baseThread({
    isResolved: true,
    comments: {
      totalCount: 3,
      nodes: [
        baseThreadComment({ databaseId: 1, body: "First line\nsecond line" }),
        baseThreadComment({ databaseId: 2, body: "reply" }),
        baseThreadComment({ databaseId: 3, body: "another reply" }),
      ],
      tailNodes: [],
    },
  });

  it("collapses a resolved thread to its first comment’s first line", () => {
    const output = renderPR(
      basePRData({ reviewThreads: [resolved] }),
      renderOptions,
    );
    expect(output).toContain(
      "### Inline comment on `file.py` line 10 (id: THREAD_1, resolved):",
    );
    expect(output).toContain("(id: 1):\n\n> First line …");
    expect(output).not.toContain("second line");
    expect(output).not.toContain("id: 2");
    expect(output).not.toContain("```diff");
    expect(output).toContain(
      "Collapsed (3 comments) — run `gh-pr-render thread THREAD_1` to see all",
    );
  });

  it("does not add an ellipsis to a one-line summary", () => {
    const thread = baseThread({
      isResolved: true,
      comments: {
        totalCount: 1,
        nodes: [baseThreadComment({ body: "Done" })],
        tailNodes: [],
      },
    });
    const output = renderPR(
      basePRData({ reviewThreads: [thread] }),
      renderOptions,
    );
    expect(output).toContain("> Done\n");
    expect(output).toContain("Collapsed (1 comment)");
  });

  it("shortens a very long first line", () => {
    const thread = baseThread({
      isResolved: true,
      comments: {
        totalCount: 1,
        nodes: [baseThreadComment({ body: "x".repeat(500) })],
        tailNodes: [],
      },
    });
    const output = renderPR(
      basePRData({ reviewThreads: [thread] }),
      renderOptions,
    );
    expect(output).toContain(`> ${"x".repeat(200)} …\n`);
  });

  it("renders resolved threads in full when asked", () => {
    const output = renderPR(basePRData({ reviewThreads: [resolved] }), {
      ...renderOptions,
      collapseResolved: false,
    });
    expect(output).toContain("```diff");
    expect(output).toContain("second line");
    expect(output).not.toContain("Collapsed");
  });

  it("leaves unresolved threads alone, even when outdated", () => {
    const output = renderPR(
      basePRData({
        reviewThreads: [baseThread({ isOutdated: true })],
      }),
      renderOptions,
    );
    expect(output).toContain("```diff");
    expect(output).not.toContain("Collapsed");
  });

  it("is not applied by renderSingleThread", () => {
    const output = renderSingleThread(
      resolved,
      {
        number: 1,
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      false,
    );
    expect(output).toContain("second line");
    expect(output).toContain("id: 3)");
    expect(output).not.toContain("Collapsed");
  });
});
