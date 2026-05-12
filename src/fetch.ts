import { execSync } from "child_process";
import { graphql } from "@octokit/graphql";
import type {
  ChangedFile,
  IssueComment,
  PRData,
  PullRequest,
  Review,
  ReviewThread,
} from "./types.js";

function getAuthToken(): string {
  return (
    process.env["GH_TOKEN"] ??
    process.env["GITHUB_TOKEN"] ??
    execSync("gh auth token", { encoding: "utf8" }).trim()
  );
}

function ghApi(endpoint: string): unknown {
  return JSON.parse(
    execSync(`gh api "${endpoint}"`, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }),
  );
}

function ghApiArray(endpoint: string): unknown[] {
  const results: unknown[] = [];
  let page = 1;
  const sep = endpoint.includes("?") ? "&" : "?";
  while (true) {
    const items = ghApi(
      `${endpoint}${sep}per_page=100&page=${page}`,
    ) as unknown[];
    results.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return results;
}

const TOP_COMMENTS_QUERY = `
  query PullRequestComments($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        comments(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            databaseId
            author { login }
            body
            createdAt
            isMinimized
            minimizedReason
          }
        }
      }
    }
  }
`;

interface TopCommentsResult {
  repository: {
    pullRequest: {
      comments: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: IssueComment[];
      };
    };
  };
}

const REVIEW_THREADS_QUERY = `
  query PullRequestThreads($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            isResolved
            isOutdated
            path
            line
            comments(first: 100) {
              nodes {
                databaseId
                author { login }
                body
                createdAt
                isMinimized
                minimizedReason
                diffHunk
              }
            }
          }
        }
      }
    }
  }
`;

interface ReviewThreadsResult {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ReviewThread[];
      };
    };
  };
}

async function fetchTopComments(
  client: typeof graphql,
  owner: string,
  repo: string,
  number: number,
): Promise<IssueComment[]> {
  const comments: IssueComment[] = [];
  let cursor: string | null = null;

  while (true) {
    const result: TopCommentsResult = await client<TopCommentsResult>(
      TOP_COMMENTS_QUERY,
      { owner, repo, number, cursor },
    );
    const connection: TopCommentsResult["repository"]["pullRequest"]["comments"] =
      result.repository.pullRequest.comments;
    comments.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }

  return comments;
}

async function fetchReviewThreads(
  client: typeof graphql,
  owner: string,
  repo: string,
  number: number,
): Promise<ReviewThread[]> {
  const threads: ReviewThread[] = [];
  let cursor: string | null = null;

  while (true) {
    const result: ReviewThreadsResult = await client<ReviewThreadsResult>(
      REVIEW_THREADS_QUERY,
      { owner, repo, number, cursor },
    );
    const connection: ReviewThreadsResult["repository"]["pullRequest"]["reviewThreads"] =
      result.repository.pullRequest.reviewThreads;
    threads.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }

  return threads;
}

export interface FetchOptions {
  timings: boolean;
}

export async function fetchPRData(
  repo: string,
  prNumber: number,
  options: FetchOptions,
): Promise<PRData> {
  const totalStart = performance.now();

  const slash = repo.indexOf("/");
  if (slash === -1)
    throw new Error(
      `Invalid repository format: "${repo}" (expected owner/repo)`,
    );
  const owner = repo.slice(0, slash);
  const repoName = repo.slice(slash + 1);

  const client = graphql.defaults({
    headers: { authorization: `token ${getAuthToken()}` },
  });

  const base = `repos/${repo}`;

  let topCommentsMs = 0;
  let reviewThreadsMs = 0;
  const graphqlStart = performance.now();
  const [topComments, reviewThreads] = await Promise.all([
    (async () => {
      const t = performance.now();
      const r = await fetchTopComments(client, owner, repoName, prNumber);
      topCommentsMs = performance.now() - t;
      return r;
    })(),
    (async () => {
      const t = performance.now();
      const r = await fetchReviewThreads(client, owner, repoName, prNumber);
      reviewThreadsMs = performance.now() - t;
      return r;
    })(),
  ]);
  const graphqlMs = performance.now() - graphqlStart;

  const pullStart = performance.now();
  const pull = ghApi(`${base}/pulls/${prNumber}`) as PullRequest;
  const pullMs = performance.now() - pullStart;

  const filesStart = performance.now();
  const files = ghApiArray(`${base}/pulls/${prNumber}/files`) as ChangedFile[];
  const filesMs = performance.now() - filesStart;

  const reviewsStart = performance.now();
  const reviews = ghApiArray(`${base}/pulls/${prNumber}/reviews`) as Review[];
  const reviewsMs = performance.now() - reviewsStart;

  const totalMs = performance.now() - totalStart;

  if (options.timings) {
    const rows: [string, number][] = [
      ["graphql (parallel)", graphqlMs],
      ["  top-level comments", topCommentsMs],
      ["  review threads", reviewThreadsMs],
      ["REST pr metadata", pullMs],
      ["REST changed files", filesMs],
      ["REST reviews", reviewsMs],
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

  return { pull, files, reviews, topComments, reviewThreads };
}
