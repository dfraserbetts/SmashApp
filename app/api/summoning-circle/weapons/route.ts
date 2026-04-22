import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { requireCampaignAccess, requireUserId } from "../_shared";
import type { AttributePlacement } from "@/lib/summoning/types";
import type { Prisma } from "@prisma/client";

type AttributeLine = { text: string; placement: AttributePlacement };
type TokenMap = Record<string, string | number>;
type MythicLimitBreakTemplatePreview = {
  id: string;
  name: string;
  tier: "PUSH" | "BREAK" | "TRANSCEND";
  thresholdPercent: number;
  description: string | null;
  successEffectParams: unknown;
  baseCostText: string | null;
  baseCostParams: unknown;
  endCostText: string | null;
  endCostParams: unknown;
  isPersistent: boolean;
  persistentCostTiming: string | null;
};

const WEAPON_INCLUDE = {
  rangeCategories: true,
  meleeDamageTypes: { include: { damageType: true } },
  rangedDamageTypes: { include: { damageType: true } },
  aoeDamageTypes: { include: { damageType: true } },
  attackEffectsMelee: { include: { attackEffect: true } },
  attackEffectsRanged: { include: { attackEffect: true } },
  attackEffectsAoE: { include: { attackEffect: true } },
  vrpEntries: { include: { damageType: true } },
  weaponAttributes: { include: { weaponAttribute: true } },
  armorAttributes: { include: { armorAttribute: true } },
  shieldAttributes: { include: { shieldAttribute: true } },
  mythicLbPushTemplate: {
    select: {
      id: true,
      name: true,
      tier: true,
      thresholdPercent: true,
      description: true,
      successEffectParams: true,
      baseCostText: true,
      baseCostParams: true,
      endCostText: true,
      endCostParams: true,
      isPersistent: true,
      persistentCostTiming: true,
    },
  },
  mythicLbBreakTemplate: {
    select: {
      id: true,
      name: true,
      tier: true,
      thresholdPercent: true,
      description: true,
      successEffectParams: true,
      baseCostText: true,
      baseCostParams: true,
      endCostText: true,
      endCostParams: true,
      isPersistent: true,
      persistentCostTiming: true,
    },
  },
  mythicLbTranscendTemplate: {
    select: {
      id: true,
      name: true,
      tier: true,
      thresholdPercent: true,
      description: true,
      successEffectParams: true,
      baseCostText: true,
      baseCostParams: true,
      endCostText: true,
      endCostParams: true,
      isPersistent: true,
      persistentCostTiming: true,
    },
  },
} satisfies Prisma.ItemTemplateInclude;

type WeaponRouteRow = Prisma.ItemTemplateGetPayload<{
  include: typeof WEAPON_INCLUDE;
}>;

