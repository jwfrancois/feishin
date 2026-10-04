// Next.js instrumentation hook — starts the Library Agent scheduler when the
// server process boots (Node.js runtime only, skipped during build).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureAgentStarted } = await import("./lib/agent/scheduler");
      ensureAgentStarted();
    } catch (err) {
      console.warn("[agent] failed to start from instrumentation:", err instanceof Error ? err.message : err);
    }
  }
}
