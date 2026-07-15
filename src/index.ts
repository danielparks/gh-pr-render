#!/usr/bin/env node
import { execSync } from "child_process";
import { Command } from "commander";
import { fetchPRData } from "./fetch.js";
import { renderPR, type RenderOptions } from "./render.js";
import metadata from "../package.json" with { type: "json" };

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
  )
  .option("--timings", "print request timings to stderr")
  .action(
    async (
      repoOrPr: string,
      prArg: string | undefined,
      opts: { includeMinimized?: boolean; timings?: boolean },
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
        timings: opts.timings ?? false,
      });
      const renderOptions: RenderOptions = {
        includeMinimized: opts.includeMinimized ?? false,
      };
      process.stdout.write(renderPR(data, renderOptions));
    },
  )
  .parse();
