#!/usr/bin/env node
import { spawnSync } from "child_process";
import { Command, InvalidArgumentError } from "commander";
import { createClient, fetchPRData, fetchSingleThread } from "./fetch.js";
import { renderPR, renderSingleThread, type RenderOptions } from "./render.js";
import {
  DEFAULT_COMMENT_HEAD_LIMIT,
  DEFAULT_COMMENT_TAIL_LIMIT,
  MAX_PAGE_SIZE,
} from "./limits.js";
import metadata from "../package.json" with { type: "json" };

function fail(message: string): never {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.error(`::error::${message}`);
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

function handleError(error: unknown): never {
  if (process.env.GITHUB_ACTIONS === "true") {
    fail(error instanceof Error ? error.message : String(error));
  } else {
    throw error;
  }
}

function parseIntArg(min: number, max: number) {
  return (value: string): number => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      throw new InvalidArgumentError(
        `"${value}" is not a valid integer >= ${min} and <= ${max}`,
      );
    }
    return parsed;
  };
}

// prRef can be a branch name or a PR name
function detectRepoAndPr(
  prRef: string | undefined = undefined,
): [string, number] {
  const prSuffix = prRef === undefined ? [] : [prRef];
  const { status, stdout, stderr } = spawnSync(
    "gh",
    ["pr", "view", "--json", "url", "--jq", ".url", ...prSuffix],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (status === null) {
    fail("gh pr view killed by signal");
  } else if (status !== 0) {
    fail(
      (stderr.trim() || "gh pr view failed with no output") +
        (prRef === undefined
          ? "\n\nTry passing a PR number or URL explicitly: gh-pr-render 123"
          : ""),
    );
  }

  const repoPr = parsePrUrl(stdout.trim());
  if (!repoPr) {
    fail(`Unexpected output from "gh pr view": "${stdout.trim()}"`);
  }
  return repoPr;
}

function parsePrUrl(url: string): [string, number] | undefined {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (match) {
    return [match[1]!, parseInt(match[2]!, 10)];
  }
  return undefined;
}

const program = new Command()
  .name(metadata.name)
  .version(metadata.version)
  .description(metadata.description)
  .configureOutput({
    outputError:
      process.env.GITHUB_ACTIONS === "true"
        ? (str, write) => write(`::error::${str.replace(/^error:\s*/i, "")}`)
        : (str, write) => write(str),
  })
  .argument(
    "[repo-or-pr]",
    "GitHub PR URL, repository (owner/repo), branch name, or PR number; " +
      "detected from the current branch if omitted",
  )
  .argument("[pr]", "PR number when first argument is a repository")
  .option(
    "--include-minimized",
    "include minimized comments (marked with reason)",
    false,
  )
  .option("--no-files", "omit the changed-files list")
  .option("--no-commits", "omit the commit list")
  .option("--timings", "print request timings to stderr", false)
  .option(
    "--comment-head-limit <n>",
    "comments to show at the start of a long comment list",
    parseIntArg(0, MAX_PAGE_SIZE),
    DEFAULT_COMMENT_HEAD_LIMIT,
  )
  .option(
    "--comment-tail-limit <n>",
    "comments to show at the end of a long comment list",
    parseIntArg(0, MAX_PAGE_SIZE),
    DEFAULT_COMMENT_TAIL_LIMIT,
  )
  .action(
    async (
      repoOrPr: string | undefined,
      prArg: string | undefined,
      opts: {
        includeMinimized: boolean;
        files: boolean;
        commits: boolean;
        timings: boolean;
        commentHeadLimit: number;
        commentTailLimit: number;
      },
    ) => {
      let repo: string;
      let prNumber: number;

      if (repoOrPr === undefined) {
        [repo, prNumber] = detectRepoAndPr();
      } else {
        const match = parsePrUrl(repoOrPr);
        if (match) {
          [repo, prNumber] = match;
        } else if (prArg !== undefined) {
          repo = repoOrPr;
          prNumber = parseInt(prArg, 10);
        } else {
          [repo, prNumber] = detectRepoAndPr(repoOrPr);
        }

        if (isNaN(prNumber) || prNumber <= 0) {
          fail(`"${repoOrPr}" is not a valid PR number`);
        }
      }
      try {
        const data = await fetchPRData(createClient(), repo, prNumber, {
          timings: opts.timings,
          commentHeadLimit: opts.commentHeadLimit,
          commentTailLimit: opts.commentTailLimit,
        });
        const renderOptions: RenderOptions = {
          includeMinimized: opts.includeMinimized,
          includeFiles: opts.files,
          includeCommits: opts.commits,
          commentHeadLimit: opts.commentHeadLimit,
          commentTailLimit: opts.commentTailLimit,
        };
        process.stdout.write(renderPR(data, renderOptions));
      } catch (error) {
        handleError(error);
      }
    },
  );

program
  .command("thread <thread-id>")
  .description(
    "Fetch and display all comments in a single review thread. " +
      "Pass the thread ID shown in `gh-pr-render` output (e.g. RT_kwDO...).",
  )
  .option(
    "--include-minimized",
    "include minimized comments (marked with reason)",
    false,
  )
  .action(async (threadId: string, opts: { includeMinimized: boolean }) => {
    try {
      const data = await fetchSingleThread(createClient(), threadId);
      process.stdout.write(
        renderSingleThread(
          data.thread,
          data.pullRequest,
          opts.includeMinimized,
        ),
      );
    } catch (error) {
      handleError(error);
    }
  });

program.parse();
