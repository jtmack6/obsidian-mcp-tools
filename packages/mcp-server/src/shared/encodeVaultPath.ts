/**
 * Encodes a vault-relative path for use in an Obsidian Local REST API URL.
 *
 * `encodeURIComponent` escapes `/` as `%2F`, which the Local REST API (v5.x)
 * does not decode back into a path separator — nested files 404. Encoding each
 * segment separately keeps the separators literal while still escaping spaces,
 * `#`, `?`, and other characters that would otherwise break the URL.
 *
 * Empty segments are preserved so callers can keep a trailing slash (used by
 * directory listing endpoints).
 */
export function encodeVaultPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
