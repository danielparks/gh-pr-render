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

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  comments: {
    nodes: ThreadComment[];
  };
}

export interface PRData {
  pull: PullRequest;
  files: ChangedFile[];
  commits: Commit[];
  topComments: IssueComment[];
  reviews: Review[];
  reviewThreads: ReviewThread[];
}
