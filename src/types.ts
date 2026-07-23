export interface User {
  login: string;
}

export interface Label {
  name: string;
}

export interface Milestone {
  title: string;
}

export interface Team {
  name: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  body: string | null;
  user: User;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  html_url: string;
  created_at: string;
  closed_at: string | null;
  merged: boolean;
  merged_at: string | null;
  merged_by: User | null;
  labels: Label[];
  milestone: Milestone | null;
  assignees: User[];
  requested_reviewers: User[];
  requested_teams: Team[];
  reactionGroups: ReactionGroup[];
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface Commit {
  sha: string;
  commit: {
    message: string;
    author: { name: string } | null;
  };
  author: User | null;
}

export type ReactionContent =
  | "THUMBS_UP"
  | "THUMBS_DOWN"
  | "LAUGH"
  | "HOORAY"
  | "CONFUSED"
  | "HEART"
  | "ROCKET"
  | "EYES";

export interface ReactionGroup {
  content: ReactionContent;
  reactors: {
    totalCount: number;
    nodes: { login: string }[];
  };
}

export interface IssueComment {
  databaseId: number;
  author: { login: string } | null;
  body: string;
  createdAt: string;
  isMinimized: boolean;
  minimizedReason: string | null;
  reactionGroups: ReactionGroup[];
}

export type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

export interface Review {
  id: number;
  user: User;
  state: ReviewState;
  body: string;
  submitted_at: string;
}

export interface ThreadComment {
  databaseId: number;
  author: { login: string } | null;
  body: string;
  createdAt: string;
  isMinimized: boolean;
  minimizedReason: string | null;
  diffHunk: string;
  reactionGroups: ReactionGroup[];
}

// A comment list fetched as separate head and tail slices — via GraphQL's
// `first`/`last` connection arguments — rather than in full, so a very long
// list doesn't cost a full pagination crawl just to render a truncated
// summary of it. See FetchOptions in fetch.ts for the limits that size these
// slices, and truncateComments in render.ts for how they're reconciled into
// what's actually displayed.
export interface TruncatedCommentList<T> {
  // Total comment count, independent of how many of `nodes`/`tailNodes` were
  // actually fetched.
  totalCount: number;
  // Head slice, fetched via `first`. May already contain everything.
  nodes: T[];
  // Tail slice, fetched via `last`. Overlaps with `nodes` when totalCount is
  // small enough that both slices reach into the same comments.
  tailNodes: T[];
}

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  comments: TruncatedCommentList<ThreadComment>;
}

// Just enough of a PR to place a single fetched thread in context (see
// fetchSingleThread/renderSingleThread) — not the full PullRequest.
export interface PullRequestRef {
  number: number;
  url: string;
  createdAt: string;
}

export interface PRData {
  pull: PullRequest;
  files: ChangedFile[];
  commits: Commit[];
  topComments: TruncatedCommentList<IssueComment>;
  reviews: Review[];
  reviewThreads: ReviewThread[];
}
