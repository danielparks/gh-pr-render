export interface User {
  login: string;
}

export interface Label {
  name: string;
}

export interface Milestone {
  title: string;
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
  labels: Label[];
  milestone: Milestone | null;
  assignees: User[];
  requested_reviewers: User[];
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
  topComments: IssueComment[];
  reviews: Review[];
  reviewThreads: ReviewThread[];
}
