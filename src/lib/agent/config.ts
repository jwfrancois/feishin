// Library Agent — configuration singleton (persisted in SQLite, hot-editable from the dashboard)
import { db } from "@/lib/db";

export interface AgentSources {
  musicbrainz: boolean;
  deezer: boolean;
  itunes: boolean;
  coverart: boolean;
  wikipedia: boolean;
  lrclib: boolean;
  fanart: boolean;
}

export const DEFAULT_SOURCES: AgentSources = {
  musicbrainz: true,
  deezer: true,
  itunes: true,
  coverart: true,
  wikipedia: true,
  lrclib: true,
  fanart: true,
};

export interface AgentConfigData {
  enabled: boolean;
  scanIntervalMin: number;
  healthIntervalMin: number;
  batchSize: number;
  writeBack: "off" | "manual" | "auto";
  sources: AgentSources;
  fanartApiKey: string;
  lastStage: "albums" | "artists";
  auditCursor: number;
}

let configCache: { data: AgentConfigData; ts: number } | null = null;
const CONFIG_TTL_MS = 5_000; // keep dashboard edits responsive without hammering SQLite

export async function ensureConfig(): Promise<AgentConfigData> {
  if (configCache && Date.now() - configCache.ts < CONFIG_TTL_MS) return configCache.data;
  let row = await db.agentConfig.findUnique({ where: { id: "singleton" } });
  if (!row) {
    row = await db.agentConfig.create({ data: { id: "singleton", sources: JSON.stringify(DEFAULT_SOURCES) } }).catch(async () => {
      // race with another route creating it
      return (await db.agentConfig.findUnique({ where: { id: "singleton" } }))!;
    });
  }
  let sources: AgentSources = { ...DEFAULT_SOURCES };
  try {
    sources = { ...DEFAULT_SOURCES, ...(JSON.parse(row.sources) as Partial<AgentSources>) };
  } catch {
    /* keep defaults */
  }
  const data: AgentConfigData = {
    enabled: row.enabled,
    scanIntervalMin: row.scanIntervalMin,
    healthIntervalMin: row.healthIntervalMin,
    batchSize: row.batchSize,
    writeBack: row.writeBack === "auto" ? "auto" : row.writeBack === "off" ? "off" : "manual",
    sources,
    fanartApiKey: row.fanartApiKey ?? "",
    lastStage: row.lastStage === "artists" ? "artists" : "albums",
    auditCursor: row.auditCursor ?? 0,
  };
  configCache = { data, ts: Date.now() };
  return data;
}

export async function updateConfig(patch: Partial<AgentConfigData>): Promise<AgentConfigData> {
  await ensureConfig();
  const row = await db.agentConfig.update({
    where: { id: "singleton" },
    data: {
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.scanIntervalMin !== undefined ? { scanIntervalMin: Math.max(1, Math.min(1440, Math.round(patch.scanIntervalMin))) } : {}),
      ...(patch.healthIntervalMin !== undefined ? { healthIntervalMin: Math.max(1, Math.min(1440, Math.round(patch.healthIntervalMin))) } : {}),
      ...(patch.batchSize !== undefined ? { batchSize: Math.max(1, Math.min(100, Math.round(patch.batchSize))) } : {}),
      ...(patch.writeBack !== undefined ? { writeBack: patch.writeBack === "auto" ? "auto" : patch.writeBack === "off" ? "off" : "manual" } : {}),
      ...(patch.fanartApiKey !== undefined ? { fanartApiKey: patch.fanartApiKey.trim() || null } : {}),
      ...(patch.lastStage !== undefined ? { lastStage: patch.lastStage } : {}),
      ...(patch.auditCursor !== undefined ? { auditCursor: Math.max(0, Math.round(patch.auditCursor)) } : {}),
      ...(patch.sources !== undefined ? { sources: JSON.stringify({ ...DEFAULT_SOURCES, ...patch.sources }) } : {}),
    },
  });
  configCache = null;
  let sources: AgentSources = { ...DEFAULT_SOURCES };
  try {
    sources = { ...DEFAULT_SOURCES, ...(JSON.parse(row.sources) as Partial<AgentSources>) };
  } catch {
    /* defaults */
  }
  return {
    enabled: row.enabled,
    scanIntervalMin: row.scanIntervalMin,
    healthIntervalMin: row.healthIntervalMin,
    batchSize: row.batchSize,
    writeBack: row.writeBack === "auto" ? "auto" : row.writeBack === "off" ? "off" : "manual",
    sources,
    fanartApiKey: row.fanartApiKey ?? "",
    lastStage: row.lastStage === "artists" ? "artists" : "albums",
    auditCursor: row.auditCursor ?? 0,
  };
}

export function invalidateConfigCache(): void {
  configCache = null;
}
