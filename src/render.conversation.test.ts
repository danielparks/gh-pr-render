import { describe, expect, it } from "vitest";
import { renderConversation, renderPR } from "./render.js";
import type { IssueComment, Review } from "./types.js";
import { basePRData } from "./test-helpers.js";

const renderOptions = {
  includeMinimized: false,
  includeFiles: false,
  includeCommits: false,
  commentHeadLimit: 2,
  commentTailLimit: 2,
};

const pullRequest = {
  number: 1,
  url: "https://github.com/owner/repo/pull/1",
  createdAt: "2026-01-01T00:00:00Z",
};

// Minute `n` after the PR was created.
function at(n: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();
}

function comment(id: number, minute: number, body = "comment"): IssueComment {
  return {
    databaseId: id,
    author: { login: "alice" },
    body,
    createdAt: at(minute),
    isMinimized: false,
    minimizedReason: null,
    reactionGroups: [],
  };
}

function review(
  id: number,
  minute: number,
  overrides: Partial<Review> = {},
): Review {
  return {
    id,
    user: { login: "bob" },
    state: "COMMENTED",
    body: `review ${id}`,
    submitted_at: at(minute),
    ...overrides,
  };
}

// Renders a PR where all comments fit in the fetched head and tail slices, the
// way the fetch code would provide them.
function render(
  comments: IssueComment[],
  reviews: Review[],
  options: Partial<typeof renderOptions> & { bodyLineLimit?: number } = {},
): string {
  const { commentHeadLimit, commentTailLimit } = {
    ...renderOptions,
    ...options,
  };
  return renderPR(
    basePRData({
      topComments: {
        totalCount: comments.length,
        nodes: comments.slice(0, commentHeadLimit),
        tailNodes: commentTailLimit ? comments.slice(-commentTailLimit) : [],
      },
      reviews,
    }),
    { ...renderOptions, ...options },
  );
}

