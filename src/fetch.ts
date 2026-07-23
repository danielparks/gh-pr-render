import { exec, execSync } from "child_process";
import { promisify } from "util";
import { graphql } from "@octokit/graphql";
import type {
  ChangedFile,
  Commit,
  IssueComment,
  PRData,
  PullRequest,
  PullRequestRef,
  ReactionGroup,
  Review,
  ReviewThread,
  ThreadComment,
  TruncatedCommentList,
} from "./types.js";
import {
  DEFAULT_COMMENT_HEAD_LIMIT,
  DEFAULT_COMMENT_TAIL_LIMIT,
  MAX_PAGE_SIZE,
} from "./limits.js";

const execAsync = promisify(exec);

// Number of reactors to fetch (by login) per reaction emoji. GitHub returns
// reactors as a `Reactor` union (User | Bot | Organization | Mannequin);
// `... on Actor` picks up `login` from whichever concrete type it is.
const REACTOR_LIMIT = 5;
const REACTIONS_FIELDS = `
  reactionGroups {
    content
    reactors(first: ${REACTOR_LIMIT}) {
      totalCount
      nodes {
        ... on Actor {
          login
        }
      }
    }
  }
`;

function getAuthToken(): string {
  return (
    process.env["GH_TOKEN"] ??
    process.env["GITHUB_TOKEN"] ??
    execSync("gh auth token", { encoding: "utf8" }).trim()
  );
}