function normalizePlacement(value: unknown): AttributePlacement {
  if (value === "DEFENCE") return "GUARD";
  if (value === "ATTACK" || value === "GUARD" || value === "TRAITS" || value === "GENERAL") {
    return value;
  }
  return "TRAITS";
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAttributeValueFromName(name: unknown): number {
  if (typeof name !== "string") return 0;
  const match = name.trim().match(/^(.*?)(?:\s+(\d+))$/);
  if (!match) return 0;
  return safeNumber(match[2], 0);
}

function resolveAttributeText(template: string, tokens: TokenMap): string {
  return template.replace(/\[([A-Za-z0-9_]+)\]/g, (full, rawToken: string) => {
    const token = String(rawToken);
    if (!(token in tokens)) return full;
    const value = tokens[token];
    if (value === null || value === undefined) return "0";
    return String(value);
  });
}

function splitMultilineText(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function dedupeAttributeLines(lines: AttributeLine[]): AttributeLine[] {
  const seen = new Set<string>();
  const output: AttributeLine[] = [];
  for (const raw of lines) {
    const text = String(raw.text ?? "").trim();
    if (!text) continue;
    const placement = normalizePlacement(raw.placement);
    const key = `${placement}::${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ text, placement });
  }
  return output;
}

function buildBaseTokens(row: WeaponRouteRow): TokenMap {
  const damageTypes = Array.from(
    new Set([
      ...row.meleeDamageTypes.map((x) => String(x.damageType?.name ?? "").trim()),
      ...row.rangedDamageTypes.map((x) => String(x.damageType?.name ?? "").trim()),
      ...row.aoeDamageTypes.map((x) => String(x.damageType?.name ?? "").trim()),
    ].filter((name) => name.length > 0)),
  )
    .sort((a, b) => a.localeCompare(b))
    .join(", ");

  const attackEffects = Array.from(
    new Set([
      ...row.attackEffectsMelee.map((x) => String(x.attackEffect?.name ?? "").trim()),
      ...row.attackEffectsRanged.map((x) => String(x.attackEffect?.name ?? "").trim()),
      ...row.attackEffectsAoE.map((x) => String(x.attackEffect?.name ?? "").trim()),
    ].filter((name) => name.length > 0)),
  )
    .sort((a, b) => a.localeCompare(b))
    .join(", ");

  const ppv = safeNumber(row.ppv);
  const mpv = safeNumber(row.mpv);
  const auraPhysical = safeNumber(row.auraPhysical);
  const auraMental = safeNumber(row.auraMental);

  return {
    ItemName: String(row.name ?? ""),
    WeaponName: String(row.name ?? ""),
    PPV: ppv,
    MPV: mpv,
    AuraPhysical: auraPhysical,
    AuraMental: auraMental,
    Aura_Physical: auraPhysical,
    Aura_Mental: auraMental,
    Aura: auraPhysical > 0 ? auraPhysical : auraMental,
    ChosenPV: ppv > 0 ? ppv : mpv,
    MeleePhysicalStrength: safeNumber(row.meleePhysicalStrength),
    MeleeMentalStrength: safeNumber(row.meleeMentalStrength),
    RangedPhysicalStrength: safeNumber(row.rangedPhysicalStrength),
    RangedMentalStrength: safeNumber(row.rangedMentalStrength),
    AoePhysicalStrength: safeNumber(row.aoePhysicalStrength),
    AoeMentalStrength: safeNumber(row.aoeMentalStrength),
    MeleeTargets: safeNumber(row.meleeTargets, 1),
    RangedTargets: safeNumber(row.rangedTargets, 1),
    RangedDistanceFeet: safeNumber(row.rangedDistanceFeet),
    AoeCount: safeNumber(row.aoeCount, 1),
    AoeCenterRangeFeet: safeNumber(row.aoeCenterRangeFeet),
    AoeShape: row.aoeShape ? String(row.aoeShape) : "0",
    AoeSphereRadiusFeet: safeNumber(row.aoeSphereRadiusFeet),
    AoeConeLengthFeet: safeNumber(row.aoeConeLengthFeet),
    AoeLineWidthFeet: safeNumber(row.aoeLineWidthFeet),
    AoeLineLengthFeet: safeNumber(row.aoeLineLengthFeet),
    GS_AttackEffects: attackEffects.length > 0 ? attackEffects : "0",
    DamageTypes: damageTypes.length > 0 ? damageTypes : "0",
  };
}

function buildWeaponAttributeTokens(
  base: TokenMap,
  entry: WeaponRouteRow["weaponAttributes"][number],
): TokenMap {
  const strengthSource =
    entry?.strengthSource === "MELEE" || entry?.strengthSource === "RANGED" || entry?.strengthSource === "AOE"
      ? entry.strengthSource
      : null;
  const rangeSource =
    entry?.rangeSource === "MELEE" || entry?.rangeSource === "RANGED" || entry?.rangeSource === "AOE"
      ? entry.rangeSource
      : null;

  const chosenPhysicalStrength =
    strengthSource === "MELEE"
      ? safeNumber(base.MeleePhysicalStrength)
      : strengthSource === "RANGED"
        ? safeNumber(base.RangedPhysicalStrength)
        : strengthSource === "AOE"
          ? safeNumber(base.AoePhysicalStrength)
          : 0;

  const chosenMentalStrength =
    strengthSource === "MELEE"
      ? safeNumber(base.MeleeMentalStrength)
      : strengthSource === "RANGED"
        ? safeNumber(base.RangedMentalStrength)
        : strengthSource === "AOE"
          ? safeNumber(base.AoeMentalStrength)
          : 0;

  return {
    ...base,
    AttributeValue: parseAttributeValueFromName(entry?.weaponAttribute?.name ?? ""),
    ChosenPhysicalStrength: chosenPhysicalStrength,
    ChosenMentalStrength: chosenMentalStrength,
    ChosenRange:
      rangeSource === "MELEE"
        ? "Melee"
        : rangeSource === "RANGED"
          ? "Ranged"
          : rangeSource === "AOE"
            ? "AoE"
            : 0,
  };
}

function buildNamedAttributeTokens(base: TokenMap, name: unknown): TokenMap {
  return {
    ...base,
    AttributeValue: parseAttributeValueFromName(name),
  };
}

function toResolvedLine(
  descriptorTemplate: unknown,
  placement: unknown,
  tokens: TokenMap,
): AttributeLine | null {
  if (typeof descriptorTemplate !== "string") return null;
  const rawText = descriptorTemplate.trim();
  if (!rawText) return null;
  return {
    text: resolveAttributeText(rawText, tokens).trim(),
    placement: normalizePlacement(placement),
  };
}

function toResolvedTraitLines(value: unknown, tokens: TokenMap): AttributeLine[] {
  return splitMultilineText(value).map((text) => ({
    text: resolveAttributeText(text, tokens).trim(),
    placement: "TRAITS" as const,
  }));
}

function buildVrpAttributeLines(row: WeaponRouteRow): AttributeLine[] {
  const entries = row.vrpEntries;
  const out: AttributeLine[] = [];

  const normalizeType = (t: string): "RESISTANCE" | "VULNERABILITY" | "PROTECTION" | null => {
    if (!t) return null;

    // Common variants
    if (t === "R" || t === "RESIST" || t === "RESISTANCE") return "RESISTANCE";
    if (t === "V" || t === "VULN" || t === "VULNERABLE" || t === "VULNERABILITY") return "VULNERABILITY";
    if (t === "P" || t === "PROT" || t === "PROTECTION") return "PROTECTION";

    return null;
  };

  for (const entry of entries) {
    const amount = Number.isFinite(entry.magnitude) ? entry.magnitude : 0;
    const damageTypeName = String(entry.damageType?.name ?? "").trim();
    const normalized = normalizeType(String(entry.effectKind ?? "").trim().toUpperCase());

    if (!damageTypeName || !normalized || amount === 0) continue;

    if (normalized === "RESISTANCE") {
      out.push({
        text: `+${amount} to Defence rolls against ${damageTypeName} attacks`,
        placement: "GUARD",
      });
    } else if (normalized === "VULNERABILITY") {
      out.push({
        text: `-${amount} to Defence rolls against ${damageTypeName} attacks`,
        placement: "GUARD",
      });
    } else if (normalized === "PROTECTION") {
      out.push({
        text: `+${amount} dice to Defence rolls against ${damageTypeName} attacks`,
        placement: "GUARD",
      });
    }
  }

  return out;
}

function pickSelectedMythicLimitBreakTemplate(
  row: WeaponRouteRow,
): MythicLimitBreakTemplatePreview | null {
  const selected =
    row.mythicLbTranscendTemplate ??
    row.mythicLbBreakTemplate ??
    row.mythicLbPushTemplate ??
    null;
  if (!selected) return null;
  return {
    id: String(selected.id ?? ""),
    name: String(selected.name ?? ""),
    tier: selected.tier as MythicLimitBreakTemplatePreview["tier"],
    thresholdPercent: Number(selected.thresholdPercent ?? 0),
    description: typeof selected.description === "string" ? selected.description : null,
    successEffectParams: selected.successEffectParams ?? {},
    baseCostText: typeof selected.baseCostText === "string" ? selected.baseCostText : null,
    baseCostParams: selected.baseCostParams ?? {},
    endCostText: typeof selected.endCostText === "string" ? selected.endCostText : null,
    endCostParams: selected.endCostParams ?? {},
    isPersistent: Boolean(selected.isPersistent),
    persistentCostTiming:
      selected.persistentCostTiming === "BEGIN" || selected.persistentCostTiming === "END"
        ? selected.persistentCostTiming
        : null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignAccess(campaignId, userId);

    const rows = await prisma.itemTemplate.findMany({
      where: {
        campaignId,
        type: { in: ["WEAPON", "SHIELD", "ARMOR", "ITEM"] },
      },
      orderBy: { name: "asc" },
      include: WEAPON_INCLUDE,
    });

    const weapons = rows.map((row) => {
      const baseTokens = buildBaseTokens(row);

      const descriptorAttributeLines = dedupeAttributeLines([
        ...row.weaponAttributes
          .map((entry) =>
            toResolvedLine(
              entry.weaponAttribute?.descriptorTemplate,
              (entry.weaponAttribute as { placement?: unknown } | null)?.placement,
              buildWeaponAttributeTokens(baseTokens, entry),
            ),
          )
          .filter((line): line is AttributeLine => line !== null),
        ...row.armorAttributes
          .map((entry) =>
            toResolvedLine(
              entry.armorAttribute?.descriptorTemplate,
              (entry.armorAttribute as { placement?: unknown } | null)?.placement,
              buildNamedAttributeTokens(baseTokens, entry.armorAttribute?.name),
            ),
          )
          .filter((line): line is AttributeLine => line !== null),
        ...row.shieldAttributes
          .map((entry) =>
            toResolvedLine(
              entry.shieldAttribute?.descriptorTemplate,
              (entry.shieldAttribute as { placement?: unknown } | null)?.placement,
              buildNamedAttributeTokens(baseTokens, entry.shieldAttribute?.name),
            ),
          )
          .filter((line): line is AttributeLine => line !== null),
        ...buildVrpAttributeLines(row),
      ]).sort((a, b) => a.text.localeCompare(b.text));

      const itemAttributeLines = dedupeAttributeLines([
        ...toResolvedTraitLines(row.customWeaponAttributes, baseTokens),
        ...toResolvedTraitLines(row.customArmorAttributes, baseTokens),
        ...toResolvedTraitLines(row.customShieldAttributes, baseTokens),
      ]);
      const customItemAttributeLines = dedupeAttributeLines(
        toResolvedTraitLines(row.customItemAttributes, baseTokens),
      );
      const allAttributeLines = dedupeAttributeLines([
        ...descriptorAttributeLines,
        ...itemAttributeLines,
        ...customItemAttributeLines,
      ]);
      const mythicLimitBreakTemplate = pickSelectedMythicLimitBreakTemplate(row);

      return {
        attributeLines: descriptorAttributeLines,
        itemAttributeLines,
        customItemAttributeLines,
        allAttributeLines,
        mythicLimitBreakTemplate,
        id: row.id,
        name: row.name,
        imageUrl: row.itemUrl ?? null,
        type: row.type,
        size: row.size,
        armorLocation: row.armorLocation,
        itemLocation: row.itemLocation,
        ppv: row.ppv,
        mpv: row.mpv,
        globalAttributeModifiers: Array.isArray(row.globalAttributeModifiers)
          ? (row.globalAttributeModifiers as Array<{ attribute?: string; amount?: number }>)
          : [],
        melee: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "MELEE"),
          targets: row.meleeTargets ?? 1,
          physicalStrength: row.meleePhysicalStrength ?? 0,
          mentalStrength: row.meleeMentalStrength ?? 0,
          damageTypes: row.meleeDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode,
          })),
          attackEffects: row.attackEffectsMelee.map((x) => x.attackEffect.name),
        },
        ranged: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "RANGED"),
          targets: row.rangedTargets ?? 1,
          distance: row.rangedDistanceFeet ?? 0,
          physicalStrength: row.rangedPhysicalStrength ?? 0,
          mentalStrength: row.rangedMentalStrength ?? 0,
          damageTypes: row.rangedDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode,
          })),
          attackEffects: row.attackEffectsRanged.map((x) => x.attackEffect.name),
        },
        aoe: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "AOE"),
          count: row.aoeCount ?? 1,
          centerRange: row.aoeCenterRangeFeet ?? 0,
          shape: row.aoeShape ?? "SPHERE",
          sphereRadiusFeet: row.aoeSphereRadiusFeet ?? undefined,
          coneLengthFeet: row.aoeConeLengthFeet ?? undefined,
          lineWidthFeet: row.aoeLineWidthFeet ?? undefined,
          lineLengthFeet: row.aoeLineLengthFeet ?? undefined,
          physicalStrength: row.aoePhysicalStrength ?? 0,
          mentalStrength: row.aoeMentalStrength ?? 0,
          damageTypes: row.aoeDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode,
          })),
          attackEffects: row.attackEffectsAoE.map((x) => x.attackEffect.name),
        },
      };
    });

    return NextResponse.json({ weapons });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load weapons";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_WEAPONS_GET]", error);
    return NextResponse.json({ error: "Failed to load weapons" }, { status: 500 });
  }
}
