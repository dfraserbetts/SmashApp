import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
} from "@/lib/combat-lab/liveAdapters";
import { getProtectionTuning } from "@/lib/config/combatTuning";
import { runScenarioSuite } from "@/lib/combat-lab/reporting";
import type { CombatTurnOrder } from "@/lib/combat-lab/types";
import { prisma } from "@/prisma/client";

type RunRequestBody = {
  campaignId?: unknown;
  characterIds?: unknown;
  monsterIds?: unknown;
  runs?: unknown;
  turnOrder?: unknown;
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
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
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
    const monsterIds = stringList(body.monsterIds);
    const runs = runCount(body.runs);
    const selectedTurnOrder = turnOrder(body.turnOrder);

    if (!campaignId || characterIds.length === 0 || monsterIds.length === 0) {
      return NextResponse.json(
        { error: "campaignId, characterIds, and monsterIds are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const [campaign, characters, monsters, protectionTuning] = await Promise.all([
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
    ]);

    const monsterItemIds = Array.from(
      new Set(
        monsters.flatMap((monster) => [
          monster.mainHandItemId,
          monster.offHandItemId,
          monster.smallItemId,
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
      adaptCampaignCharacterToCombatActor(character, protectionTuning),
    );
    const adaptedMonsters = monsters.map((monster) =>
      adaptMonsterToCombatLabActor(monster, monsterEquipmentById),
    );
    const report = runScenarioSuite({
      name: `${campaign.name}: selected campaign combatants`,
      players: adaptedCharacters.map((entry) => entry.actor),
      monsters: adaptedMonsters.map((entry) => entry.actor),
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
          targetCount: action.targetCount,
          rangeCategory: action.rangeCategory,
          abstractionNotes: action.abstractionNotes ?? [],
          secondaryActionCount: action.secondaryActions?.length ?? 0,
          secondaryActions: (action.secondaryActions ?? []).map((secondaryAction) => ({
            id: secondaryAction.id,
            name: secondaryAction.name,
            kind: secondaryAction.kind,
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
        actionCount: entry.actor.actions.length,
        actions: entry.actor.actions.map((action) => ({
          id: action.id,
          name: action.name,
          sourceType: action.sourceType,
          supported: action.supported,
          kind: action.kind,
          targetCount: action.targetCount,
          rangeCategory: action.rangeCategory,
          abstractionNotes: action.abstractionNotes ?? [],
          secondaryActionCount: action.secondaryActions?.length ?? 0,
          secondaryActions: (action.secondaryActions ?? []).map((secondaryAction) => ({
            id: secondaryAction.id,
            name: secondaryAction.name,
            kind: secondaryAction.kind,
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
    console.error("[COMBAT_LAB_RUN]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
