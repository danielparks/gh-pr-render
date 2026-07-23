import { graphql } from "@octokit/graphql";
import { describe, expect, it } from "vitest";
import {
  fetchReviewThreads,
  fetchSingleThread,
  fetchTopComments,
} from "./fetch.js";
import type { IssueComment, ReactionGroup, ThreadComment } from "./types.js";

// Wraps a GraphQL response body the way GitHub's API does: the actual
// payload lives under `data`, which @octokit/graphql unwraps for us.
function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type FetchCall = { url: string; variables: Record<string, unknown> };

// Builds a graphql client whose HTTP layer is replaced with `handler`, via
// @octokit's documented `request.fetch` override (see RequestRequestOptions
// in @octokit/types: "Custom replacement for built-in fetch method. Useful
// for testing or request hooks."). This runs fetch.ts's real query strings
// and response-mapping code against a canned response, rather than
// re-implementing that logic in a mock.
function mockClient(handler: (call: FetchCall) => unknown): {
  client: typeof graphql;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = async (
    url: string,
    init: RequestInit,
  ): Promise<Response> => {
    const body = JSON.parse(init.body as string) as {
      variables: Record<string, unknown>;
    };
    const call = { url, variables: body.variables };
    calls.push(call);
    return jsonResponse(handler(call));
  };
  return { client: graphql.defaults({ request: { fetch: fetchImpl } }), calls };
}

function issueComment(databaseId: number): IssueComment {
  return {
    databaseId,
    author: { login: "alice" },
    body: `comment ${databaseId}`,
    createdAt: "2026-01-01T00:00:00Z",
    isMinimized: false,
    minimizedReason: null,
    reactionGroups: [],
  };
}

function threadComment(databaseId: number): ThreadComment {
  return {
    ...issueComment(databaseId),
    diffHunk: "@@ -1,1 +1,1 @@\n-old\n+new\n",
  };
}

describe("fetchTopComments", () => {
  it("sends owner/repo/number and head/tail as GraphQL variables", async () => {
    const { client, calls } = mockClient(() => ({
      repository: {
        pullRequest: {
          reactionGroups: [],
          headComments: { totalCount: 0, nodes: [] },
          tailComments: { nodes: [] },
        },
      },
    }));

    await fetchTopComments(client, "acme", "widgets", 42, 20, 20);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.variables).toEqual({
      owner: "acme",
      repo: "widgets",
      number: 42,
      head: 20,
      tail: 20,
    });
  });

  it("clamps head/tail to GitHub's 100-per-connection maximum", async () => {
    const { client, calls } = mockClient(() => ({
      repository: {
        pullRequest: {
          reactionGroups: [],
          headComments: { totalCount: 0, nodes: [] },
          tailComments: { nodes: [] },
        },
      },
    }));

    await fetchTopComments(client, "acme", "widgets", 42, 500, 500);

    expect(calls[0]?.variables).toMatchObject({ head: 100, tail: 100 });
  });

  it("maps the head/tail response into a TruncatedCommentList", async () => {
    const groups: ReactionGroup[] = [
      {
        content: "THUMBS_UP",
        reactors: { totalCount: 1, nodes: [{ login: "bob" }] },
      },
    ];
    const { client } = mockClient(() => ({
      repository: {
        pullRequest: {
          reactionGroups: groups,
          headComments: {
            totalCount: 5,
            nodes: [issueComment(1), issueComment(2)],
          },
          tailComments: { nodes: [issueComment(4), issueComment(5)] },
        },
      },
    }));

    const result = await fetchTopComments(
      client,
      "acme",
      "widgets",
      42,
      20,
      20,
    );

    expect(result.comments).toEqual({
      totalCount: 5,
      nodes: [issueComment(1), issueComment(2)],
      tailNodes: [issueComment(4), issueComment(5)],
    });
    expect(result.pullReactionGroups).toEqual(groups);
  });
});

