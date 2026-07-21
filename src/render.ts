import { formatDistance } from "date-fns";
import type {
  Commit,
  IssueComment,
  PRData,
  PullRequest,
  ReactionContent,
  ReactionGroup,
  Review,
  ReviewState,
  ReviewThread,
  ThreadComment,
} from "./types.js";

function formatDate(iso: string, baseDate: string): string {
  return formatDistance(iso, baseDate) + " later";
}

// Prefixes every line with "> ".
//
// This ensures bodies containing arbitrary markdown are always visually and
// structurally distinct from renderer-generated structure.
//
// This normalizes CRLF to LF and strips a single trailing newline if it exists.
export function blockquote(text: string): string {
  return text
    .replace(/\r\n/gm, "\n")
    .replace(/\n$/, "")
    .replace(/^/gm, "> ")
    .replace(/^> $/gm, ">");
}

const REACTION_EMOJI: Record<ReactionContent, string> = {
  THUMBS_UP: "👍",
  THUMBS_DOWN: "👎",
  LAUGH: "😄",
  HOORAY: "🎉",
  CONFUSED: "😕",
  HEART: "❤️",
  ROCKET: "🚀",
  EYES: "👀",
};

// Displays emoji reactions and their authors.
//
// Only displays header if there are reactions. Shows reactions we don’t have
// authors for with “(+N more)” (see REACTOR_LIMIT in fetch.ts).
//
// Returns string lines without newlines.
export function formatReactions(
  groups: ReactionGroup[],
  heading: string,
): string[] {
  const nonEmpty = groups.filter((group) => group.reactors.totalCount > 0);
  if (nonEmpty.length === 0) return [];

  const lines = nonEmpty.map((group) => {
    const logins = group.reactors.nodes.map((node) => node.login);
    const remaining = group.reactors.totalCount - logins.length;
    const more = remaining > 0 ? ` (+${remaining} more)` : "";
    return `- ${REACTION_EMOJI[group.content]} ${logins.join(", ")}${more}`;
  });

  return ["", heading, "", ...lines];
}

// Returns open, closed, or merged with metadata.
//
// Does not return draft status.
//
// The REST API only identifies who closed a PR when that close was a merge
// (`merged_by`) — a plain close carries no actor, just a timestamp.
export function formatState(pull: PullRequest): string {
  const closed_at = pull.merged_at ?? pull.closed_at;
  const when = closed_at ? ` ${formatDate(closed_at, pull.created_at)}` : "";
  if (pull.merged) {
    const by = pull.merged_by ? ` by ${pull.merged_by.login}` : "";
    return `merged${when}${by}`;
  } else if (pull.state === "closed") {
    return `closed without merge${when}`;
  } else {
    return pull.state;
  }
}

function reviewStateLabel(state: ReviewState): string {
  switch (state) {
    case "APPROVED":
      return "Approval";
    case "CHANGES_REQUESTED":
      return "Change request";
    case "COMMENTED":
      return "Review";
    case "DISMISSED":
      return "Review dismissal";
    case "PENDING":
      return "Pending review";
  }
}

// Significant = worth showing as a standalone timeline entry.
// Empty-body COMMENTED reviews are just grouping containers for diff comments.
function isSignificantReview(review: Review): boolean {
  return (
    review.body.trim().length > 0 ||
    review.state === "APPROVED" ||
    review.state === "CHANGES_REQUESTED" ||
    review.state === "DISMISSED"
  );
}

interface TimelineEntry {
  timestamp: string;
  content: string;
}

function renderIssueComment(comment: IssueComment, baseDate: string): string {
  const author = comment.author?.login ?? "ghost";
  const time = formatDate(comment.createdAt, baseDate);
  const minimized = comment.isMinimized
    ? `, minimized: ${comment.minimizedReason ?? "hidden"}`
    : "";
  return [
    `### Comment by ${author} ${time} (id: ${comment.databaseId}${minimized}):`,
    "",
    blockquote(comment.body),
    ...formatReactions(comment.reactionGroups, "#### Reactions"),
  ].join("\n");
}

function renderReview(review: Review, baseDate: string): string {
  const state = reviewStateLabel(review.state);
  const time = formatDate(review.submitted_at, baseDate);
  const header = `### ${state} by ${review.user.login} ${time}:`;
  return review.body.trim()
    ? [header, "", blockquote(review.body)].join("\n")
    : header;
}

// Trim everything up to the last block of changes.
function renderDiffHunk(hunk: string): string {
  return hunk.replace(/.*^ [^\n\r]*[\n\r]+/ms, "");
}

