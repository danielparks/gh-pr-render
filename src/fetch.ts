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

export async function fetchPRData(
  repo: string,
  prNumber: number,
): Promise<PRData> {
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
  const [topComments, reviewThreads] = await Promise.all([
    fetchTopComments(client, owner, repoName, prNumber),
    fetchReviewThreads(client, owner, repoName, prNumber),
  ]);

  return {
    pull: ghApi(`${base}/pulls/${prNumber}`) as PullRequest,
    files: ghApiArray(`${base}/pulls/${prNumber}/files`) as ChangedFile[],
    reviews: ghApiArray(`${base}/pulls/${prNumber}/reviews`) as Review[],
    topComments,
    reviewThreads,
  };
}