async function ghApi(endpoint: string): Promise<unknown> {
  const { stdout } = await execAsync(`gh api "${endpoint}"`, {
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function ghApiArray(endpoint: string): Promise<unknown[]> {
  const results: unknown[] = [];
  let page = 1;
  const sep = endpoint.includes("?") ? "&" : "?";
  while (true) {
    const items = (await ghApi(
      `${endpoint}${sep}per_page=100&page=${page}`,
    )) as unknown[];
    results.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return results;
}

const ISSUE_COMMENT_FIELDS = `
  databaseId
  author { login }
  body
  createdAt
  isMinimized
  minimizedReason
  ${REACTIONS_FIELDS}
`;

// Fetches head and tail slices of the PR's top-level comments directly, via
// aliased `first`/`last` connection arguments, rather than paginating
// through the whole list — a PR with hundreds of comments only costs
// head + tail of them, not all of them.
const TOP_COMMENTS_QUERY = `
  query PullRequestComments($owner: String!, $repo: String!, $number: Int!, $head: Int!, $tail: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        ${REACTIONS_FIELDS}
        headComments: comments(first: $head) {
          totalCount
          nodes { ${ISSUE_COMMENT_FIELDS} }
        }
        tailComments: comments(last: $tail) {
          nodes { ${ISSUE_COMMENT_FIELDS} }
        }
      }
    }
  }
`;

// Shape shared by every GraphQL response that fetches a comment connection as
// aliased headComments/tailComments (see toTruncatedCommentList).
interface RawTruncatedComments<T> {
  headComments: { totalCount: number; nodes: T[] };
  tailComments: { nodes: T[] };
}

function toTruncatedCommentList<T>(
  raw: RawTruncatedComments<T>,
): TruncatedCommentList<T> {
  return {
    totalCount: raw.headComments.totalCount,
    nodes: raw.headComments.nodes,
    tailNodes: raw.tailComments.nodes,
  };
}

interface TopCommentsResult {
  repository: {
    pullRequest: {
      reactionGroups: ReactionGroup[];
    } & RawTruncatedComments<IssueComment>;
  };
}

const THREAD_COMMENT_FIELDS = `
  databaseId
  author { login }
  body
  createdAt
  isMinimized
  minimizedReason
  diffHunk
  ${REACTIONS_FIELDS}
`;

// The thread list itself is always fetched in full (it isn't subject to
// head/tail truncation — see limits.ts), but each thread's comments are
// fetched as head/tail slices the same way top-level comments are, via
// aliased `first`/`last` arguments.
const REVIEW_THREADS_QUERY = `
  query PullRequestThreads($owner: String!, $repo: String!, $number: Int!, $cursor: String, $head: Int!, $tail: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            headComments: comments(first: $head) {
              totalCount
              nodes { ${THREAD_COMMENT_FIELDS} }
            }
            tailComments: comments(last: $tail) {
              nodes { ${THREAD_COMMENT_FIELDS} }
            }
          }
        }
      }
    }
  }
`;

// Shape of a review thread as returned directly by REVIEW_THREADS_QUERY.
interface RawReviewThread
  extends Omit<ReviewThread, "comments">, RawTruncatedComments<ThreadComment> {}

interface ReviewThreadsResult {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: RawReviewThread[];
      };
    };
  };
}

export interface TopCommentsFetch {
  comments: TruncatedCommentList<IssueComment>;
  // Only the PR itself has just one set of reactions (unlike per-comment
  // reactions), so this is read once off the head-comments query.
  pullReactionGroups: ReactionGroup[];
}

export async function fetchTopComments(
  client: typeof graphql,
  owner: string,
  repo: string,
  number: number,
  commentHeadLimit: number,
  commentTailLimit: number,
): Promise<TopCommentsFetch> {
  const result = await client<TopCommentsResult>(TOP_COMMENTS_QUERY, {
    owner,
    repo,
    number,
    head: Math.min(commentHeadLimit, MAX_PAGE_SIZE),
    tail: Math.min(commentTailLimit, MAX_PAGE_SIZE),
  });
  const pullRequest = result.repository.pullRequest;

  return {
    comments: toTruncatedCommentList(pullRequest),
    pullReactionGroups: pullRequest.reactionGroups,
  };
}

export async function fetchReviewThreads(
  client: typeof graphql,
  owner: string,
  repo: string,
  number: number,
  commentHeadLimit: number,
  commentTailLimit: number,
): Promise<ReviewThread[]> {
  const rawThreads: RawReviewThread[] = [];
  let cursor: string | null = null;

  while (true) {
    const result: ReviewThreadsResult = await client<ReviewThreadsResult>(
      REVIEW_THREADS_QUERY,
      {
        owner,
        repo,
        number,
        cursor,
        // Ensure we always get the first comment so that the thread can be
        // placed correctly in the timeline.
        head: Math.max(Math.min(commentHeadLimit, MAX_PAGE_SIZE), 1),
        tail: Math.min(commentTailLimit, MAX_PAGE_SIZE),
      },
    );
    const connection: ReviewThreadsResult["repository"]["pullRequest"]["reviewThreads"] =
      result.repository.pullRequest.reviewThreads;
    rawThreads.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }

  return rawThreads.map(({ headComments, tailComments, ...thread }) => ({
    ...thread,
    comments: toTruncatedCommentList({ headComments, tailComments }),
  }));
}

const SINGLE_THREAD_QUERY = `
  query SingleReviewThread($id: ID!, $cursor: String) {
    node(id: $id) {
      ... on PullRequestReviewThread {
        id
        isResolved
        isOutdated
        path
        line
        pullRequest {
          number
          url
          createdAt
        }
        comments(first: ${MAX_PAGE_SIZE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          totalCount
          nodes { ${THREAD_COMMENT_FIELDS} }
        }
      }
    }
  }
`;

interface SingleThreadNode extends Omit<ReviewThread, "comments"> {
  pullRequest: PullRequestRef;
  comments: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
    nodes: ThreadComment[];
  };
}

interface SingleThreadNodeResult {
  node: SingleThreadNode | null;
}

export interface SingleThreadData {
  thread: ReviewThread;
  pullRequest: PullRequestRef;
}

export function createClient(): typeof graphql {
  return graphql.defaults({
    headers: { authorization: `token ${getAuthToken()}` },
  });
}

