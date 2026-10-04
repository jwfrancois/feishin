// Kinds of agent findings that have Jellyfin write-back writers
// (see src/lib/agent/writeback.ts). Shared by the server (batch query,
// single apply) and the dashboard UI (write buttons) so they never drift.
// Other kinds (e.g. "sound" Auto-EQ profiles, "discography" listings) are
// in-app knowledge only and are never eligible for server write-back.
export const WRITABLE_KINDS = ["bio", "artwork", "metadata", "lyrics"] as const;

export type WritableKind = (typeof WRITABLE_KINDS)[number];

export function isWritableKind(kind: string): boolean {
  return (WRITABLE_KINDS as readonly string[]).includes(kind);
}