describe("fetchReviewThreads", () => {
  it("paginates the thread list using the connection's cursor", async () => {
    const { client, calls } = mockClient(({ variables }) => {
      if (variables["cursor"] === null) {
        return {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: true, endCursor: "CURSOR_1" },
                nodes: [
                  {
                    id: "THREAD_1",
                    isResolved: false,
                    isOutdated: false,
                    path: "a.py",
                    line: 1,
                    headComments: { totalCount: 0, nodes: [] },
                    tailComments: { nodes: [] },
                  },
                ],
              },
            },
          },
        };
      }
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: "THREAD_2",
                  isResolved: false,
                  isOutdated: false,
                  path: "b.py",
                  line: 2,
                  headComments: { totalCount: 0, nodes: [] },
                  tailComments: { nodes: [] },
                },
              ],
            },
          },
        },
      };
    });

    const threads = await fetchReviewThreads(
      client,
      "acme",
      "widgets",
      42,
      20,
      20,
    );

    expect(calls.map((c) => c.variables["cursor"])).toEqual([null, "CURSOR_1"]);
    expect(threads.map((t) => t.id)).toEqual(["THREAD_1", "THREAD_2"]);
  });

  it("maps each thread's headComments/tailComments into comments", async () => {
    const { client } = mockClient(() => ({
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "THREAD_1",
                isResolved: true,
                isOutdated: false,
                path: "a.py",
                line: 3,
                headComments: { totalCount: 2, nodes: [threadComment(1)] },
                tailComments: { nodes: [threadComment(2)] },
              },
            ],
          },
        },
      },
    }));

    const [thread] = await fetchReviewThreads(
      client,
      "acme",
      "widgets",
      42,
      20,
      20,
    );

    expect(thread).toEqual({
      id: "THREAD_1",
      isResolved: true,
      isOutdated: false,
      path: "a.py",
      line: 3,
      comments: {
        totalCount: 2,
        nodes: [threadComment(1)],
        tailNodes: [threadComment(2)],
      },
    });
  });

  it("clamps head/tail to GitHub's 100-per-connection maximum", async () => {
    const { client, calls } = mockClient(() => ({
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [],
          },
        },
      },
    }));

    await fetchReviewThreads(client, "acme", "widgets", 42, 500, 500);

    expect(calls[0]?.variables).toMatchObject({ head: 100, tail: 100 });
  });
});

describe("fetchSingleThread", () => {
  const pullRequest = {
    number: 42,
    url: "https://github.com/acme/widgets/pull/42",
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("fetches a thread by node ID and returns all comments", async () => {
    const { client } = mockClient(() => ({
      node: {
        id: "THREAD_1",
        isResolved: true,
        isOutdated: false,
        path: "a.py",
        line: 5,
        pullRequest,
        comments: {
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: 2,
          nodes: [threadComment(1), threadComment(2)],
        },
      },
    }));

    const result = await fetchSingleThread(client, "THREAD_1");

    expect(result.thread).toEqual({
      id: "THREAD_1",
      isResolved: true,
      isOutdated: false,
      path: "a.py",
      line: 5,
      comments: {
        totalCount: 2,
        nodes: [threadComment(1), threadComment(2)],
        tailNodes: [],
      },
    });
    expect(result.pullRequest).toEqual(pullRequest);
  });

  it("paginates through all comment pages until exhausted", async () => {
    const { client, calls } = mockClient(({ variables }) => {
      if (variables["cursor"] === null) {
        return {
          node: {
            id: "THREAD_1",
            isResolved: false,
            isOutdated: false,
            path: "a.py",
            line: 1,
            pullRequest,
            comments: {
              pageInfo: { hasNextPage: true, endCursor: "CURSOR_1" },
              totalCount: 3,
              nodes: [threadComment(1), threadComment(2)],
            },
          },
        };
      }
      return {
        node: {
          id: "THREAD_1",
          isResolved: false,
          isOutdated: false,
          path: "a.py",
          line: 1,
          pullRequest,
          comments: {
            pageInfo: { hasNextPage: false, endCursor: null },
            totalCount: 3,
            nodes: [threadComment(3)],
          },
        },
      };
    });

    const result = await fetchSingleThread(client, "THREAD_1");

    expect(calls.map((c) => c.variables["cursor"])).toEqual([null, "CURSOR_1"]);
    expect(result.thread.comments.nodes.map((c) => c.databaseId)).toEqual([
      1, 2, 3,
    ]);
  });

  it("throws when the thread node is not found", async () => {
    const { client } = mockClient(() => ({ node: null }));

    await expect(fetchSingleThread(client, "MISSING_ID")).rejects.toThrow(
      "Thread not found: MISSING_ID",
    );
  });
});
