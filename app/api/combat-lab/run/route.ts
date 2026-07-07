import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
} from "@/lib/combat-lab/liveAdapters";
import { createActorInstances } from "@/lib/combat-lab/combatState";
import { ensureCharacterBuilderTuning } from "@/lib/config/characterBuilderTuning";
import { getProtectionTuning } from "@/lib/config/combatTuning";
import { ensureSeedPowerTuningSet } from "@/lib/config/powerTuning";
import { runScenarioSuite } from "@/lib/combat-lab/reporting";
import type { CombatTurnOrder } from "@/lib/combat-lab/types";
import { prisma } from "@/prisma/client";

type RunRequestBody = {
  campaignId?: unknown;
  characterIds?: unknown;
  monsters?: unknown;
  monsterIds?: unknown;
  runs?: unknown;
  turnOrder?: unknown;
};

type MonsterSelection = {
  monsterId: string;
  quantity: number;
};

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

const ITEM_TEMPLATE_INCLUDE = {
  rangeCategories: { select: { rangeCategory: true } },
  meleeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  rangedDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  aoeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  attackEffectsMelee: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsRanged: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsAoE: { select: { attackEffect: { select: { name: true } } } },
  vrpEntries: { select: { effectKind: true, magnitude: true, damageType: { select: { name: true } } } },
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}

function parseMonsterSelections(body: RunRequestBody): { selections: MonsterSelection[]; error?: string } {
  const merged = new Map<string, number>();
  if (Array.isArray(body.monsters)) {
    for (const entry of body.monsters) {
      if (!entry || typeof entry !== "object") {
        return { selections: [], error: "Each monster selection must include monsterId and quantity" };
      }
      const raw = entry as { monsterId?: unknown; quantity?: unknown };
      const monsterId = typeof raw.monsterId === "string" ? raw.monsterId.trim() : "";
      const quantityValue = typeof raw.quantity === "number" ? raw.quantity : Number(raw.quantity);
      if (!monsterId) return { selections: [], error: "Monster selection monsterId is required" };
      if (!Number.isInteger(quantityValue) || quantityValue < 1 || quantityValue > 30) {
        return { selections: [], error: "Monster quantity must be an integer between 1 and 30" };
      }
      merged.set(monsterId, (merged.get(monsterId) ?? 0) + quantityValue);
    }
  } else {
    for (const monsterId of stringList(body.monsterIds)) {
      merged.set(monsterId, (merged.get(monsterId) ?? 0) + 1);
    }
  }

  const selections = [...merged.entries()].map(([monsterId, quantity]) => ({ monsterId, quantity }));
  if (selections.some((selection) => selection.quantity > 30)) {
    return { selections: [], error: "Monster quantity must be between 1 and 30 per monster" };
  }
  const totalInstances = selections.reduce((sum, selection) => sum + selection.quantity, 0);
  if (totalInstances > 50) {
    return { selections: [], error: "Total monster instances cannot exceed 50" };
  }
  return { selections };
}

function runCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}

