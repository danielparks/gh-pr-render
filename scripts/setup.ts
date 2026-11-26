/**
 * Creates a test repo and PRs to exercises various rendering scenarios.
 *
 * A PR (#1) is created and left open to exercise these scenarios:
 *
 * - minimized top-level comment
 * - minimized diff thread root (skips whole thread)
 * - outdated thread
 * - resolved thread
 * - thread with reply
 * - empty-body COMMENTED review (filtered)
 * - COMMENTED review with body
 * - a conversation of top-level comments and reviews, long enough to be
 *   truncated with small limits, including:
 *   - a CHANGES_REQUESTED review that is later superseded by an APPROVED review
 *     from the same reviewer (the approval is kept when truncation would omit
 *     it)
 *   - a top-level comment too long for the body line limit
 * - a label
 * - an assignee
 * - reactions on the PR description
 * - reactions on a top-level comment with multiple reaction groups
 * - reactions on a diff-thread reply
 * - inline comments on the current diff that cover:
 *   - multi-line range with a deleted line in the middle
 *   - ranges that cross from the old side of the diff to the new side
 *   - a deleted line
 *
 * A second, draft PR exercises requested reviewers:
 *
 * - a user (best-effort — GitHub disallows requesting the PR author)
 * - a team (best-effort — requires `owner` to be an organization; the team is
 *   granted read access to the repo so GitHub will accept it as a reviewer).
 *
 * That second PR is then closed without merging, to exercise the "closed, not
 * merged" render; the merged case is already covered by the real-world
 * danielparks/htmlize#66 fixture, so it isn't reproduced here.
 *
 * APPROVED and CHANGES_REQUESTED reviews can't come from a PR's author, so the
 * conversation scenario needs a second GitHub account (--reviewer, default
 * danielparks-test-1). Log in as it with `gh auth login` (the token is found
 * with `gh auth token --user`) or set GH_REVIEWER_TOKEN. Without it, that
 * scenario is skipped.
 *
 * Usage: npm run setup -- --owner <owner> [--reviewer <login>]
 */

import { execSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { graphql } from "@octokit/graphql";

// ─── CLI ─────────────────────────────────────────────────────────────────────

const ownerIdx = process.argv.indexOf("--owner");
const owner: string =
  (ownerIdx !== -1 && process.argv[ownerIdx + 1]) ||
  die("Usage: npm run setup -- --owner <owner>");

const reviewerIdx = process.argv.indexOf("--reviewer");
const reviewer: string =
  (reviewerIdx !== -1 && process.argv[reviewerIdx + 1]) || "danielparks-test-1";

const REPO = "gh-pr-render-fixtures";
const FULL = `${owner}/${REPO}`;

const LABEL_NAME = "feature";
const LABEL_COLOR = "1d76db";
const LABEL_DESCRIPTION = "New feature or request";

const MILESTONE_TITLE = "v1.0";

const TEAM_NAME = "reviewers";

const token = sh("gh auth token");
const gql = graphql.defaults({ headers: { authorization: `token ${token}` } });

// `owner` is the repo's namespace, which may be an org (as it is for
// danielparks-test) — orgs aren't users and can't be assigned to a PR or
// requested as a reviewer. This is the actual authenticated account.
const currentUser = sh("gh api user --jq .login");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sh(cmd: string, opts?: { cwd?: string; input?: string }): string {
  return execSync(cmd, {
    encoding: "utf8",
    cwd: opts?.cwd,
    input: opts?.input,
  }).trim();
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

// Pass `token` to act as a different account than the one `gh` is using.
function ghPost(path: string, body: object, token?: string): unknown {
  return JSON.parse(
    execSync(`gh api --method POST "${path}" --input -`, {
      encoding: "utf8",
      input: JSON.stringify(body),
      stdio: ["pipe", "pipe", "pipe"],
      env: token ? { ...process.env, GH_TOKEN: token } : process.env,
    }),
  );
}

function ghPatch(path: string, body: object): unknown {
  return JSON.parse(
    execSync(`gh api --method PATCH "${path}" --input -`, {
      encoding: "utf8",
      input: JSON.stringify(body),
      stdio: ["pipe", "pipe", "pipe"],
    }),
  );
}

// PUT endpoints used here (team repo permissions) respond 204 No Content,
// so there's no body to parse.
function ghPut(path: string, body: object): void {
  execSync(`gh api --method PUT "${path}" --input -`, {
    input: JSON.stringify(body),
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function git(cwd: string, ...args: string[]): string {
  return sh(`git ${args.map((a) => JSON.stringify(a)).join(" ")}`, { cwd });
}

// Team review requests need a real team, which only exists for
// organization-owned repos, *and* the team must already be a collaborator
// on the repo (GitHub rejects review requests from non-collaborators).
// Reuses whatever team is already there so this works without assuming
// naming; falls back to creating TEAM_NAME. Returns undefined (rather than
// throwing) when `owner` is a personal account, since that just means this
// scenario can't be demonstrated here.
function ensureReviewTeam(): string | undefined {
  let teams: Array<{ slug: string }>;
  try {
    teams = JSON.parse(
      sh(`gh api "orgs/${owner}/teams?per_page=100"`),
    ) as Array<{ slug: string }>;
  } catch {
    log(`  Note: team review request skipped ("${owner}" is not an org).`);
    return undefined;
  }

  let teamSlug: string;
  if (teams.length > 0) {
    teamSlug = teams[0]!.slug;
    log(`  Using existing team "${teamSlug}" for team review request.`);
  } else {
    const created = ghPost(`orgs/${owner}/teams`, {
      name: TEAM_NAME,
      description: "Fixture team for gh-pr-render tests",
      privacy: "closed",
    }) as { slug: string };
    teamSlug = created.slug;
    log(`  Created team "${teamSlug}".`);
  }

  ghPut(`orgs/${owner}/teams/${teamSlug}/repos/${FULL}`, {
    permission: "pull",
  });
  log(`  Granted team "${teamSlug}" read access to ${REPO}.`);

  return teamSlug;
}

// Adding the same reactor+content pair again is a no-op on GitHub's side, so
// this is safe to call every run, not just on first PR creation.
async function addReaction(subjectId: string, content: string): Promise<void> {
  await gql(
    `mutation($id: ID!, $content: ReactionContent!) {
      addReaction(input: {subjectId: $id, content: $content}) {
        reaction { content }
      }
    }`,
    { id: subjectId, content },
  );
}

// ─── File content ─────────────────────────────────────────────────────────────

const CALCULATOR_MAIN = `\
def add(a, b):
    return a + b


def subtract(a, b):
    return a - b


def multiply(a, b):
    return a * b


def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
`;

// Commit 1: add type hints to all functions + loop-based power/modulo.
// Line numbers (1-indexed) used for diff comments:
//   13 = def divide(...)   ← root of a thread that will be minimized
//   20 = result = 1.0      ← will become outdated when commit 2 changes power
const CALCULATOR_V1 = `\
def add(a: float, b: float) -> float:
    return a + b


def subtract(a: float, b: float) -> float:
    return a - b


def multiply(a: float, b: float) -> float:
    return a * b


def divide(a: float, b: float) -> float:
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b


def power(a: float, b: int) -> float:
    result = 1.0
    for _ in range(b):
        result *= a
    return result


def modulo(a: float, b: float) -> float:
    while a >= b:
        a -= b
    return a
`;

// Commit 2: replace loop implementations with built-in operators.
// Line numbers (1-indexed) used for diff comments:
//   19 = def power(...)    ← thread that will be resolved
//   23 = def modulo(...)   ← thread that will get a reply
const CALCULATOR_V2 = `\
def add(a: float, b: float) -> float:
    return a + b


def subtract(a: float, b: float) -> float:
    return a - b


def multiply(a: float, b: float) -> float:
    return a * b


def divide(a: float, b: float) -> float:
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b


def power(base: float, exponent: int) -> float:
    return base ** exponent


def modulo(dividend: float, divisor: float) -> float:
    return dividend % divisor
`;

// ─── Reactions ───────────────────────────────────────────────────────────────

// Looked up fresh by comment body each run (rather than captured at creation
// time) so this applies whether the PR was just created or already existed.
async function addScenarioReactions(prNumber: number): Promise<void> {
  const result = await gql<{
    repository: {
      pullRequest: {
        id: string;
        comments: { nodes: Array<{ id: string; body: string }> };
        reviewThreads: {
          nodes: Array<{
            comments: { nodes: Array<{ id: string; body: string }> };
          }>;
        };
      };
    };
  }>(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          id
          comments(first: 100) { nodes { id body } }
          reviewThreads(first: 100) {
            nodes { comments(first: 100) { nodes { id body } } }
          }
        }
      }
    }`,
    { owner, repo: REPO, number: prNumber },
  );

  const pr = result.repository.pullRequest;

  await addReaction(pr.id, "ROCKET");
  log("  Reacted 🚀 to the PR description.");

  const commentA = pr.comments.nodes.find((c) =>
    c.body.startsWith("Overall looks good!"),
  );
  if (commentA) {
    await addReaction(commentA.id, "THUMBS_UP");
    await addReaction(commentA.id, "HOORAY");
    log("  Reacted 👍🎉 to top-level comment A.");
  }

  const modReply = pr.reviewThreads.nodes
    .flatMap((t) => t.comments.nodes)
    .find((c) => c.body.startsWith("Agreed — much clearer"));
  if (modReply) {
    await addReaction(modReply.id, "EYES");
    log("  Reacted 👀 to modulo thread reply.");
  }
}

// ─── Hunk scenarios ──────────────────────────────────────────────────────────

// Inline comments on the PR’s current head, so they don’t change whether the
// earlier threads are outdated. Line numbers refer to the diff against main
// (CALCULATOR_MAIN → CALCULATOR_V2), which pairs each `-def f(a, b):` line
// with a `+def f(a: float, ...)` line, so the diff of lines 5–13 looks like:
//
//     -def subtract(a, b):                  old 5
//     +def subtract(a: float, b: float)...  new 5
//      return a - b                         old 6 / new 6
//      (blank)                              old 7 / new 7
//      (blank)                              old 8 / new 8
//     -def multiply(a, b):                  old 9
//     +def multiply(a: float, b: float)...  new 9
//      return a * b                         old 10 / new 10
//
// Each entry is skipped if a comment with that body already exists, so this is
// safe to run every time. `optional` ones are best-effort, since GitHub may
// reject them.
interface HunkScenario {
  body: string;
  start?: { line: number; side: "LEFT" | "RIGHT" };
  line: number;
  side: "LEFT" | "RIGHT";
  optional?: boolean;
}

const HUNK_SCENARIOS: HunkScenario[] = [
  {
    body: "Comment on new lines 5–9, with a removed line in the middle.",
    start: { line: 5, side: "RIGHT" },
    line: 9,
    side: "RIGHT",
  },
  {
    body: "Comment from old line 9 through new line 10, crossing sides.",
    start: { line: 9, side: "LEFT" },
    line: 10,
    side: "RIGHT",
  },
  {
    body: "Comment from old line 13 to new line 13: same number, different sides.",
    start: { line: 13, side: "LEFT" },
    line: 13,
    side: "RIGHT",
    optional: true,
  },
  {
    body: "Comment on a removed line.",
    line: 1,
    side: "LEFT",
  },
];

function addHunkScenarioThreads(prNumber: number): void {
  const headSha = sh(`gh api "repos/${FULL}/pulls/${prNumber}" --jq .head.sha`);
  const existing = new Set(
    (
      JSON.parse(
        sh(
          `gh api --paginate --slurp "repos/${FULL}/pulls/${prNumber}/comments"`,
        ),
      ) as Array<Array<{ body: string }>>
    )
      .flat()
      .map((c) => c.body),
  );

  for (const scenario of HUNK_SCENARIOS) {
    if (existing.has(scenario.body)) {
      log(`  Hunk scenario already present: ${scenario.body}`);
      continue;
    }

    try {
      ghPost(`repos/${FULL}/pulls/${prNumber}/comments`, {
        body: scenario.body,
        commit_id: headSha,
        path: "calculator.py",
        line: scenario.line,
        side: scenario.side,
        ...(scenario.start && {
          start_line: scenario.start.line,
          start_side: scenario.start.side,
        }),
      });
      log(`  Added hunk scenario: ${scenario.body}`);
    } catch (err) {
      if (!scenario.optional) throw err;
      log(
        `  Note: hunk scenario skipped (GitHub rejected it): ${scenario.body}`,
      );
    }
  }
}

// ─── Conversation scenario ───────────────────────────────────────────────────

// The reviewer account's token, or undefined if it isn't available. Looks at
// GH_REVIEWER_TOKEN, then at accounts `gh` is logged in to.
function reviewerToken(): string | undefined {
  const fromEnv = process.env["GH_REVIEWER_TOKEN"];
  if (fromEnv) return fromEnv;
  try {
    const token = execSync(`gh auth token --user ${JSON.stringify(reviewer)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

const LONG_COMMENT = [
  "Local test run:",
  "",
  "```text",
  ...Array.from({ length: 60 }, (_, i) => `step ${i + 1}/60: ok`),
  "```",
].join("\n");

interface ConversationStep {
  as: "author" | "reviewer";
  body: string;
  // A review with this event, rather than a top-level comment.
  review?: "APPROVE" | "REQUEST_CHANGES";
}

// Added after the PR's original comments and reviews, in this order. The
// reviewer's approval is followed by two more comments so that it is in the
// middle of the conversation, where truncation with small limits has to decide
// whether to keep it.
const CONVERSATION_STEPS: ConversationStep[] = [
  {
    as: "reviewer",
    review: "REQUEST_CHANGES",
    body: "Please add tests before merging.",
  },
  { as: "author", body: "Tests are coming in a separate PR." },
  { as: "author", body: LONG_COMMENT },
  { as: "reviewer", body: "That works for me, thanks." },
  { as: "author", body: "CI is green now." },
  { as: "reviewer", review: "APPROVE", body: "Looks good now." },
  { as: "author", body: "Merging after one more look." },
  { as: "author", body: "Thanks for the review!" },
];

async function addConversationScenario(prNumber: number): Promise<void> {
  const token = reviewerToken();
  if (!token) {
    log(
      `  Note: conversation scenario skipped (no token for ${reviewer}; ` +
        "run `gh auth login` as that account or set GH_REVIEWER_TOKEN).",
    );
    return;
  }

  const reviewerLogin = execSync("gh api user --jq .login", {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: token },
  }).trim();
  if (reviewerLogin === currentUser) {
    log(
      `  Note: conversation scenario skipped (${reviewer}'s token is for ` +
        `${currentUser}, who authored the PR and can't approve it).`,
    );
    return;
  }

  const bodies = (path: string): Set<string> =>
    new Set(
      (
        JSON.parse(sh(`gh api --paginate --slurp "${path}"`)) as Array<
          Array<{ body: string }>
        >
      )
        .flat()
        .map((item) => item.body),
    );
  const existingComments = bodies(`repos/${FULL}/issues/${prNumber}/comments`);
  const existingReviews = bodies(`repos/${FULL}/pulls/${prNumber}/reviews`);

  for (const step of CONVERSATION_STEPS) {
    const label = step.body.split("\n")[0];
    if ((step.review ? existingReviews : existingComments).has(step.body)) {
      log(`  Conversation step already present: ${label}`);
      continue;
    }

    const asToken = step.as === "reviewer" ? token : undefined;
    if (step.review) {
      ghPost(
        `repos/${FULL}/pulls/${prNumber}/reviews`,
        { body: step.body, event: step.review },
        asToken,
      );
    } else {
      ghPost(
        `repos/${FULL}/issues/${prNumber}/comments`,
        { body: step.body },
        asToken,
      );
    }
    log(`  Added ${step.as} ${step.review ?? "comment"}: ${label}`);

    // Timestamps only have one-second resolution; make sure steps are strictly
    // ordered so the recorded conversation doesn't depend on tie-breaking.
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
}

// ─── Scenario PR ─────────────────────────────────────────────────────────────

async function createScenarioPR(dir: string, title: string): Promise<number> {
  const branch = "feat/type-hints-and-ops";

  // Commit 1: type hints + loop-based power/modulo
  log("Pushing commit 1...");
  git(dir, "checkout", "-b", branch);
  writeFileSync(join(dir, "calculator.py"), CALCULATOR_V1);
  git(dir, "add", "calculator.py");
  git(dir, "commit", "-m", "Add type hints and power/modulo operations");
  git(dir, "push", "-u", "origin", branch);
  const sha1 = git(dir, "rev-parse", "HEAD");

  // Create PR
  log("Creating PR...");
  const pr = ghPost(`repos/${FULL}/pulls`, {
    title,
    head: branch,
    base: "main",
    body: "Adds type annotations to all functions and implements `power` and `modulo` operations.",
  }) as { number: number };
  const n = pr.number;
  log(`  PR #${n}.`);

  // Top-level comment A — normal, not minimized
  ghPost(`repos/${FULL}/issues/${n}/comments`, {
    body: "Overall looks good! The type hints are a nice addition.",
  });
  log("  Added top-level comment A.");

  // Top-level comment B — will be minimized as DUPLICATE
  const commentB = ghPost(`repos/${FULL}/issues/${n}/comments`, {
    body: "This is a duplicate of last week's PR.",
  }) as { node_id: string };
  log("  Added top-level comment B (will be minimized).");

  // Empty-body COMMENTED review with one inline comment on power/line 20.
  // This exercises two scenarios at once:
  //   (1) the review itself has no body → renderer filters it out
  //   (2) the inline comment is on sha1; after commit 2 changes that function,
  //       the thread becomes OUTDATED
  ghPost(`repos/${FULL}/pulls/${n}/reviews`, {
    commit_id: sha1,
    body: "",
    event: "COMMENT",
    comments: [
      {
        path: "calculator.py",
        line: 20,
        side: "RIGHT",
        body: "This loop runs in O(b) time. Python has a built-in `**` operator.",
      },
    ],
  });
  log(
    "  Added empty-body COMMENTED review with inline comment on power/line 20.",
  );
  log("  (Review filtered by renderer; inline thread will become outdated.)");

  // Diff thread on line 13 of commit 1 — root will be minimized, causing the
  // renderer to skip the entire thread.
  const threadMinRoot = ghPost(`repos/${FULL}/pulls/${n}/comments`, {
    body: "Should we return `None` instead of raising for division by zero?",
    commit_id: sha1,
    path: "calculator.py",
    line: 13,
    side: "RIGHT",
  }) as { id: number; node_id: string };
  log("  Added diff thread on divide/line 13 (root will be minimized).");

  // COMMENTED review with body — should appear in timeline
  ghPost(`repos/${FULL}/pulls/${n}/reviews`, {
    body: "Please add docstrings to each function.",
    event: "COMMENT",
  });
  log("  Added COMMENTED review with body.");

  // Commit 2: simplify power/modulo — makes the commit-1 thread outdated
  log("Pushing commit 2...");
  writeFileSync(join(dir, "calculator.py"), CALCULATOR_V2);
  git(dir, "add", "calculator.py");
  git(
    dir,
    "commit",
    "-m",
    "Simplify power and modulo using built-in operators",
  );
  git(dir, "push");
  const sha2 = git(dir, "rev-parse", "HEAD");

  // Diff thread on line 19 of commit 2 (def power) — will be resolved
  const threadResolved = ghPost(`repos/${FULL}/pulls/${n}/comments`, {
    body: "Nice, much cleaner!",
    commit_id: sha2,
    path: "calculator.py",
    line: 19,
    side: "RIGHT",
  }) as { id: number };
  log("  Added diff thread on power/line 19 (will be resolved).");

  // Diff thread on line 23 of commit 2 (def modulo) — will get a reply
  const threadWithReply = ghPost(`repos/${FULL}/pulls/${n}/comments`, {
    body: "Good choice of parameter names.",
    commit_id: sha2,
    path: "calculator.py",
    line: 23,
    side: "RIGHT",
  }) as { id: number };
  log("  Added diff thread on modulo/line 23.");

  ghPost(`repos/${FULL}/pulls/${n}/comments`, {
    body: "Agreed — much clearer than `a` and `b`.",
    in_reply_to: threadWithReply.id,
  });
  log("  Added reply to modulo thread.");

  // ── GraphQL mutations ──────────────────────────────────────────────────────

  // Fetch review thread node IDs, matched by first comment's databaseId.
  const threadsResult = await gql<{
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: Array<{
            id: string;
            comments: { nodes: Array<{ databaseId: number }> };
          }>;
        };
      };
    };
  }>(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              comments(first: 1) { nodes { databaseId } }
            }
          }
        }
      }
    }`,
    { owner, repo: REPO, number: n },
  );

  const threads = threadsResult.repository.pullRequest.reviewThreads.nodes;

  function threadNodeId(commentDbId: number): string | undefined {
    return threads.find((t) => t.comments.nodes[0]?.databaseId === commentDbId)
      ?.id;
  }

  const resolvedThreadNodeId = threadNodeId(threadResolved.id);
  if (resolvedThreadNodeId) {
    await gql(
      `mutation($id: ID!) {
        resolveReviewThread(input: {threadId: $id}) {
          thread { isResolved }
        }
      }`,
      { id: resolvedThreadNodeId },
    );
    log("  Resolved power thread.");
  }

  await gql(
    `mutation($id: ID!, $classifier: ReportedContentClassifiers!) {
      minimizeComment(input: {subjectId: $id, classifier: $classifier}) {
        minimizedComment { isMinimized }
      }
    }`,
    { id: commentB.node_id, classifier: "DUPLICATE" },
  );
  log("  Minimized top-level comment B.");

  await gql(
    `mutation($id: ID!, $classifier: ReportedContentClassifiers!) {
      minimizeComment(input: {subjectId: $id, classifier: $classifier}) {
        minimizedComment { isMinimized }
      }
    }`,
    { id: threadMinRoot.node_id, classifier: "OUTDATED" },
  );
  log("  Minimized root of divide thread.");

  log(`\nPR #${n}: https://github.com/${FULL}/pull/${n}`);
  log(`Record: npm run record ${FULL} ${n}`);
  return n;
}