// Which items appear, in order, e.g. ["c1", "r10", "omitted", "c5"].
function sequence(output: string): string[] {
  const found: [number, string][] = [];
  for (const m of output.matchAll(/^### Comment by .*\(id: (\d+)/gm)) {
    found.push([m.index, `c${m[1]}`]);
  }
  for (const m of output.matchAll(/^### Review by .*\n\n> review (\d+)/gm)) {
    found.push([m.index, `r${m[1]}`]);
  }
  for (const m of output.matchAll(
    /^### (?:Approval|Change request) by (\S+)[^\n]*\n\n> review (\d+)/gm,
  )) {
    found.push([m.index, `r${m[2]}`]);
  }
  for (const m of output.matchAll(
    /^### (\d+) (?:comments|comments and reviews) omitted/gm,
  )) {
    found.push([m.index, `omitted ${m[1]}`]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, label]) => label);
}

describe("renderPR - conversation truncation", () => {
  it("shows everything when comments and reviews fit together", () => {
    const output = render(
      [comment(1, 1), comment(2, 4)],
      [review(10, 2), review(11, 3)],
    );
    expect(sequence(output)).toEqual(["c1", "r10", "r11", "c2"]);
  });

  it("truncates comments and reviews as one chronological list", () => {
    // Combined: c1 r10 c2 r11 c3 r12 c4 r13 — head 2, tail 2.
    const comments = [
      comment(1, 1),
      comment(2, 3),
      comment(3, 5),
      comment(4, 7),
    ];
    const reviews = [
      review(10, 2),
      review(11, 4),
      review(12, 6),
      review(13, 8),
    ];
    const output = render(comments, reviews);
    expect(sequence(output)).toEqual(["c1", "r10", "omitted 4", "c4", "r13"]);
  });

  it("finds the right head and tail when reviews dominate one end", () => {
    // Combined: r10 r11 r12 c1 c2 c3 r13 r14. The first two are reviews, and
    // the last two are reviews, although every comment is in the middle.
    const comments = [comment(1, 4), comment(2, 5), comment(3, 6)];
    const reviews = [
      review(10, 1),
      review(11, 2),
      review(12, 3),
      review(13, 7),
      review(14, 8),
    ];
    const output = render(comments, reviews);
    expect(sequence(output)).toEqual(["r10", "r11", "omitted 4", "r13", "r14"]);
  });

  it("names both comments and reviews in the marker", () => {
    const output = render(
      [comment(1, 1), comment(2, 3), comment(3, 5)],
      [review(10, 2), review(11, 4), review(12, 6)],
    );
    expect(output).toContain(
      "### 2 comments and reviews omitted — run `gh-pr-render conversation https://github.com/owner/repo/pull/1` to see all",
    );
  });

  it("says only comments when there are no reviews", () => {
    const output = render(
      [1, 2, 3, 4, 5, 6].map((n) => comment(n, n)),
      [],
    );
    expect(output).toContain("### 2 comments omitted");
  });

  it("does not count empty COMMENTED reviews", () => {
    // Four comments plus one empty review that isn't shown: 4 <= 2 + 2.
    const output = render(
      [1, 2, 3, 4].map((n) => comment(n, n)),
      [review(10, 5, { body: "" })],
    );
    expect(output).not.toContain("omitted");
  });

  it("applies the head and tail limits to reviews alone", () => {
    const reviews = [1, 2, 3, 4, 5, 6].map((n) => review(n, n));
    const output = render([], reviews);
    expect(sequence(output)).toEqual(["r1", "r2", "omitted 2", "r5", "r6"]);
  });
});

describe("renderPR - pinned reviews", () => {
  const comments = [1, 2, 3, 4, 5, 6].map((n) => comment(n, n * 2));

  it("keeps a reviewer’s latest verdict from the omitted middle", () => {
    const output = render(comments, [
      review(10, 5, { state: "CHANGES_REQUESTED" }),
    ]);
    expect(sequence(output)).toEqual([
      "c1",
      "c2",
      "omitted 2",
      "r10",
      "c5",
      "c6",
    ]);
  });

  it("is not counted as omitted", () => {
    const output = render(comments, [
      review(10, 5, { state: "APPROVED", body: "" }),
    ]);
    expect(output).toContain("### 2 comments and reviews omitted");
    expect(output).toContain("### Approval by bob");
  });

  it("keeps only each reviewer’s latest verdict", () => {
    const output = render(comments, [
      review(10, 5, { state: "CHANGES_REQUESTED" }),
      review(11, 7, { state: "APPROVED" }),
    ]);
    expect(sequence(output)).not.toContain("r10");
    expect(sequence(output)).toContain("r11");
  });

  it("keeps verdicts from different reviewers", () => {
    const output = render(comments, [
      review(10, 5, { state: "CHANGES_REQUESTED" }),
      review(11, 7, { state: "APPROVED", user: { login: "carol" } }),
    ]);
    expect(sequence(output)).toEqual(expect.arrayContaining(["r10", "r11"]));
  });

  it("does not keep a dismissed review", () => {
    const output = render(comments, [
      review(10, 5, { state: "DISMISSED", body: "" }),
    ]);
    expect(output).not.toContain("Review dismissal");
  });

  it("does not keep plain review comments", () => {
    const output = render(comments, [review(10, 5)]);
    expect(sequence(output)).not.toContain("r10");
  });

  it("does not duplicate a verdict that is already shown", () => {
    const output = render(comments, [review(10, 1, { state: "APPROVED" })]);
    expect(output).toContainExactly("### Approval by bob", 1);
  });
});

describe("renderPR - review body line limit", () => {
  const body = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");

  it("cuts a long review body and names the conversation subcommand", () => {
    const output = render([], [review(10, 1, { body })], {
      bodyLineLimit: 3,
    });
    expect(output).not.toContain("line 4");
    expect(output).toContain(
      "\n\n… 7 more lines omitted — run `gh-pr-render conversation https://github.com/owner/repo/pull/1` to see all",
    );
  });
});

describe("renderConversation", () => {
  const data = (
    comments: IssueComment[],
    reviews: Review[],
  ): Parameters<typeof renderConversation>[0] => ({
    comments,
    reviews,
    pullRequest,
  });

  it("includes PR context header", () => {
    const output = renderConversation(data([comment(1, 1)], []), false);
    expect(output).toContain(
      "Part of [PR #1](https://github.com/owner/repo/pull/1)",
    );
  });

  it("interleaves every comment and review without truncation", () => {
    const comments = Array.from({ length: 50 }, (_, i) =>
      comment(i + 1, 2 * i),
    );
    const reviews = Array.from({ length: 50 }, (_, i) =>
      review(i + 1, 2 * i + 1),
    );
    const output = renderConversation(data(comments, reviews), false);
    expect(output).not.toContain("omitted");
    expect(sequence(output).slice(0, 4)).toEqual(["c1", "r1", "c2", "r2"]);
    expect(sequence(output)).toHaveLength(100);
  });

  it("skips empty COMMENTED reviews", () => {
    const output = renderConversation(
      data([], [review(10, 1, { body: "" }), review(11, 2)]),
      false,
    );
    expect(sequence(output)).toEqual(["r11"]);
  });

  it("skips minimized comments unless asked", () => {
    const comments = [
      comment(1, 1),
      { ...comment(2, 2), isMinimized: true, minimizedReason: "SPAM" },
    ];
    expect(renderConversation(data(comments, []), false)).not.toContain(
      "id: 2",
    );
    expect(renderConversation(data(comments, []), true)).toContain(
      "id: 2, minimized: SPAM",
    );
  });

  it("does not cut long bodies", () => {
    const long = Array(500).fill("x").join("\n");
    const output = renderConversation(
      data([comment(1, 1, long)], [review(10, 2, { body: long })]),
      false,
    );
    expect(output).not.toContain("omitted");
  });

  it("says so when there is nothing to show", () => {
    expect(renderConversation(data([], []), false)).toContain(
      "No comments or reviews.",
    );
  });
});
