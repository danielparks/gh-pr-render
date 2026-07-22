import type { PRData, PullRequest } from "./types.js";

export function basePull(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: "Test PR",
    state: "open",
    draft: false,
    body: null,
    user: { login: "alice" },
    head: { ref: "feature", sha: "abc123" },
    base: { ref: "main", sha: "def456" },
    html_url: "https://github.com/owner/repo/pull/1",
    created_at: "2026-01-01T00:00:00Z",
    closed_at: null,
    merged: false,
    merged_at: null,
    merged_by: null,
    labels: [],
    milestone: null,
    assignees: [],
    requested_reviewers: [],
    requested_teams: [],
    reactionGroups: [],
    ...overrides,
  };
}

export function basePRData(overrides: Partial<PRData> = {}): PRData {
  return {
    pull: basePull(),
    files: [],
    commits: [],
    topComments: { totalCount: 0, nodes: [], tailNodes: [] },
    reviews: [],
    reviewThreads: [],
    ...overrides,
  };
}
