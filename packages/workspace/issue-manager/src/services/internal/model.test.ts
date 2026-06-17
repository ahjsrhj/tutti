import assert from "node:assert/strict";
import test from "node:test";
import {
  createIssueManagerDate,
  formatIssueManagerDate,
  formatIssueManagerTimestamp,
  resolveIssueManagerStatusLabel
} from "./model.ts";
import type { IssueManagerI18nRuntime } from "../../i18n/index.ts";

test("createIssueManagerDate normalizes unix seconds to milliseconds", () => {
  const date = createIssueManagerDate(1_748_374_400);
  assert.ok(date instanceof Date);
  assert.equal(date?.getTime(), 1_748_374_400_000);
});

test("createIssueManagerDate preserves millisecond timestamps", () => {
  const date = createIssueManagerDate(1_748_374_400_000);
  assert.ok(date instanceof Date);
  assert.equal(date?.getTime(), 1_748_374_400_000);
});

test("formatIssueManagerDate returns an empty string for invalid values", () => {
  assert.equal(formatIssueManagerDate(null), "");
  assert.equal(formatIssueManagerDate(Number.NaN), "");
});

test("formatIssueManagerTimestamp uses the shared English short date-time format", () => {
  const timestamp = new Date(2026, 4, 23, 12, 14).getTime();

  assert.equal(formatIssueManagerTimestamp(timestamp), "May 23, 12:14");
});

test("status label folds legacy in_progress into running copy", () => {
  const copy = createCopy();

  assert.equal(
    resolveIssueManagerStatusLabel(copy, "in_progress"),
    "status.running"
  );
});

function createCopy(): IssueManagerI18nRuntime {
  return {
    t(key: string) {
      return key;
    }
  } as IssueManagerI18nRuntime;
}
