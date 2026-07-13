import { loadEnvConfig } from "@next/env";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  RECONCILIATION_MUTATION_SAFETY,
  createReconciliationReport,
  formatDryRunHelp,
  formatReconciliationHuman,
  parseDryRunCliArgs,
  reconciliationExitCode,
  resolvedReconciliationResult,
  stableJson,
  unresolvedReconciliationResult,
} from "./powerCooldownCacheReconciliation.shared";
import type { Power } from "../lib/summoning/types";

export const mutationSafety = RECONCILIATION_MUTATION_SAFETY;
const TOOL_NAME = "reconcileMonsterPowerCooldownCaches";

export function parseMonsterReconciliationArgs(args: readonly string[]) {
  return parseDryRunCliArgs(args, TOOL_NAME);
}

async function loadPowerTuningReader() {
  const { default: Module } = await import("node:module");
  type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;
  const moduleLoader = Module as unknown as { _load: ModuleLoad };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function load(request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await import("../lib/config/powerTuning");
  } finally {
    moduleLoader._load = originalLoad;
  }
}

function repositoryProvenance(root: string): { branch: string; commitSha: string } {
  const dotGit = join(root, ".git");
  const gitDirectory = existsSync(dotGit) && statSync(dotGit).isFile()
    ? resolve(dirname(dotGit), readFileSync(dotGit, "utf8").slice("gitdir:".length).trim())
    : dotGit;
  const head = readFileSync(join(gitDirectory, "HEAD"), "utf8").trim();
  if (!head.startsWith("ref: ")) return { branch: "detached", commitSha: head };
  const reference = head.slice("ref: ".length);
  const looseReference = join(gitDirectory, ...reference.split("/"));
  let commitSha = existsSync(looseReference) ? readFileSync(looseReference, "utf8").trim() : "unknown";
  if (commitSha === "unknown" && existsSync(join(gitDirectory, "packed-refs"))) {
    const match = readFileSync(join(gitDirectory, "packed-refs"), "utf8")
      .split(/\r?\n/)
      .find((line) => line.endsWith(` ${reference}`));
    commitSha = match?.split(" ")[0] ?? "unknown";
  }
  return { branch: reference.replace(/^refs\/heads\//, ""), commitSha };
}

function toPower(row: Record<string, unknown>): Power {
  const rangeRows = Array.isArray(row.rangeCategories) ? row.rangeCategories : [];
  const packetRows = Array.isArray(row.effectPackets) ? row.effectPackets : [];
  const packets = packetRows.map((packet) => {
    const packetRecord = packet as Record<string, unknown>;
    return {
      ...packetRecord,
      detailsJson: packetRecord.detailsJson,
      localTargetingOverride: packetRecord.localTargetingOverride ?? null,
    };
  });
  return {
    ...row,
    rangeCategories: rangeRows.map((range) => (range as { rangeCategory: string }).rangeCategory) as Power["rangeCategories"],
    effectPackets: packets,
    intentions: packets,
  } as unknown as Power;
}

async function run() {
  loadEnvConfig(process.cwd());
  const [{ prisma }, { getActivePowerTuningSet }, { synchronizePowerCooldownCache }] = await Promise.all([
    import("../prisma/client"),
    loadPowerTuningReader(),
    import("../lib/summoning/powerCooldownCacheSynchronization"),
  ]);
  try {
    const [tuning, monsters] = await Promise.all([
      getActivePowerTuningSet(),
      prisma.monster.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          level: true,
          tier: true,
          campaignId: true,
          Campaign: { select: { id: true, name: true } },
          powers: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            include: {
              rangeCategories: { orderBy: { rangeCategory: "asc" } },
              primaryDefenceGate: true,
              effectPackets: {
                orderBy: { packetIndex: "asc" },
                include: { localTargetingOverride: true },
              },
            },
          },
        },
      }),
    ]);
    const results = monsters.flatMap((monster) =>
      monster.powers.map((row) => {
        const identity = {
          category: "MONSTER_POWER" as const,
          powerId: row.id,
          powerName: row.name,
          ownerId: monster.id,
          ownerName: monster.name,
          campaignId: monster.Campaign?.id ?? monster.campaignId,
          campaignName: monster.Campaign?.name ?? (monster.campaignId ? null : "Core"),
          ownerArchived: false,
          level: monster.level,
          tier: monster.tier,
        };
        if (!tuning) {
          return unresolvedReconciliationResult({
            ...identity,
            storedCooldownTurns: row.cooldownTurns,
            storedCooldownReduction: row.cooldownReduction,
            error: "Active power tuning is required; no tuning was created or seeded.",
          });
        }
        const power = toPower(row as unknown as Record<string, unknown>);
        const synchronized = synchronizePowerCooldownCache({
          power,
          tuningSnapshot: tuning,
          context: { level: monster.level, tier: monster.tier },
        });
        if (!synchronized.ok) {
          return unresolvedReconciliationResult({
            ...identity,
            storedCooldownTurns: row.cooldownTurns,
            storedCooldownReduction: row.cooldownReduction,
            error: synchronized.message,
          });
        }
        return resolvedReconciliationResult({
          ...identity,
          originalPower: power as unknown as Record<string, unknown>,
          targetCooldownTurns: synchronized.power.cooldownTurns,
          authority: synchronized.authority,
        });
      }),
    );
    const repository = repositoryProvenance(process.cwd());
    return createReconciliationReport({
      scope: "MONSTER",
      generatedAt: new Date().toISOString(),
      branch: repository.branch,
      commitSha: repository.commitSha,
      tuning: tuning
        ? { setId: tuning.setId, name: tuning.name, updatedAt: tuning.updatedAt }
        : { setId: null, name: null, updatedAt: null },
      ownerCount: monsters.length,
      activeOwnerCount: monsters.length,
      archivedOwnerCount: 0,
      results,
      warnings: [
        "Monster has no archived-state field; all persisted monster owners are reported as active.",
        ...(!tuning ? ["Active power tuning is missing; every persisted monster power is unresolved."] : []),
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseMonsterReconciliationArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${formatDryRunHelp(TOOL_NAME, "Read-only reconciliation of persisted monster Power cooldown caches.")}\n`);
    return;
  }
  const report = await run();
  process.stdout.write(`${options.json ? stableJson(report) : formatReconciliationHuman(report)}\n`);
  process.exitCode = reconciliationExitCode(report);
}

const isMain = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  main().catch((error: unknown) => {
    process.stderr.write(`[${TOOL_NAME}] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