function renderThreadComment(comment: ThreadComment, baseDate: string): string {
  const author = comment.author?.login ?? "ghost";
  const time = formatDate(comment.createdAt, baseDate);
  const minimized = comment.isMinimized
    ? `, minimized: ${comment.minimizedReason ?? "hidden"}`
    : "";
  const header = `#### ${author} ${time} (id: ${comment.databaseId}${minimized}):`;
  if (comment.isMinimized) return header;

  return [
    header,
    "",
    blockquote(comment.body),
    ...formatReactions(comment.reactionGroups, "##### Reactions"),
  ].join("\n");
}

function renderReviewThread(
  thread: ReviewThread,
  includeMinimized: boolean,
  baseDate: string,
): string {
  const first = thread.comments.nodes[0];
  if (!first) return "";

  const location =
    thread.line !== null
      ? `\`${thread.path}\` line ${thread.line}`
      : `\`${thread.path}\``;

  const tags: string[] = [`id: ${thread.id}`];
  if (thread.isResolved) tags.push("resolved");
  if (thread.isOutdated) tags.push("outdated");
  const tagStr = ` (${tags.join(", ")})`;

  const lines: string[] = [
    `### Inline comment on ${location}${tagStr}:`,
    "",
    "```diff",
    renderDiffHunk(first.diffHunk),
    "```",
  ];

  for (const comment of thread.comments.nodes) {
    if (comment.isMinimized && !includeMinimized) continue;
    lines.push("", renderThreadComment(comment, baseDate));
  }

  return lines.join("\n");
}

// Lists commit subjects, short sha first (like `git log --oneline`).
//
// Returns string lines without newlines.
export function renderCommits(commits: Commit[]): string[] {
  const lines = ["", "## Commits", ""];
  for (const commit of commits) {
    const subject = commit.commit.message.split("\n")[0] ?? "";
    const author =
      commit.author?.login ?? commit.commit.author?.name ?? "unknown";
    lines.push(`- \`${commit.sha.slice(0, 7)}\` ${subject} (${author})`);
  }
  if (commits.length === 0) {
    // This should not happen. Be explicit.
    lines.push("No commits.");
  }
  return lines;
}

export interface RenderOptions {
  includeMinimized: boolean;
  includeFiles: boolean;
  includeCommits: boolean;
}

export function renderPR(data: PRData, options: RenderOptions): string {
  const { pull, files, commits, topComments, reviews, reviewThreads } = data;
  const { includeMinimized, includeFiles, includeCommits } = options;
  const out: string[] = [];

  // Header
  out.push(`# PR #${pull.number}: ${pull.title}`, "");
  out.push(
    `**Author:** ${pull.user.login}`,
    `**State:** ${pull.draft ? "draft, " : ""}${formatState(pull)}`,
    `**Branch:** \`${pull.head.ref}\` → \`${pull.base.ref}\``,
    `**URL:** ${pull.html_url}`,
  );

  if (pull.labels.length > 0) {
    out.push(
      `**Labels:** ${pull.labels.map((label) => label.name).join(", ")}`,
    );
  }

  if (pull.milestone) {
    out.push(`**Milestone:** ${pull.milestone.title}`);
  }

  if (pull.assignees.length > 0) {
    out.push(`**Assignees:** ${pull.assignees.map((u) => u.login).join(", ")}`);
  }

  if (pull.requested_reviewers.length > 0 || pull.requested_teams.length > 0) {
    const reviewers = [
      ...pull.requested_reviewers.map((u) => u.login),
      ...pull.requested_teams.map((t) => `${t.name} (team)`),
    ];
    out.push(`**Requested reviewers:** ${reviewers.join(", ")}`);
  }

  if (pull.body?.trim()) {
    out.push("", blockquote(pull.body));
  }

  out.push(...formatReactions(pull.reactionGroups, "## Reactions"));

  if (includeCommits) {
    out.push(...renderCommits(commits));
  }

  if (includeFiles) {
    out.push("", "## Changed Files", "");
    for (const file of files) {
      out.push(
        `- \`${file.filename}\` (${file.status}) +${file.additions} / -${file.deletions}`,
      );
    }
  }

  // Timeline
  const timeline: TimelineEntry[] = [];

  for (const comment of topComments) {
    if (comment.isMinimized && !includeMinimized) continue;
    timeline.push({
      timestamp: comment.createdAt,
      content: renderIssueComment(comment, pull.created_at),
    });
  }

  for (const review of reviews) {
    if (isSignificantReview(review)) {
      timeline.push({
        timestamp: review.submitted_at,
        content: renderReview(review, pull.created_at),
      });
    }
  }

  for (const thread of reviewThreads) {
    const first = thread.comments.nodes[0];
    if (!first) continue;
    if (first.isMinimized && !includeMinimized) continue;
    timeline.push({
      timestamp: first.createdAt,
      content: renderReviewThread(thread, includeMinimized, pull.created_at),
    });
  }

  timeline.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  if (timeline.length > 0) {
    out.push("", "## Discussion");
    for (const entry of timeline) {
      out.push("", entry.content);
    }
  }

  out.push("");
  return out.join("\n");
}
