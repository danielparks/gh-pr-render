#!/usr/bin/env node
import { execSync } from "child_process";
import { Command, InvalidArgumentError } from "commander";
import { fetchPRData } from "./fetch.js";
import { renderPR, type RenderOptions } from "./render.js";
import {
  DEFAULT_COMMENT_HEAD_LIMIT,
  DEFAULT_COMMENT_TAIL_LIMIT,
} from "./limits.js";
import metadata from "../package.json" with { type: "json" };

// `min` isn't just cosmetic for the head limit: renderReviewThread relies on
// a thread's first fetched comment for its diff-hunk header, so a head of 0
// would leave threads with no anchor comment to render at all.
function parseIntArg(min: number) {
  return (value: string): number => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min) {
      throw new InvalidArgumentError(
        `"${value}" is not a valid integer >= ${min}`,
      );
    }
    return parsed;
  };
}

function detectRepo(): string {
  const url = execSync("git remote get-url origin", {
    encoding: "utf8",
  }).trim();
  const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match?.[1]) {
    throw new Error(
      `Cannot parse GitHub repository from remote URL: ${url}\n` +
        `Pass repository explicitly: gh-pr-render owner/repo 123`,
    );
  }
  return match[1];
}

new Command()
  .name(metadata.name)
  .version(metadata.version)
  .description(metadata.description)
  .argument(
    "<repo-or-pr>",
    "GitHub PR URL, repository (owner/repo), or PR number",
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
    parseIntArg(1),
    DEFAULT_COMMENT_HEAD_LIMIT,
  )
  .option(
    "--comment-tail-limit <n>",
    "comments to show at the end of a long comment list",
    parseIntArg(0),
    DEFAULT_COMMENT_TAIL_LIMIT,
  )
  .action(
    async (
      repoOrPr: string,
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

      const urlMatch = repoOrPr.match(
        /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/,
      );
      if (urlMatch?.[1] && urlMatch[2]) {
        repo = urlMatch[1];
        prNumber = parseInt(urlMatch[2], 10);
      } else if (prArg !== undefined) {
        repo = repoOrPr;
        prNumber = parseInt(prArg, 10);
      } else {
        repo = detectRepo();
        prNumber = parseInt(repoOrPr, 10);
      }

      if (isNaN(prNumber)) {
        console.error(`Error: "${repoOrPr}" is not a valid PR number`);
        process.exit(1);
      }

      const data = await fetchPRData(repo, prNumber, {
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
    },
  )
  .parse();
