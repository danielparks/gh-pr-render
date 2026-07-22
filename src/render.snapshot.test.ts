import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { renderPR } from "./render.js";
import type { PRData } from "./types.js";

function loadFixture(owner: string, repo: string, prNumber: number): PRData {
  const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));
  const path = join(fixturesDir, owner, repo, `${prNumber}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as PRData;
}

function snapshotPath(
  owner: string,
  repo: string,
  prNumber: number,
  variant: string,
): string {
  const snapshotsDir = fileURLToPath(new URL("../snapshots", import.meta.url));
  return join(snapshotsDir, `${owner}-${repo}-${prNumber}${variant}.md`);
}

describe("renderPR - danielparks/htmlize #66", () => {
  const data = loadFixture("danielparks", "htmlize", 66);

  it("renders without minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 20,
        commentTailLimit: 20,
      }),
    ).toMatchFileSnapshot(snapshotPath("danielparks", "htmlize", 66, ""));
  });

  it("renders with minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: true,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 20,
        commentTailLimit: 20,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks", "htmlize", 66, ".with-minimized"),
    );
  });

  it("renders with minimized comments and 0 head limit and 0 tail limit", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: true,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 0,
        commentTailLimit: 0,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks", "htmlize", 66, ".with-minimized.head0.tail0"),
    );
  });

  it("renders with minimized comments and 0 head limit and 1 tail limit", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: true,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 0,
        commentTailLimit: 1,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks", "htmlize", 66, ".with-minimized.head0.tail1"),
    );
  });

  it("renders with minimized comments and 1 head limit and 0 tail limit", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: true,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 1,
        commentTailLimit: 0,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks", "htmlize", 66, ".with-minimized.head1.tail0"),
    );
  });

  it("renders with minimized comments and 1 head limit and 1 tail limit", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: true,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 1,
        commentTailLimit: 1,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks", "htmlize", 66, ".with-minimized.head1.tail1"),
    );
  });
});

describe("renderPR - danielparks-test/gh-pr-render-fixtures #1", () => {
  const data = loadFixture("danielparks-test", "gh-pr-render-fixtures", 1);

  it("renders without minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 20,
        commentTailLimit: 20,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks-test", "gh-pr-render-fixtures", 1, ""),
    );
  });

  it("renders with minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: true,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 20,
        commentTailLimit: 20,
      }),
    ).toMatchFileSnapshot(
      snapshotPath(
        "danielparks-test",
        "gh-pr-render-fixtures",
        1,
        ".with-minimized",
      ),
    );
  });

  it("renders without the changed-files list", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: false,
        includeCommits: true,
        commentHeadLimit: 20,
        commentTailLimit: 20,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks-test", "gh-pr-render-fixtures", 1, ".no-files"),
    );
  });

  it("renders without the commits list", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: true,
        includeCommits: false,
        commentHeadLimit: 20,
        commentTailLimit: 20,
      }),
    ).toMatchFileSnapshot(
      snapshotPath(
        "danielparks-test",
        "gh-pr-render-fixtures",
        1,
        ".no-commits",
      ),
    );
  });

  it("renders without either the changed-files or commits list", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: false,
        includeCommits: false,
        commentHeadLimit: 20,
        commentTailLimit: 20,
      }),
    ).toMatchFileSnapshot(
      snapshotPath(
        "danielparks-test",
        "gh-pr-render-fixtures",
        1,
        ".no-files-no-commits",
      ),
    );
  });
});

describe("renderPR - danielparks-test/gh-pr-render-fixtures #2", () => {
  const data = loadFixture("danielparks-test", "gh-pr-render-fixtures", 2);

  it("renders without minimized comments", async () => {
    await expect(
      renderPR(data, {
        includeMinimized: false,
        includeFiles: true,
        includeCommits: true,
        commentHeadLimit: 20,
        commentTailLimit: 20,
      }),
    ).toMatchFileSnapshot(
      snapshotPath("danielparks-test", "gh-pr-render-fixtures", 2, ""),
    );
  });
});
