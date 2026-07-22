import "vitest";

declare module "vitest" {
  interface Assertion<T> {
    toContainExactly(substring: string, expectedCount: number): T;
  }
}
