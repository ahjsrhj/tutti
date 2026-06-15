import type { AppUpdateChannel } from "../../shared/contracts/ipc.ts";

export interface PrefixedDesktopRelease {
  htmlUrl: string | null;
  name: string | null;
  publishedAt: string | null;
  tagName: string;
  version: string;
}

export type PrefixedDesktopReleaseResolver = (input: {
  channel: AppUpdateChannel;
  currentVersion: string;
}) => Promise<PrefixedDesktopRelease | null>;

export interface ParsedDesktopVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
}

const desktopReleaseTagPrefix = "tutti-desktop-v";
const desktopGithubReleasesUrl =
  "https://api.github.com/repos/tutti-os/tutti/releases?per_page=30";

export function stripDesktopReleaseTagPrefix(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(desktopReleaseTagPrefix)
    ? trimmed.slice(desktopReleaseTagPrefix.length)
    : trimmed;
}

export function parseDesktopVersion(
  value: string
): ParsedDesktopVersion | null {
  const normalized = stripDesktopReleaseTagPrefix(value).replace(/^v/, "");
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4].split(".").map((segment) => {
          return /^\d+$/.test(segment) ? Number(segment) : segment;
        })
      : []
  };
}

export function compareDesktopVersions(
  left: ParsedDesktopVersion,
  right: ParsedDesktopVersion
): number {
  const coreDelta =
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch;
  if (coreDelta !== 0) {
    return coreDelta;
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) {
    return 1;
  }
  if (left.prerelease.length > 0 && right.prerelease.length === 0) {
    return -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }
    const delta = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function createGitHubPrefixedDesktopReleaseResolver(): PrefixedDesktopReleaseResolver {
  return async ({ channel, currentVersion }) => {
    const current = parseDesktopVersion(currentVersion);
    const response = await fetch(desktopGithubReleasesUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Tutti Desktop Updater"
      }
    });
    if (!response.ok) {
      throw new Error(`GitHub releases request failed: ${response.status}`);
    }

    const releases: unknown = await response.json();
    if (!Array.isArray(releases)) {
      return null;
    }

    let selected: {
      parsedVersion: ParsedDesktopVersion;
      release: PrefixedDesktopRelease;
    } | null = null;

    for (const value of releases) {
      if (typeof value !== "object" || value === null) {
        continue;
      }
      const record = value as Record<string, unknown>;
      if (record.draft === true) {
        continue;
      }

      const tagName = readStringField(record, "tag_name");
      if (!tagName?.startsWith(desktopReleaseTagPrefix)) {
        continue;
      }

      const parsedVersion = parseDesktopVersion(tagName);
      if (!parsedVersion || !isReleaseInChannel(parsedVersion, channel)) {
        continue;
      }
      if (current && compareDesktopVersions(parsedVersion, current) <= 0) {
        continue;
      }
      if (
        selected &&
        compareDesktopVersions(parsedVersion, selected.parsedVersion) <= 0
      ) {
        continue;
      }

      selected = {
        parsedVersion,
        release: {
          htmlUrl: readStringField(record, "html_url"),
          name: readStringField(record, "name"),
          publishedAt: readStringField(record, "published_at"),
          tagName,
          version: stripDesktopReleaseTagPrefix(tagName)
        }
      };
    }

    return selected?.release ?? null;
  };
}

function comparePrereleaseIdentifier(
  left: number | string,
  right: number | string
): number {
  if (left === right) {
    return 0;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "number") {
    return -1;
  }
  if (typeof right === "number") {
    return 1;
  }
  return left.localeCompare(right);
}

function isReleaseInChannel(
  version: ParsedDesktopVersion,
  channel: AppUpdateChannel
): boolean {
  if (channel === "stable") {
    return version.prerelease.length === 0;
  }

  return version.prerelease[0] === channel;
}

function readStringField(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
