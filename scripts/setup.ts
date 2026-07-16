/**
 * Creates gh-pr-render-fixtures and populates it with a PR that exercises
 * each rendering scenario: minimized top-level comment, minimized diff thread
 * root (skips whole thread), outdated thread, resolved thread, thread with
 * reply, empty-body COMMENTED review (filtered), COMMENTED review with body,
 * an APPROVED review, a label, and reactions (multiple groups on a top-level
 * comment, a single group on a diff-thread reply).
 *
 * Usage: npm run setup [-- --owner <owner>]
 * Default owner: the currently authenticated gh user.
 */

import { execSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { graphql } from "@octokit/graphql";

// ─── CLI ─────────────────────────────────────────────────────────────────────

const ownerIdx = process.argv.indexOf("--owner");
const owner: string =
  ownerIdx !== -1
    ? (process.argv[ownerIdx + 1] ?? die("--owner requires a value"))
    : sh("gh api user --jq .login");

const REPO = "gh-pr-render-fixtures";
const FULL = `${owner}/${REPO}`;

const LABEL_NAME = "feature";
const LABEL_COLOR = "1d76db";
const LABEL_DESCRIPTION = "New feature or request";

const token = sh("gh auth token");
const gql = graphql.defaults({ headers: { authorization: `token ${token}` } });

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

function ghPost(path: string, body: object): unknown {
  return JSON.parse(
    execSync(`gh api --method POST "${path}" --input -`, {
      encoding: "utf8",
      input: JSON.stringify(body),
      stdio: ["pipe", "pipe", "pipe"],
    }),
  );
}

function git(cwd: string, ...args: string[]): string {
  return sh(`git ${args.map((a) => JSON.stringify(a)).join(" ")}`, { cwd });
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

// ─── Main ─────────────────────────────────────────────────────────────────────

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

  await addScenarioReactions(prNumber);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

log("Done.");

// ─── Reactions ───────────────────────────────────────────────────────────────

// Looked up fresh by comment body each run (rather than captured at creation
// time) so this applies whether the PR was just created or already existed.
async function addScenarioReactions(prNumber: number): Promise<void> {
  const result = await gql<{
    repository: {
      pullRequest: {
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

  // APPROVED review — GitHub may reject self-reviews on some repos
  try {
    ghPost(`repos/${FULL}/pulls/${n}/reviews`, {
      body: "Looks good to me!",
      event: "APPROVE",
    });
    log("  Added APPROVED review.");
  } catch {
    log("  Note: APPROVED review skipped (self-review not allowed).");
  }

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