function turnOrder(value: unknown): CombatTurnOrder {
  return value === "playersFirst" ||
    value === "monstersFirst" ||
    value === "randomSeeded" ||
    value === "alternatingByRound"
    ? value
    : "alternatingByRound";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RunRequestBody;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
    const characterIds = stringList(body.characterIds);
    const { selections: monsterSelections, error: monsterSelectionError } = parseMonsterSelections(body);
    const monsterIds = monsterSelections.map((selection) => selection.monsterId);
    const runs = runCount(body.runs);
    const selectedTurnOrder = turnOrder(body.turnOrder);

    if (monsterSelectionError) {
      return NextResponse.json({ error: monsterSelectionError }, { status: 400 });
    }
    if (!campaignId || characterIds.length === 0 || monsterSelections.length === 0) {
      return NextResponse.json(
        { error: "campaignId, characterIds, and monsters are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const [campaign, characters, monsters, protectionTuning, powerTuning, characterBuilderTuning] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true, descriptorVersionTag: true },
      }),
      prisma.campaignCharacter.findMany({
        where: { campaignId, id: { in: characterIds }, archivedAt: null },
        include: {
          backpackItems: {
            include: {
              partyInventoryItem: {
                include: {
                  itemTemplate: {
                    include: ITEM_TEMPLATE_INCLUDE,
                  },
                },
              },
            },
          },
        },
      }),
      prisma.monster.findMany({
        where: { campaignId, id: { in: monsterIds }, source: "CAMPAIGN", isReadOnly: false },
        include: {
          naturalAttack: true,
          attacks: { orderBy: { sortOrder: "asc" } },
          traits: {
            orderBy: { sortOrder: "asc" },
            include: { trait: { select: { name: true, effectText: true } } },
          },
          powers: {
            orderBy: { sortOrder: "asc" },
            include: POWER_INCLUDE,
          },
        },
      }),
      getProtectionTuning(),
      ensureSeedPowerTuningSet(),
      ensureCharacterBuilderTuning(),
    ]);

    const monsterItemIds = Array.from(
      new Set(
        monsters.flatMap((monster) => [
          monster.mainHandItemId,
          monster.offHandItemId,
          monster.smallItemId,
          monster.headArmorItemId,
          monster.shoulderArmorItemId,
          monster.torsoArmorItemId,
          monster.legsArmorItemId,
          monster.feetArmorItemId,
          monster.headItemId,
          monster.neckItemId,
          monster.armsItemId,
          monster.beltItemId,
        ]).filter(Boolean) as string[],
      ),
    );
    const monsterEquipmentRows =
      monsterItemIds.length > 0
        ? await prisma.itemTemplate.findMany({
            where: { campaignId, id: { in: monsterItemIds } },
            include: ITEM_TEMPLATE_INCLUDE,
          })
        : [];
    const monsterEquipmentById = new Map(
      monsterEquipmentRows.map((item) => [item.id, itemTemplateToSummoningEquipmentItem(item)]),
    );

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (characters.length !== characterIds.length || monsters.length !== monsterIds.length) {
      return NextResponse.json(
        { error: "One or more selected combatants were not found in this campaign" },
        { status: 404 },
      );
    }

    const adaptedCharacters = characters.map((character) =>
      adaptCampaignCharacterToCombatActor(
        character,
        protectionTuning,
        powerTuning,
        characterBuilderTuning.playerPowerSpendScalar,
      ),
    );
    const monsterById = new Map(monsters.map((monster) => [monster.id, monster]));
    const adaptedMonsters = monsterSelections.map((selection) => {
      const monster = monsterById.get(selection.monsterId);
      if (!monster) throw new Error("SELECTED_MONSTER_NOT_FOUND");
      return {
        ...adaptMonsterToCombatLabActor(monster, monsterEquipmentById, protectionTuning, powerTuning),
        quantity: selection.quantity,
      };
    });
    const monsterInstances = adaptedMonsters.flatMap((entry) => createActorInstances(entry.actor, entry.quantity));
    const report = runScenarioSuite({
      name: `${campaign.name}: selected campaign combatants`,
      players: adaptedCharacters.map((entry) => entry.actor),
      monsters: monsterInstances,
      runs,
      seed: Date.now() % 100000,
      maxRounds: 20,
      turnOrder: selectedTurnOrder,
    });

    return NextResponse.json({
      campaign,
      selectedCharacters: adaptedCharacters.map((entry) => ({
        id: entry.actor.id,
        name: entry.actor.name,
        level: entry.actor.level,
        actionCount: entry.actor.actions.length,
        actions: entry.actor.actions.map((action) => ({
          id: action.id,
          name: action.name,
          sourceType: action.sourceType,
          supported: action.supported,
          kind: action.kind,
          potency: action.potency,
          cooldownRounds: action.cooldownRounds,
          recurring: action.recurring ?? null,
          damageApplicationTiming: action.damageApplicationTiming ?? null,
          durationKind: action.durationKind ?? null,
          durationSource: action.durationSource ?? null,
          passiveDuration: action.passiveDuration ?? false,
          sourcePacketTiming: action.source?.packet?.effectTimingType ?? null,
          sourcePacketDuration: action.source?.packet?.effectDurationType ?? null,
          sourcePacketDurationTurns: action.source?.packet?.effectDurationTurns ?? null,
          targetCount: action.targetCount,
          rangeCategory: action.rangeCategory,
          abstractionNotes: action.abstractionNotes ?? [],
          secondaryActionCount: action.secondaryActions?.length ?? 0,
          secondaryActions: (action.secondaryActions ?? []).map((secondaryAction) => ({
            id: secondaryAction.id,
            name: secondaryAction.name,
            kind: secondaryAction.kind,
            potency: secondaryAction.potency,
            cooldownRounds: secondaryAction.cooldownRounds,
            recurring: secondaryAction.recurring ?? null,
            damageApplicationTiming: secondaryAction.damageApplicationTiming ?? null,
            durationKind: secondaryAction.durationKind ?? null,
            durationSource: secondaryAction.durationSource ?? null,
            passiveDuration: secondaryAction.passiveDuration ?? false,
            sourcePacketTiming: secondaryAction.source?.packet?.effectTimingType ?? null,
            sourcePacketDuration: secondaryAction.source?.packet?.effectDurationType ?? null,
            sourcePacketDurationTurns: secondaryAction.source?.packet?.effectDurationTurns ?? null,
            targetCount: secondaryAction.targetCount,
            rangeCategory: secondaryAction.rangeCategory,
          })),
        })),
      })),
      selectedMonsters: adaptedMonsters.map((entry) => ({
        id: entry.actor.id,
        name: entry.actor.name,
        level: entry.actor.level,
        tier: entry.actor.tier,
        quantity: entry.quantity,
        actionCount: entry.actor.actions.length,
        actions: entry.actor.actions.map((action) => ({
          id: action.id,
          name: action.name,
          sourceType: action.sourceType,
          supported: action.supported,
          kind: action.kind,
          potency: action.potency,
          cooldownRounds: action.cooldownRounds,
          recurring: action.recurring ?? null,
          damageApplicationTiming: action.damageApplicationTiming ?? null,
          durationKind: action.durationKind ?? null,
          durationSource: action.durationSource ?? null,
          passiveDuration: action.passiveDuration ?? false,
          sourcePacketTiming: action.source?.packet?.effectTimingType ?? null,
          sourcePacketDuration: action.source?.packet?.effectDurationType ?? null,
          sourcePacketDurationTurns: action.source?.packet?.effectDurationTurns ?? null,
          targetCount: action.targetCount,
          rangeCategory: action.rangeCategory,
          abstractionNotes: action.abstractionNotes ?? [],
          secondaryActionCount: action.secondaryActions?.length ?? 0,
          secondaryActions: (action.secondaryActions ?? []).map((secondaryAction) => ({
            id: secondaryAction.id,
            name: secondaryAction.name,
            kind: secondaryAction.kind,
            potency: secondaryAction.potency,
            cooldownRounds: secondaryAction.cooldownRounds,
            recurring: secondaryAction.recurring ?? null,
            damageApplicationTiming: secondaryAction.damageApplicationTiming ?? null,
            durationKind: secondaryAction.durationKind ?? null,
            durationSource: secondaryAction.durationSource ?? null,
            passiveDuration: secondaryAction.passiveDuration ?? false,
            sourcePacketTiming: secondaryAction.source?.packet?.effectTimingType ?? null,
            sourcePacketDuration: secondaryAction.source?.packet?.effectDurationType ?? null,
            sourcePacketDurationTurns: secondaryAction.source?.packet?.effectDurationTurns ?? null,
            targetCount: secondaryAction.targetCount,
            rangeCategory: secondaryAction.rangeCategory,
          })),
        })),
      })),
      hydrationWarnings: [
        ...adaptedCharacters.flatMap((entry) => entry.warnings),
        ...adaptedMonsters.flatMap((entry) => entry.warnings),
      ],
      report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "SELECTED_MONSTER_NOT_FOUND") {
      return NextResponse.json(
        { error: "One or more selected combatants were not found in this campaign" },
        { status: 404 },
      );
    }
    console.error("[COMBAT_LAB_RUN]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
