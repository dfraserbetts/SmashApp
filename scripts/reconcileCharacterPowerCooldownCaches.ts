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
  verifyBuilderDataCacheOnlyChanges,
  type ReconciliationCategory,
  type ReconciliationResult,
} from "./powerCooldownCacheReconciliation.shared";
import type { CharacterPower } from "../lib/characterBuilder/powers";

export const mutationSafety = RECONCILIATION_MUTATION_SAFETY;
const TOOL_NAME = "reconcileCharacterPowerCooldownCaches";

export function parseCharacterReconciliationArgs(args: readonly string[]) {
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function originalWithStoredCache(
  normalized: CharacterPower,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...normalized,
    cooldownTurns: raw.cooldownTurns,
    cooldownReduction: raw.cooldownReduction,
  };
}

type CharacterIdentity = {
  ownerId: string;
  ownerName: string;
  campaignId: string | null;
  campaignName: string | null;
  ownerArchived: boolean;
  level: number;
};

function unresolvedForCharacterPower(params: {
  identity: CharacterIdentity;
  category: ReconciliationCategory;
  raw: unknown;
  fallbackKey: string;
  fallbackName: string;
  error: string;
}): ReconciliationResult {
  const raw = record(params.raw);
  return unresolvedReconciliationResult({
    ...params.identity,
    category: params.category,
    powerId: text(raw?.id, params.fallbackKey),
    powerName: text(raw?.name, params.fallbackName),
    storedCooldownTurns: raw?.cooldownTurns,
    storedCooldownReduction: raw?.cooldownReduction,
    error: params.error,
  });
}