export async function fetchSingleThread(
  client: typeof graphql,
  threadId: string,
): Promise<SingleThreadData> {
  const firstResult = await client<SingleThreadNodeResult>(
    SINGLE_THREAD_QUERY,
    { id: threadId, cursor: null },
  );
  const firstNode = firstResult.node;
  if (!firstNode) throw new Error(`Thread not found: ${threadId}`);

  const allComments: ThreadComment[] = [...firstNode.comments.nodes];
  let hasNextPage = firstNode.comments.pageInfo.hasNextPage;
  let endCursor = firstNode.comments.pageInfo.endCursor;

  while (hasNextPage && endCursor !== null) {
    const result = await client<SingleThreadNodeResult>(SINGLE_THREAD_QUERY, {
      id: threadId,
      cursor: endCursor,
    });
    const node = result.node;
    if (!node) throw new Error(`Thread ${threadId} disappeared mid-pagination`);
    allComments.push(...node.comments.nodes);
    hasNextPage = node.comments.pageInfo.hasNextPage;
    endCursor = node.comments.pageInfo.endCursor;
  }

  const { pullRequest, comments, ...threadFields } = firstNode;
  return {
    thread: {
      ...threadFields,
      comments: {
        totalCount: comments.totalCount,
        nodes: allComments,
        tailNodes: [],
      },
    },
    pullRequest,
  };
}

export interface FetchOptions {
  timings: boolean;
  // How many comments to fetch at the start/end of a comment list, for both
  // top-level PR comments and each review thread's comments. Should match
  // whatever render.ts will be asked to display (see RenderOptions) — a
  // smaller fetch than that just yields a shorter head/tail than requested.
  commentHeadLimit: number;
  commentTailLimit: number;
}

function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  return fn().then((r) => [r, performance.now() - t]);
}

export async function fetchPRData(
  client: typeof graphql,
  repo: string,
  prNumber: number,
  options: FetchOptions = {
    timings: false,
    commentHeadLimit: DEFAULT_COMMENT_HEAD_LIMIT,
    commentTailLimit: DEFAULT_COMMENT_TAIL_LIMIT,
  },
): Promise<PRData> {
  const totalStart = performance.now();

  const slash = repo.indexOf("/");
  if (slash === -1)
    throw new Error(
      `Invalid repository format: "${repo}" (expected owner/repo)`,
    );
  const owner = repo.slice(0, slash);
  const repoName = repo.slice(slash + 1);

  const base = `repos/${repo}`;

  const [
    [{ comments: topComments, pullReactionGroups }, topCommentsMs],
    [reviewThreads, reviewThreadsMs],
    [restPull, pullMs],
    [files, filesMs],
    [commits, commitsMs],
    [reviews, reviewsMs],
  ] = await Promise.all([
    timed(() =>
      fetchTopComments(
        client,
        owner,
        repoName,
        prNumber,
        options.commentHeadLimit,
        options.commentTailLimit,
      ),
    ),
    timed(() =>
      fetchReviewThreads(
        client,
        owner,
        repoName,
        prNumber,
        options.commentHeadLimit,
        options.commentTailLimit,
      ),
    ),
    timed(
      () =>
        ghApi(`${base}/pulls/${prNumber}`) as Promise<
          Omit<PullRequest, "reactionGroups">
        >,
    ),
    timed(
      () =>
        ghApiArray(`${base}/pulls/${prNumber}/files`) as Promise<ChangedFile[]>,
    ),
    timed(
      () =>
        ghApiArray(`${base}/pulls/${prNumber}/commits`) as Promise<Commit[]>,
    ),
    timed(
      () =>
        ghApiArray(`${base}/pulls/${prNumber}/reviews`) as Promise<Review[]>,
    ),
  ]);

  const pull: PullRequest = { ...restPull, reactionGroups: pullReactionGroups };

  const totalMs = performance.now() - totalStart;

  if (options.timings) {
    const rows: [string, number][] = [
      ["top-level comments (graphql)", topCommentsMs],
      ["review threads (graphql)", reviewThreadsMs],
      ["pr metadata (REST)", pullMs],
      ["changed files (REST)", filesMs],
      ["commits (REST)", commitsMs],
      ["reviews (REST)", reviewsMs],
      ["total", totalMs],
    ];
    const labelWidth = Math.max(...rows.map(([l]) => l.length));
    const lines = rows
      .map(
        ([label, ms]) => `  ${label.padEnd(labelWidth)}  ${Math.round(ms)}ms`,
      )
      .join("\n");
    process.stderr.write(`timings:\n${lines}\n`);
  }

  return { pull, files, commits, reviews, topComments, reviewThreads };
}
