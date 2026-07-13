import { loadEnvConfig } from "@next/env";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Prisma } from "@prisma/client";

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
  type DryRunCliOptions,
  type ReconciliationCategory,
  type ReconciliationResult,
} from "./powerCooldownCacheReconciliation.shared";
import {
  executeGuardedApply,
  formatApplyHuman,
  type ApplyTransactionEvidence,
  type ReconciliationApplyResult,
} from "./powerCooldownCacheReconciliation.apply";
import type { CharacterPower } from "../lib/characterBuilder/powers";

export const mutationSafety = RECONCILIATION_MUTATION_SAFETY;
export const applyMutationSafety = "GUARDED_TRANSACTIONAL_WRITE" as const;
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

type PowerLocation = { category: "CHARACTER_POWER"; index: number } | { category: "SIGNATURE_MOVE" };

async function run(options: DryRunCliOptions) {
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
          updatedAt: true,
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
    const preimages = new Map<string, { builderData: unknown; updatedAt: string; level: number }>();
    const locations = new Map<string, Map<string, PowerLocation>>();
    for (const character of characters) {
      preimages.set(character.id, {
        builderData: structuredClone(character.builderData),
        updatedAt: character.updatedAt.toISOString(),
        level: character.level,
      });
      const characterLocations = new Map<string, PowerLocation>();
      locations.set(character.id, characterLocations);
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
        const result = resolvedReconciliationResult({
          ...identity,
          category: "CHARACTER_POWER",
          powerId: text(rawPower.id, `${character.id}:power:${index}`),
          powerName: text(rawPower.name, normalizedPower.name || `Power ${index + 1}`),
          originalPower: originalWithStoredCache(normalizedPower, rawPower),
          targetCooldownTurns: synchronizedPower.cooldownTurns,
          authority,
        });
        result.proposedChangedPaths = result.proposedChangedPaths.map((path) => `powers[${index}].${path}`);
        characterLocations.set(result.powerId, { category: "CHARACTER_POWER", index });
        characterResults.push(result);
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
          const result = resolvedReconciliationResult({
            ...identity,
            category: "SIGNATURE_MOVE",
            powerId: text(rawPower.id, `${character.id}:signatureMove`),
            powerName: text(rawPower.name, normalized.signatureMove.name || "Signature Move"),
            originalPower: originalWithStoredCache(normalized.signatureMove, rawPower),
            targetCooldownTurns: synchronized.signatureMove.cooldownTurns,
            authority: synchronized.signatureAuthority,
          });
          result.proposedChangedPaths = result.proposedChangedPaths.map((path) => `signatureMove.${path}`);
          characterLocations.set(result.powerId, { category: "SIGNATURE_MOVE" });
          characterResults.push(result);
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
    const report = createReconciliationReport({
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
    if (!options.apply) return report;

    const mismatches = report.results.filter((row) => row.status === "MISMATCH");
    const affectedOwnerIds = Array.from(new Set(mismatches.map((row) => row.ownerId))).sort();
    return executeGuardedApply({
      options,
      report,
      preTransactionVerify: async () => {
        const [activeTuning, currentBuilderTuning, currentCharacters] = await Promise.all([
          prisma.powerTuningConfigSet.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
          }),
          prisma.characterBuilderTuning.findUnique({
            where: { id: "default" },
            select: { playerPowerSpendScalar: true, updatedAt: true },
          }),
          prisma.campaignCharacter.findMany({
            where: { id: { in: affectedOwnerIds } },
            orderBy: { id: "asc" },
            select: { id: true, level: true, builderData: true, updatedAt: true },
          }),
        ]);
        if (
          !activeTuning ||
          activeTuning.id !== report.tuning.setId ||
          activeTuning.updatedAt.toISOString() !== report.tuning.updatedAt
        ) {
          throw new Error("Active tuning drifted before character transaction entry.");
        }
        if (
          currentBuilderTuning?.playerPowerSpendScalar !== characterBuilderTuning?.playerPowerSpendScalar ||
          (currentBuilderTuning?.updatedAt.toISOString() ?? null) !==
            (characterBuilderTuning?.updatedAt.toISOString() ?? null)
        ) {
          throw new Error("Character Builder tuning drifted before transaction entry.");
        }
        if (currentCharacters.length !== affectedOwnerIds.length) {
          throw new Error("A planned character owner disappeared before transaction entry.");
        }
        for (const current of currentCharacters) {
          const preimage = preimages.get(current.id);
          if (
            !preimage ||
            preimage.level !== current.level ||
            preimage.updatedAt !== current.updatedAt.toISOString() ||
            stableJson(preimage.builderData) !== stableJson(current.builderData)
          ) {
            throw new Error(`Complete builderData preimage drifted before transaction entry for ${current.id}.`);
          }
        }
      },
      transaction: () => prisma.$transaction(async (tx): Promise<ApplyTransactionEvidence> => {
        const [activeTuning, currentBuilderTuning, currentCharacters] = await Promise.all([
          tx.powerTuningConfigSet.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
          }),
          tx.characterBuilderTuning.findUnique({
            where: { id: "default" },
            select: { playerPowerSpendScalar: true, updatedAt: true },
          }),
          tx.campaignCharacter.findMany({
            where: { id: { in: affectedOwnerIds } },
            orderBy: { id: "asc" },
            select: { id: true, level: true, builderData: true, updatedAt: true },
          }),
        ]);
        if (
          !activeTuning ||
          activeTuning.id !== report.tuning.setId ||
          activeTuning.updatedAt.toISOString() !== report.tuning.updatedAt
        ) {
          throw new Error("Active tuning drifted before the character transaction began.");
        }
        if (
          currentBuilderTuning?.playerPowerSpendScalar !== characterBuilderTuning?.playerPowerSpendScalar ||
          (currentBuilderTuning?.updatedAt.toISOString() ?? null) !==
            (characterBuilderTuning?.updatedAt.toISOString() ?? null)
        ) {
          throw new Error("Character Builder tuning drifted before the transaction began.");
        }
        if (currentCharacters.length !== affectedOwnerIds.length) {
          throw new Error("A planned character owner disappeared before transaction mutation.");
        }

        const expectedBuilderData = new Map<string, unknown>();
        for (const current of currentCharacters) {
          const preimage = preimages.get(current.id);
          if (
            !preimage ||
            preimage.level !== current.level ||
            preimage.updatedAt !== current.updatedAt.toISOString() ||
            stableJson(preimage.builderData) !== stableJson(current.builderData)
          ) {
            throw new Error(`Complete builderData preimage drifted for character ${current.id}.`);
          }
          const normalized = normalizeBuilderData(current.builderData);
          const synchronized = synchronizeCharacterPowerCooldownCaches({
            level: current.level,
            powers: normalized.powers,
            signatureMove: normalized.signatureMove,
            tuningSnapshot: tuning,
            playerPowerSpendScalar,
          });
          if (!synchronized.ok) throw new Error(synchronized.message);

          const nextBuilderData = structuredClone(current.builderData) as Record<string, unknown>;
          const nextPowers = Array.isArray(nextBuilderData.powers) ? nextBuilderData.powers : [];
          const ownerMismatches = mismatches.filter((row) => row.ownerId === current.id);
          for (const row of ownerMismatches) {
            const location = locations.get(current.id)?.get(row.powerId);
            if (!location) throw new Error(`Planned character power disappeared: ${current.id}/${row.powerId}.`);
            if (location.category === "CHARACTER_POWER") {
              const synchronizedPower = synchronized.powers[location.index];
              const rawPower = record(nextPowers[location.index]);
              if (!synchronizedPower || !rawPower) throw new Error(`Ordinary power alignment drifted for ${row.powerId}.`);
              if (
                synchronizedPower.cooldownTurns !== row.targetCooldownTurns ||
                synchronizedPower.cooldownReduction !== row.targetCooldownReduction
              ) {
                throw new Error(`Fresh ordinary-power target drifted for ${row.powerId}.`);
              }
              rawPower.cooldownTurns = row.targetCooldownTurns;
              rawPower.cooldownReduction = row.targetCooldownReduction;
            } else {
              const rawSignature = record(nextBuilderData.signatureMove);
              if (!synchronized.signatureMove || !rawSignature) {
                throw new Error(`Signature Move alignment drifted for ${row.powerId}.`);
              }
              if (
                synchronized.signatureMove.cooldownTurns !== row.targetCooldownTurns ||
                synchronized.signatureMove.cooldownReduction !== row.targetCooldownReduction
              ) {
                throw new Error(`Fresh Signature Move target drifted for ${row.powerId}.`);
              }
              rawSignature.cooldownTurns = row.targetCooldownTurns;
              rawSignature.cooldownReduction = row.targetCooldownReduction;
            }
          }
          const integrity = verifyBuilderDataCacheOnlyChanges(current.builderData, nextBuilderData);
          if (!integrity.ok) throw new Error(`Forbidden builderData change for character ${current.id}.`);
          const plannedPaths = ownerMismatches.flatMap((row) => row.proposedChangedPaths).sort();
          if (stableJson([...integrity.changedPaths].sort()) !== stableJson(plannedPaths)) {
            throw new Error(`BuilderData changed paths drifted for character ${current.id}.`);
          }
          expectedBuilderData.set(current.id, nextBuilderData);
          await tx.campaignCharacter.update({
            where: { id: current.id },
            data: { builderData: nextBuilderData as Prisma.InputJsonValue },
          });
        }

        const updatedCharacters = await tx.campaignCharacter.findMany({
          where: { id: { in: affectedOwnerIds } },
          orderBy: { id: "asc" },
          select: { id: true, builderData: true },
        });
        if (updatedCharacters.length !== affectedOwnerIds.length) {
          throw new Error("A character disappeared after builderData update.");
        }
        for (const updated of updatedCharacters) {
          const expected = expectedBuilderData.get(updated.id);
          const preimage = preimages.get(updated.id);
          if (!expected || stableJson(expected) !== stableJson(updated.builderData)) {
            throw new Error(`Post-update builderData verification failed for character ${updated.id}.`);
          }
          if (!preimage || !verifyBuilderDataCacheOnlyChanges(preimage.builderData, updated.builderData).ok) {
            throw new Error(`Semantic integrity changed for character ${updated.id}.`);
          }
        }
        return {
          attemptedChangeCount: mismatches.length,
          appliedChangeCount: mismatches.length,
          affectedOwnerCount: affectedOwnerIds.length,
          preVerificationResult: true,
          postVerificationResult: true,
          unchangedSemanticIntegrityResult: true,
        };
      }),
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
  const result = await run(options);
  if (options.apply) {
    const applyResult = result as ReconciliationApplyResult;
    process.stdout.write(`${options.json ? stableJson(applyResult) : formatApplyHuman(applyResult)}\n`);
    process.exitCode = applyResult.transactionStatus === "COMMITTED" ? 0 : 1;
  } else {
    const report = result as Awaited<ReturnType<typeof createReconciliationReport>>;
    process.stdout.write(`${options.json ? stableJson(report) : formatReconciliationHuman(report)}\n`);
    process.exitCode = reconciliationExitCode(report);
  }
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