async function run() {
  loadEnvConfig(process.cwd());
  const [
    { prisma },
    { getActivePowerTuningSet },
    { normalizeBuilderData },
    { synchronizeCharacterPowerCooldownCaches },
    { DEFAULT_CHARACTER_POWER_SPEND_SCALAR },
  ] = await Promise.all([
    import("../prisma/client"),
    loadPowerTuningReader(),
    import("../lib/characterBuilder/core"),
    import("../lib/characterBuilder/powers"),
    import("../lib/config/characterBuilderTuningShared"),
  ]);
  try {
    const [tuning, characterBuilderTuning, characters] = await Promise.all([
      getActivePowerTuningSet(),
      prisma.characterBuilderTuning.findUnique({
        where: { id: "default" },
        select: { playerPowerSpendScalar: true, updatedAt: true },
      }),
      prisma.campaignCharacter.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          level: true,
          builderData: true,
          archivedAt: true,
          campaignId: true,
          campaign: { select: { id: true, name: true } },
        },
      }),
    ]);
    const playerPowerSpendScalar = characterBuilderTuning?.playerPowerSpendScalar
      ?? DEFAULT_CHARACTER_POWER_SPEND_SCALAR;
    const warnings: string[] = [];
    if (!characterBuilderTuning) {
      warnings.push(
        `Character Builder tuning row is absent; the committed default player-power spend scalar (${DEFAULT_CHARACTER_POWER_SPEND_SCALAR}) was used without creating a row.`,
      );
    }
    if (!tuning) {
      warnings.push("Active power tuning is missing; every persisted character power is unresolved.");
    }

    const results: ReconciliationResult[] = [];
    for (const character of characters) {
      const identity: CharacterIdentity = {
        ownerId: character.id,
        ownerName: character.name,
        campaignId: character.campaign.id ?? character.campaignId,
        campaignName: character.campaign.name,
        ownerArchived: character.archivedAt !== null,
        level: character.level,
      };
      const rawBuilder = record(character.builderData);
      if (!rawBuilder) {
        results.push(unresolvedForCharacterPower({
          identity,
          category: "CHARACTER_POWER",
          raw: null,
          fallbackKey: `${character.id}:builderData`,
          fallbackName: "Malformed builderData",
          error: "Character builderData is not an object.",
        }));
        continue;
      }

      const rawPowers = rawBuilder.powers === undefined
        ? []
        : Array.isArray(rawBuilder.powers)
          ? rawBuilder.powers
          : null;
      const rawSignature = rawBuilder.signatureMove ?? null;
      if (!rawPowers || (rawSignature !== null && !record(rawSignature))) {
        results.push(unresolvedForCharacterPower({
          identity,
          category: rawPowers ? "SIGNATURE_MOVE" : "CHARACTER_POWER",
          raw: rawPowers ? rawSignature : rawBuilder.powers,
          fallbackKey: `${character.id}:malformed-power-data`,
          fallbackName: "Malformed power data",
          error: rawPowers
            ? "Character signatureMove is not an object or null."
            : "Character builderData.powers is not an array.",
        }));
        continue;
      }

      if (!tuning) {
        rawPowers.forEach((rawPower, index) => {
          results.push(unresolvedForCharacterPower({
            identity,
            category: "CHARACTER_POWER",
            raw: rawPower,
            fallbackKey: `${character.id}:power:${index}`,
            fallbackName: `Power ${index + 1}`,
            error: "Active power tuning is required; no tuning was created or seeded.",
          }));
        });
        if (rawSignature !== null) {
          results.push(unresolvedForCharacterPower({
            identity,
            category: "SIGNATURE_MOVE",
            raw: rawSignature,
            fallbackKey: `${character.id}:signatureMove`,
            fallbackName: "Signature Move",
            error: "Active power tuning is required; no tuning was created or seeded.",
          }));
        }
        continue;
      }

      const normalized = normalizeBuilderData(character.builderData);
      const synchronized = synchronizeCharacterPowerCooldownCaches({
        level: character.level,
        powers: normalized.powers,
        signatureMove: normalized.signatureMove,
        tuningSnapshot: tuning,
        playerPowerSpendScalar,
      });
      if (!synchronized.ok) {
        rawPowers.forEach((rawPower, index) => {
          results.push(unresolvedForCharacterPower({
            identity,
            category: "CHARACTER_POWER",
            raw: rawPower,
            fallbackKey: `${character.id}:power:${index}`,
            fallbackName: `Power ${index + 1}`,
            error: synchronized.message,
          }));
        });
        if (rawSignature !== null) {
          results.push(unresolvedForCharacterPower({
            identity,
            category: "SIGNATURE_MOVE",
            raw: rawSignature,
            fallbackKey: `${character.id}:signatureMove`,
            fallbackName: "Signature Move",
            error: synchronized.message,
          }));
        }
        continue;
      }

      const characterResults: ReconciliationResult[] = [];
      for (const [index, rawPowerValue] of rawPowers.entries()) {
        const rawPower = record(rawPowerValue);
        const normalizedPower = normalized.powers[index];
        const synchronizedPower = synchronized.powers[index];
        const authority = synchronized.normalAuthorities[index];
        if (!rawPower || !normalizedPower || !synchronizedPower || !authority) {
          characterResults.push(unresolvedForCharacterPower({
            identity,
            category: "CHARACTER_POWER",
            raw: rawPowerValue,
            fallbackKey: `${character.id}:power:${index}`,
            fallbackName: `Power ${index + 1}`,
            error: !rawPower
              ? "Persisted character power is not an object."
              : "Character power could not be aligned after current normalization.",
          }));
          continue;
        }
        characterResults.push(resolvedReconciliationResult({
          ...identity,
          category: "CHARACTER_POWER",
          powerId: text(rawPower.id, `${character.id}:power:${index}`),
          powerName: text(rawPower.name, normalizedPower.name || `Power ${index + 1}`),
          originalPower: originalWithStoredCache(normalizedPower, rawPower),
          targetCooldownTurns: synchronizedPower.cooldownTurns,
          authority,
        }));
      }

      if (rawSignature !== null) {
        const rawPower = record(rawSignature);
        if (!rawPower || !normalized.signatureMove || !synchronized.signatureMove || !synchronized.signatureAuthority) {
          characterResults.push(unresolvedForCharacterPower({
            identity,
            category: "SIGNATURE_MOVE",
            raw: rawSignature,
            fallbackKey: `${character.id}:signatureMove`,
            fallbackName: "Signature Move",
            error: "Signature Move could not be aligned after current normalization.",
          }));
        } else {
          characterResults.push(resolvedReconciliationResult({
            ...identity,
            category: "SIGNATURE_MOVE",
            powerId: text(rawPower.id, `${character.id}:signatureMove`),
            powerName: text(rawPower.name, normalized.signatureMove.name || "Signature Move"),
            originalPower: originalWithStoredCache(normalized.signatureMove, rawPower),
            targetCooldownTurns: synchronized.signatureMove.cooldownTurns,
            authority: synchronized.signatureAuthority,
          }));
        }
      }

      const proposedBuilderData = structuredClone(character.builderData) as Record<string, unknown>;
      const proposedPowers = Array.isArray(proposedBuilderData.powers) ? proposedBuilderData.powers : [];
      synchronized.powers.forEach((power, index) => {
        const proposedPower = record(proposedPowers[index]);
        if (!proposedPower) return;
        proposedPower.cooldownTurns = power.cooldownTurns;
        proposedPower.cooldownReduction = power.cooldownReduction;
      });
      const proposedSignature = record(proposedBuilderData.signatureMove);
      if (proposedSignature && synchronized.signatureMove) {
        proposedSignature.cooldownTurns = synchronized.signatureMove.cooldownTurns;
        proposedSignature.cooldownReduction = synchronized.signatureMove.cooldownReduction;
      }
      const builderIntegrity = verifyBuilderDataCacheOnlyChanges(character.builderData, proposedBuilderData);
      if (!builderIntegrity.ok) {
        const error = `Builder-data integrity failure: proposed changes included ${builderIntegrity.changedPaths.join(", ")}.`;
        results.push(...characterResults.map((row) => unresolvedReconciliationResult({
          category: row.category,
          powerId: row.powerId,
          powerName: row.powerName,
          ownerId: row.ownerId,
          ownerName: row.ownerName,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          ownerArchived: row.ownerArchived,
          level: row.level,
          storedCooldownTurns: row.storedCooldownTurns,
          storedCooldownReduction: row.storedCooldownReduction,
          error,
        })));
      } else {
        results.push(...characterResults);
      }
    }

    if (!tuning && results.length === 0) {
      results.push(unresolvedReconciliationResult({
        category: "CHARACTER_POWER",
        powerId: "database:active-tuning",
        powerName: "Active power tuning",
        ownerId: "database",
        ownerName: "Database",
        campaignId: null,
        campaignName: null,
        ownerArchived: false,
        level: 0,
        error: "Active power tuning is required; no tuning was created or seeded.",
      }));
    }

    const repository = repositoryProvenance(process.cwd());
    return createReconciliationReport({
      scope: "CHARACTER",
      generatedAt: new Date().toISOString(),
      branch: repository.branch,
      commitSha: repository.commitSha,
      tuning: tuning
        ? { setId: tuning.setId, name: tuning.name, updatedAt: tuning.updatedAt }
        : { setId: null, name: null, updatedAt: null },
      ownerCount: characters.length,
      activeOwnerCount: characters.filter((character) => character.archivedAt === null).length,
      archivedOwnerCount: characters.filter((character) => character.archivedAt !== null).length,
      results,
      warnings,
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseCharacterReconciliationArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${formatDryRunHelp(TOOL_NAME, "Read-only reconciliation of persisted Character Builder power cooldown caches.")}\n`);
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
