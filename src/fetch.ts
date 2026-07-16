import { exec, execSync } from "child_process";
import { promisify } from "util";
import { graphql } from "@octokit/graphql";
import type {
  ChangedFile,
  IssueComment,
  PRData,
  PullRequest,
  ReactionGroup,
  Review,
  ReviewThread,
} from "./types.js";

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

const TOP_COMMENTS_QUERY = `
  query PullRequestComments($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        ${REACTIONS_FIELDS}
        comments(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            databaseId
            author { login }
            body
            createdAt
            isMinimized
            minimizedReason
            ${REACTIONS_FIELDS}
          }
        }
      }
    }
  }
`;

interface TopCommentsResult {
  repository: {
    pullRequest: {
      reactionGroups: ReactionGroup[];
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
                ${REACTIONS_FIELDS}
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

interface TopCommentsFetch {
  comments: IssueComment[];
  // Reported on every page of the same query; only the PR itself has just
  // one set of reactions, so any page's value is the correct one.
  pullReactionGroups: ReactionGroup[];
}

async function fetchTopComments(
  client: typeof graphql,
  owner: string,
  repo: string,
  number: number,
): Promise<TopCommentsFetch> {
  const comments: IssueComment[] = [];
  let pullReactionGroups: ReactionGroup[];
  let cursor: string | null = null;

  while (true) {
    const result: TopCommentsResult = await client<TopCommentsResult>(
      TOP_COMMENTS_QUERY,
      { owner, repo, number, cursor },
    );
    const pullRequest = result.repository.pullRequest;
    comments.push(...pullRequest.comments.nodes);
    pullReactionGroups = pullRequest.reactionGroups;
    if (!pullRequest.comments.pageInfo.hasNextPage) break;
    cursor = pullRequest.comments.pageInfo.endCursor;
  }

  return { comments, pullReactionGroups };
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

function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  return fn().then((r) => [r, performance.now() - t]);
}

export async function fetchPRData(
  repo: string,
  prNumber: number,
  options: FetchOptions = { timings: false },
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

  const [
    [{ comments: topComments, pullReactionGroups }, topCommentsMs],
    [reviewThreads, reviewThreadsMs],
    [restPull, pullMs],
    [files, filesMs],
    [reviews, reviewsMs],
  ] = await Promise.all([
    timed(() => fetchTopComments(client, owner, repoName, prNumber)),
    timed(() => fetchReviewThreads(client, owner, repoName, prNumber)),
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

  return { pull, files, reviews, topComments, reviewThreads };
}
