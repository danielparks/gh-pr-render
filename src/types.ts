export interface User {
  login: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  body: string | null;
  user: User;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  html_url: string;
  created_at: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface IssueComment {
  id: number;
  user: User;
  body: string;
  created_at: string;
}

export type ReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'
  | 'DISMISSED'
  | 'PENDING';

export interface Review {
  id: number;
  user: User;
  state: ReviewState;
  body: string;
  submitted_at: string;
}

export interface DiffComment {
  id: number;
  user: User;
  body: string;
  path: string;
  diff_hunk: string;
  line: number | null;
  side: string;
  in_reply_to_id?: number;
  pull_request_review_id: number | null;
  created_at: string;
}

export interface PRData {
  pull: PullRequest;
  files: ChangedFile[];
  topComments: IssueComment[];
  reviews: Review[];
  diffComments: DiffComment[];
}
