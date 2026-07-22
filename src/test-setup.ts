import { expect } from "vitest";

expect.extend({
  toContainExactly(received: string, substring: string, expectedCount: number) {
    const count = received.split(substring).length - 1;
    const pass = count === expectedCount;
    return {
      pass,
      message: () =>
        `expected "${received}" to contain "${substring}" exactly ` +
        `${expectedCount} time(s), but found it ${count} time(s)`,
    };
  },
});
