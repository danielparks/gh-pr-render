import { formatDistanceToNow } from "date-fns";
import type {
  IssueComment,
  PRData,
  Review,
  ReviewState,
  ReviewThread,
  ThreadComment,
} from "./types.js";

function formatDate(iso: string): string {
  return formatDistanceToNow(iso, { addSuffix: true });
}

function reviewStateLabel(state: ReviewState): string {
  switch (state) {
    case "APPROVED":
      return "approved this PR";
    case "CHANGES_REQUESTED":
      return "requested changes";
    case "COMMENTED":
      return "reviewed";
    case "DISMISSED":
      return "dismissed review";
    case "PENDING":
      return "pending review";
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

function renderIssueComment(comment: IssueComment): string {
  const author = comment.author?.login ?? "ghost";
  const minimized = comment.isMinimized
    ? ` [minimized: ${comment.minimizedReason ?? "hidden"}]`
    : "";
  return [
    `**${author}** commented (${formatDate(comment.createdAt)})${minimized}:`,
    "",
    comment.body,
  ].join("\n");
}

function renderReview(review: Review): string {
  const header = `**${review.user.login}** ${reviewStateLabel(review.state)} (${formatDate(review.submitted_at)})`;
  return review.body.trim() ? [header, "", review.body].join("\n") : header;
}

// Trim everything up to the last block of changes.
function renderDiffHunk(hunk: string): string {
  return hunk.replace(/.*^ [^\n\r]*[\n\r]+/ms, "");
}

function renderThreadComment(
  comment: ThreadComment,
  verb: "wrote" | "replied",
): string {
  const author = comment.author?.login ?? "ghost";
  const header = `**${author}** ${verb} (${formatDate(comment.createdAt)})${comment.isMinimized ? ` [minimized: ${comment.minimizedReason ?? "hidden"}]` : ""}:`;
  return comment.isMinimized ? header : [header, "", comment.body].join("\n");
}

function renderReviewThread(
  thread: ReviewThread,
  includeMinimized: boolean,
): string {
  const first = thread.comments.nodes[0];
  if (!first) return "";

  const location =
    thread.line !== null
      ? `\`${thread.path}\` line ${thread.line}`
      : `\`${thread.path}\``;

  const tags: string[] = [];
  if (thread.isResolved) tags.push("resolved");
  if (thread.isOutdated) tags.push("outdated");
  const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";

  const lines: string[] = [
    `**Diff comment** on ${location}${tagStr}:`,
    "",
    "```diff",
    renderDiffHunk(first.diffHunk),
    "```",
    "",
    renderThreadComment(first, "wrote"),
  ];

  for (const comment of thread.comments.nodes.slice(1)) {
    if (comment.isMinimized && !includeMinimized) continue;
    lines.push("", renderThreadComment(comment, "replied"));
  }

  return lines.join("\n");
}

export interface RenderOptions {
  includeMinimized: boolean;
}

export function renderPR(data: PRData, options: RenderOptions): string {
  const { pull, files, topComments, reviews, reviewThreads } = data;
  const { includeMinimized } = options;
  const out: string[] = [];

  // Header
  out.push(`# PR #${pull.number}: ${pull.title}`, "");
  out.push(
    `**Author:** ${pull.user.login} | **State:** ${pull.state}`,
    `**Branch:** \`${pull.head.ref}\` → \`${pull.base.ref}\``,
    `**URL:** ${pull.html_url}`,
  );

  if (pull.body?.trim()) {
    out.push("", "---", "", pull.body);
  }

  // Changed files
  out.push("", "---", "", "## Changed Files", "");
  for (const file of files) {
    out.push(
      `- \`${file.filename}\` (${file.status}) +${file.additions} / -${file.deletions}`,
    );
  }

  // Timeline
  const timeline: TimelineEntry[] = [];

  for (const comment of topComments) {
    if (comment.isMinimized && !includeMinimized) continue;
    timeline.push({
      timestamp: comment.createdAt,
      content: renderIssueComment(comment),
    });
  }

  for (const review of reviews) {
    if (isSignificantReview(review)) {
      timeline.push({
        timestamp: review.submitted_at,
        content: renderReview(review),
      });
    }
  }

  for (const thread of reviewThreads) {
    const first = thread.comments.nodes[0];
    if (!first) continue;
    if (first.isMinimized && !includeMinimized) continue;
    timeline.push({
      timestamp: first.createdAt,
      content: renderReviewThread(thread, includeMinimized),
    });
  }

  timeline.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  if (timeline.length > 0) {
    out.push("", "---", "", "## Discussion");
    for (const entry of timeline) {
      out.push("", "---", "", entry.content);
    }
  }

  out.push("");
  return out.join("\n");
}