// ─── Draft PR ─────────────────────────────────────────────────────────────────

const TEST_CALCULATOR = `\
import unittest
from calculator import add, subtract, multiply, divide


class TestCalculator(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(2.0, 3.0), 5.0)

    def test_subtract(self):
        self.assertEqual(subtract(5.0, 3.0), 2.0)

    def test_multiply(self):
        self.assertEqual(multiply(3.0, 4.0), 12.0)

    def test_divide(self):
        self.assertEqual(divide(10.0, 2.0), 5.0)


if __name__ == "__main__":
    unittest.main()
`;

function createDraftPR(dir: string, title: string): number {
  const branch = "feat/add-tests";

  log(`Creating draft PR "${title}"...`);
  git(dir, "checkout", "main");
  git(dir, "checkout", "-b", branch);
  writeFileSync(join(dir, "test_calculator.py"), TEST_CALCULATOR);
  git(dir, "add", "test_calculator.py");
  git(dir, "commit", "-m", "Add unit tests for calculator module");
  git(dir, "push", "--force", "-u", "origin", branch);

  const pr = ghPost(`repos/${FULL}/pulls`, {
    title,
    head: branch,
    base: "main",
    body: "Work in progress: adding unit tests to verify all calculator operations.",
    draft: true,
  }) as { number: number };

  log(
    `  Created draft PR #${pr.number}: https://github.com/${FULL}/pull/${pr.number}`,
  );
  log(`  Record: npm run record ${FULL} ${pr.number}`);
  return pr.number;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

log(`Current user: ${currentUser}`);

log(`Ensuring ${FULL} exists...`);
try {
  sh(`gh repo view ${FULL} --json name`);
  log("  Repo already exists.");
} catch {
  log("  Creating repo...");
  sh(
    `gh repo create ${FULL} --public --add-readme ` +
      `--description "Fixture repository for gh-pr-render tests"`,
  );
}

log(`Ensuring label "${LABEL_NAME}" exists...`);
sh(
  `gh label create ${JSON.stringify(LABEL_NAME)} --repo ${FULL} ` +
    `--color ${LABEL_COLOR} --description ${JSON.stringify(LABEL_DESCRIPTION)} --force`,
);

const tmpDir = join(tmpdir(), `gh-pr-render-setup-${Date.now()}`);
mkdirSync(tmpDir, { recursive: true });

try {
  sh(`gh repo clone ${FULL} ${JSON.stringify(tmpDir)}`);
  git(tmpDir, "config", "user.email", "setup@gh-pr-render");
  git(tmpDir, "config", "user.name", "gh-pr-render setup");

  const existingFiles = sh("git ls-files", { cwd: tmpDir })
    .split("\n")
    .filter(Boolean);
  if (!existingFiles.includes("calculator.py")) {
    log("Initializing main branch...");
    writeFileSync(join(tmpDir, "calculator.py"), CALCULATOR_MAIN);
    git(tmpDir, "add", "calculator.py");
    git(tmpDir, "commit", "-m", "Add calculator module");
    git(tmpDir, "push");
  }

  const PR_TITLE = "Add type hints and arithmetic operations";
  const existing = JSON.parse(
    sh(
      `gh pr list --repo ${FULL} --state all ` +
        `--search ${JSON.stringify(PR_TITLE)} --json number,title`,
    ),
  ) as Array<{ number: number; title: string }>;

  const existingPR = existing.find((pr) => pr.title === PR_TITLE);
  let prNumber: number;
  if (existingPR) {
    log(`PR "${PR_TITLE}" already exists — skipping creation.`);
    prNumber = existingPR.number;
  } else {
    prNumber = await createScenarioPR(tmpDir, PR_TITLE);
  }

  ghPost(`repos/${FULL}/issues/${prNumber}/labels`, {
    labels: [LABEL_NAME],
  });
  log(`  Added label "${LABEL_NAME}" to PR #${prNumber}.`);

  ghPost(`repos/${FULL}/issues/${prNumber}/assignees`, {
    assignees: [currentUser],
  });
  log(`  Assigned ${currentUser} to PR #${prNumber}.`);

  log(`Ensuring milestone "${MILESTONE_TITLE}" exists...`);
  const existingMilestones = JSON.parse(
    sh(`gh api "repos/${FULL}/milestones?state=all&per_page=100"`),
  ) as Array<{ number: number; title: string }>;
  let milestoneNumber: number;
  const existingMilestone = existingMilestones.find(
    (m) => m.title === MILESTONE_TITLE,
  );
  if (existingMilestone) {
    log("  Milestone already exists.");
    milestoneNumber = existingMilestone.number;
  } else {
    const created = ghPost(`repos/${FULL}/milestones`, {
      title: MILESTONE_TITLE,
    }) as { number: number };
    milestoneNumber = created.number;
    log("  Created milestone.");
  }
  ghPatch(`repos/${FULL}/issues/${prNumber}`, { milestone: milestoneNumber });
  log(`  Applied milestone "${MILESTONE_TITLE}" to PR #${prNumber}.`);

  const DRAFT_PR_TITLE = "Add unit tests for calculator";
  const existingDraftPRs = JSON.parse(
    sh(
      `gh pr list --repo ${FULL} --state all ` +
        `--search ${JSON.stringify(DRAFT_PR_TITLE)} --json number,title`,
    ),
  ) as Array<{ number: number; title: string }>;
  const existingDraftPR = existingDraftPRs.find(
    (pr) => pr.title === DRAFT_PR_TITLE,
  );
  let draftPrNumber: number;
  if (existingDraftPR) {
    log(`Draft PR "${DRAFT_PR_TITLE}" already exists — skipping creation.`);
    draftPrNumber = existingDraftPR.number;
  } else {
    draftPrNumber = createDraftPR(tmpDir, DRAFT_PR_TITLE);
  }

  // Requested reviewers on the draft PR — a user and, where possible, a team.
  try {
    ghPost(`repos/${FULL}/pulls/${draftPrNumber}/requested_reviewers`, {
      reviewers: [reviewer],
    });
    log(`  Requested review from ${reviewer} on draft PR #${draftPrNumber}.`);
  } catch (error) {
    log(
      `  Note: requested reviewer ${reviewer} skipped: ` +
        ((error as { stderr?: string }).stderr ?? String(error)),
    );
  }

  const teamSlug = ensureReviewTeam();
  if (teamSlug) {
    try {
      ghPost(`repos/${FULL}/pulls/${draftPrNumber}/requested_reviewers`, {
        team_reviewers: [teamSlug],
      });
      log(
        `  Requested review from team "${teamSlug}" on draft PR #${draftPrNumber}.`,
      );
    } catch (err) {
      log(`  Note: team review request failed: ${err}`);
    }
  }

  // Close the draft PR without merging — exercises the "closed, not merged"
  // render. Done last, after the (open-PR-only) reviewer requests above.
  const draftState = JSON.parse(
    sh(`gh api "repos/${FULL}/pulls/${draftPrNumber}" --jq "{state: .state}"`),
  ) as { state: string };
  if (draftState.state === "open") {
    ghPatch(`repos/${FULL}/pulls/${draftPrNumber}`, { state: "closed" });
    log(`  Closed draft PR #${draftPrNumber} without merging.`);
  } else {
    log(`  Draft PR #${draftPrNumber} already closed.`);
  }

  addHunkScenarioThreads(prNumber);
  await addConversationScenario(prNumber);
  await addScenarioReactions(prNumber);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

log("Done.");
