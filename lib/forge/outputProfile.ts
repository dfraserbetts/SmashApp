import type {
  AoEShape,
  ItemRarity,
  ItemType,
  RangeCategory,
  WeaponSize,
} from "./types";

export type ForgeOutputProfileKind = "melee" | "ranged" | "aoe";
export type ForgeDamageMode = "PHYSICAL" | "MENTAL";

export type ForgeDamageTypeInput =
  | string
  | {
      name?: string | null;
      attackMode?: string | null;
      mode?: string | null;
    }
  | {
      damageType?: {
        name?: string | null;
        attackMode?: string | null;
        mode?: string | null;
      } | null;
    };

export type ForgeNamedInput =
  | string
  | {
      name?: string | null;
      pricingMode?: string | null;
      pricingScalar?: number | string | null;
      pricingMagnitude?: number | null;
    }
  | { attackEffect?: { name?: string | null } | null }
  | { defEffect?: { name?: string | null } | null }
  | {
      armorAttribute?: {
        name?: string | null;
        pricingMode?: string | null;
        pricingScalar?: number | string | null;
        pricingMagnitude?: number | null;
      } | null;
    }
  | {
      shieldAttribute?: {
        name?: string | null;
        pricingMode?: string | null;
        pricingScalar?: number | string | null;
        pricingMagnitude?: number | null;
      } | null;
    }
  | {
      weaponAttribute?: {
        name?: string | null;
        pricingMode?: string | null;
        pricingScalar?: number | string | null;
        pricingMagnitude?: number | null;
      } | null;
    };

export type ForgeVrpInput = {
  effectKind?: string | null;
  magnitude?: number | null;
  damageType?: { name?: string | null } | string | null;
};

export type ForgeGlobalAttributeModifierInput = {
  attribute?: string | null;
  amount?: number | null;
};

export type ForgeOutputProfileInput = {
  level?: number | null;
  rarity?: ItemRarity | string | null;
  type?: ItemType | string | null;
  size?: WeaponSize | string | null;
  shieldHasAttack?: boolean | null;

  rangeCategories?: Array<RangeCategory | string | { rangeCategory?: string | null }> | null;

  physicalStrength?: number | null;
  mentalStrength?: number | null;
  meleePhysicalStrength?: number | null;
  meleeMentalStrength?: number | null;
  rangedPhysicalStrength?: number | null;
  rangedMentalStrength?: number | null;
  aoePhysicalStrength?: number | null;
  aoeMentalStrength?: number | null;

  meleeTargets?: number | null;
  rangedTargets?: number | null;
  rangedDistanceFeet?: number | null;

  aoeCenterRangeFeet?: number | null;
  aoeCount?: number | null;
  aoeShape?: AoEShape | string | null;
  aoeSphereRadiusFeet?: number | null;
  aoeConeLengthFeet?: number | null;
  aoeLineWidthFeet?: number | null;
  aoeLineLengthFeet?: number | null;

  meleeDamageTypes?: ForgeDamageTypeInput[] | null;
  rangedDamageTypes?: ForgeDamageTypeInput[] | null;
  aoeDamageTypes?: ForgeDamageTypeInput[] | null;
  meleeDamageTypeNames?: string[] | null;
  rangedDamageTypeNames?: string[] | null;
  aoeDamageTypeNames?: string[] | null;

  attackEffectsMelee?: ForgeNamedInput[] | null;
  attackEffectsRanged?: ForgeNamedInput[] | null;
  attackEffectsAoE?: ForgeNamedInput[] | null;
  attackEffectMeleeNames?: string[] | null;
  attackEffectRangedNames?: string[] | null;
  attackEffectAoENames?: string[] | null;

  ppv?: number | null;
  mpv?: number | null;
  auraPhysical?: number | null;
  auraMental?: number | null;

  defEffects?: ForgeNamedInput[] | null;
  defEffectNames?: string[] | null;
  armorAttributes?: ForgeNamedInput[] | null;
  armorAttributeNames?: string[] | null;
  shieldAttributes?: ForgeNamedInput[] | null;
  shieldAttributeNames?: string[] | null;
  weaponAttributes?: ForgeNamedInput[] | null;
  weaponAttributeNames?: string[] | null;
  vrpEntries?: ForgeVrpInput[] | null;

  customWeaponAttributes?: string | null;
  customArmorAttributes?: string | null;
  customShieldAttributes?: string | null;
  customItemAttributes?: string | null;
  globalAttributeModifiers?: ForgeGlobalAttributeModifierInput[] | null;
  tags?: string[] | null;
};

export type ForgeDamageTypeOutput = {
  name: string;
  mode: ForgeDamageMode;
};

export type ForgeAttributePricingOutput = {
  name: string;
  pricingMode: string | null;
  pricingScalar: number | null;
  pricingMagnitude: number | null;
  pricingWeight: number | null;
};

export type ForgeAttackProfileOutput = {
  profileKind: ForgeOutputProfileKind;
  enabled: boolean;
  present: boolean;
  physicalStrength: number;
  mentalStrength: number;
  physicalWoundsPerSuccess: number;
  mentalWoundsPerSuccess: number;
  physicalDamageTypeCount: number;
  mentalDamageTypeCount: number;
  damageTypeCount: number;
  damageTypeNames: string[];
  damageTypes: ForgeDamageTypeOutput[];
  totalPhysicalWoundsPerSuccess: number;
  totalMentalWoundsPerSuccess: number;
  totalWoundsPerSuccess: number;
  targetCount: number;
  rangeCategory: RangeCategory;
  rangedDistanceFeet: number | null;
  aoe: {
    centerRangeFeet: number;
    count: number;
    shape: AoEShape | null;
    sphereRadiusFeet: number | null;
    coneLengthFeet: number | null;
    lineWidthFeet: number | null;
    lineLengthFeet: number | null;
  } | null;
  greaterSuccessEffectCount: number;
  greaterSuccessEffectLabels: string[];
};

export type ForgeDefensiveProfileOutput = {
  ppv: number;
  mpv: number;
  auraPhysical: number | null;
  auraMental: number | null;
  defensiveEffectCount: number;
  defensiveEffectLabels: string[];
  armourAttributeCount: number;
  armourAttributeLabels: string[];
  armourAttributeDetails: ForgeAttributePricingOutput[];
  shieldAttributeCount: number;
  shieldAttributeLabels: string[];
  shieldAttributeDetails: ForgeAttributePricingOutput[];
  vrpCount: number;
  vrpSummary: string[];
};

export type ForgeShieldCoPresenceOutput = {
  hasShieldAttack: boolean;
  hasDefenceOutput: boolean;
  hasAttackAndDefence: boolean;
};

export type ForgeFeatureProfileOutput = {
  weaponAttributeCount: number;
  weaponAttributeLabels: string[];
  weaponAttributeDetails: ForgeAttributePricingOutput[];
  customTextLabels: string[];
  globalAttributeModifierCount: number;
  globalAttributeModifierSummary: string[];
  tagCount: number;
  tags: string[];
};

export type ForgeOutputProfile = {
  common: {
    level: number | null;
    rarity: string | null;
    type: string | null;
    size: string | null;
    normalizedSize: WeaponSize | null;
    shieldHasAttack: boolean | null;
  };
  attackProfiles: ForgeAttackProfileOutput[];
  defensiveProfile: ForgeDefensiveProfileOutput;
  shieldCoPresence: ForgeShieldCoPresenceOutput;
  featureProfile: ForgeFeatureProfileOutput;
  debug: {
    source: "forge_output_profile_v1";
    strengthRule: "Strength x 2 table-facing wounds per success";
    noBandComparisonYet: true;
  };
};

const PROFILE_RANGE_CATEGORY: Record<ForgeOutputProfileKind, RangeCategory> = {
  melee: "MELEE",
  ranged: "RANGED",
  aoe: "AOE",
};

function toNumber(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function toPositiveNumber(value: number | null | undefined, fallback: number): number {
  const numeric = toNumber(value, fallback);
  return numeric > 0 ? numeric : fallback;
}

function toNullablePositiveNumber(value: number | null | undefined): number | null {
  const numeric = toNumber(value, 0);
  return numeric > 0 ? numeric : null;
}

function normalizeRangeCategory(value: unknown): string {
  if (typeof value === "string") return value.trim().toUpperCase();
  if (value && typeof value === "object" && "rangeCategory" in value) {
    const raw = (value as { rangeCategory?: string | null }).rangeCategory;
    return String(raw ?? "").trim().toUpperCase();
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getRangeCategories(input: ForgeOutputProfileInput): Set<string> {
  return new Set((input.rangeCategories ?? []).map(normalizeRangeCategory).filter(Boolean));
}

function getDamageTypeName(input: ForgeDamageTypeInput): string {
  if (typeof input === "string") return input.trim();
  const row = input as Record<string, unknown>;
  const nested = isRecord(row.damageType) ? row.damageType : null;
  return String(nested?.name ?? row.name ?? "").trim();
}

function getDamageTypeMode(input: ForgeDamageTypeInput): ForgeDamageMode {
  if (typeof input === "string") return "PHYSICAL";
  const row = input as Record<string, unknown>;
  const nested = isRecord(row.damageType) ? row.damageType : null;
  const source = nested ?? row;
  const raw = String(source.attackMode ?? source.mode ?? "").trim().toUpperCase();
  return raw === "MENTAL" ? "MENTAL" : "PHYSICAL";
}

function normalizeDamageTypes(
  rows: ForgeDamageTypeInput[] | null | undefined,
  fallbackNames: string[] | null | undefined,
): ForgeDamageTypeOutput[] {
  const byName = new Map<string, ForgeDamageTypeOutput>();

  for (const row of rows ?? []) {
    const name = getDamageTypeName(row);
    if (!name) continue;
    byName.set(name.toLowerCase(), { name, mode: getDamageTypeMode(row) });
  }

  for (const name of fallbackNames ?? []) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) continue;
    byName.set(trimmed.toLowerCase(), { name: trimmed, mode: "PHYSICAL" });
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function extractName(input: ForgeNamedInput): string {
  if (typeof input === "string") return input.trim();
  const row = input as Record<string, unknown>;
  const nested =
    (isRecord(row.attackEffect) && row.attackEffect) ||
    (isRecord(row.defEffect) && row.defEffect) ||
    (isRecord(row.armorAttribute) && row.armorAttribute) ||
    (isRecord(row.shieldAttribute) && row.shieldAttribute) ||
    (isRecord(row.weaponAttribute) && row.weaponAttribute) ||
    null;
  return String(nested?.name ?? row.name ?? "").trim();
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractAttributePricing(input: ForgeNamedInput): ForgeAttributePricingOutput | null {
  const name = extractName(input);
  if (!name) return null;
  if (typeof input === "string") {
    return {
      name,
      pricingMode: null,
      pricingScalar: null,
      pricingMagnitude: null,
      pricingWeight: null,
    };
  }

  const row = input as Record<string, unknown>;
  const nested =
    (isRecord(row.armorAttribute) && row.armorAttribute) ||
    (isRecord(row.shieldAttribute) && row.shieldAttribute) ||
    (isRecord(row.weaponAttribute) && row.weaponAttribute) ||
    null;
  const source = nested ?? row;
  const pricingMode = String(source.pricingMode ?? "").trim().toUpperCase() || null;
  const pricingScalar = toNullableNumber(source.pricingScalar);
  const pricingMagnitude = toNullableNumber(source.pricingMagnitude);
  const pricingWeight =
    pricingScalar !== null && pricingMagnitude !== null
      ? pricingScalar * pricingMagnitude
      : null;

  return {
    name,
    pricingMode,
    pricingScalar,
    pricingMagnitude,
    pricingWeight,
  };
}

function normalizeLabels(
  rows: ForgeNamedInput[] | null | undefined,
  fallbackNames: string[] | null | undefined,
): string[] {
  const byName = new Map<string, string>();

  for (const row of rows ?? []) {
    const name = extractName(row);
    if (name) byName.set(name.toLowerCase(), name);
  }

  for (const name of fallbackNames ?? []) {
    const trimmed = String(name ?? "").trim();
    if (trimmed) byName.set(trimmed.toLowerCase(), trimmed);
  }

  return Array.from(byName.values()).sort((a, b) => a.localeCompare(b));
}

function normalizeAttributeDetails(
  rows: ForgeNamedInput[] | null | undefined,
  fallbackNames: string[] | null | undefined,
): ForgeAttributePricingOutput[] {
  const byName = new Map<string, ForgeAttributePricingOutput>();

  for (const row of rows ?? []) {
    const details = extractAttributePricing(row);
    if (details) byName.set(details.name.toLowerCase(), details);
  }

  for (const name of fallbackNames ?? []) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed || byName.has(trimmed.toLowerCase())) continue;
    byName.set(trimmed.toLowerCase(), {
      name: trimmed,
      pricingMode: null,
      pricingScalar: null,
      pricingMagnitude: null,
      pricingWeight: null,
    });
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function summarizeVrpEntries(entries: ForgeVrpInput[] | null | undefined): string[] {
  return (entries ?? [])
    .map((entry) => {
      const effectKind = String(entry.effectKind ?? "").trim();
      const magnitude = toNumber(entry.magnitude, 0);
      const damageType =
        typeof entry.damageType === "string"
          ? entry.damageType.trim()
          : String(entry.damageType?.name ?? "").trim();

      if (!effectKind || !damageType || magnitude <= 0) return null;
      return `${effectKind} ${magnitude} ${damageType}`;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeCustomTextLabels(input: ForgeOutputProfileInput): string[] {
  const labels: string[] = [];
  if (String(input.customWeaponAttributes ?? "").trim()) labels.push("custom weapon attributes");
  if (String(input.customArmorAttributes ?? "").trim()) labels.push("custom armour attributes");
  if (String(input.customShieldAttributes ?? "").trim()) labels.push("custom shield attributes");
  if (String(input.customItemAttributes ?? "").trim()) labels.push("custom item attributes");
  return labels;
}

function summarizeGlobalAttributeModifiers(
  entries: ForgeGlobalAttributeModifierInput[] | null | undefined,
): string[] {
  return (entries ?? [])
    .map((entry) => {
      const attribute = String(entry.attribute ?? "").trim();
      const amount = toNumber(entry.amount, 0);
      if (!attribute || amount === 0) return null;
      const prefix = amount > 0 ? "+" : "";
      return `${attribute} ${prefix}${amount}`;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeTags(tags: string[] | null | undefined): string[] {
  const byName = new Map<string, string>();
  for (const tag of tags ?? []) {
    const trimmed = String(tag ?? "").trim();
    if (trimmed) byName.set(trimmed.toLowerCase(), trimmed);
  }
  return Array.from(byName.values()).sort((a, b) => a.localeCompare(b));
}

function normalizeWeaponSize(size: string | null | undefined): WeaponSize | null {
  const normalized = String(size ?? "").trim().toUpperCase();
  if (normalized === "SMALL" || normalized === "ONE_HANDED" || normalized === "TWO_HANDED") {
    return normalized;
  }
  return null;
}

function strengthToTableWoundsPerSuccess(strength: number): number {
  return Math.max(0, strength) * 2;
}

function buildAttackProfile(
  input: ForgeOutputProfileInput,
  profileKind: ForgeOutputProfileKind,
  enabledFromRange: boolean,
): ForgeAttackProfileOutput {
  const isMelee = profileKind === "melee";
  const isRanged = profileKind === "ranged";
  const isAoe = profileKind === "aoe";

  const physicalStrength = toNumber(
    isMelee
      ? input.meleePhysicalStrength ?? input.physicalStrength
      : isRanged
        ? input.rangedPhysicalStrength ?? input.physicalStrength
        : input.aoePhysicalStrength ?? input.physicalStrength,
    0,
  );
  const mentalStrength = toNumber(
    isMelee
      ? input.meleeMentalStrength ?? input.mentalStrength
      : isRanged
        ? input.rangedMentalStrength ?? input.mentalStrength
        : input.aoeMentalStrength ?? input.mentalStrength,
    0,
  );

  const damageTypes = normalizeDamageTypes(
    isMelee
      ? input.meleeDamageTypes
      : isRanged
        ? input.rangedDamageTypes
        : input.aoeDamageTypes,
    isMelee
      ? input.meleeDamageTypeNames
      : isRanged
        ? input.rangedDamageTypeNames
        : input.aoeDamageTypeNames,
  );
  const physicalDamageTypeCount = damageTypes.filter((entry) => entry.mode === "PHYSICAL").length;
  const mentalDamageTypeCount = damageTypes.filter((entry) => entry.mode === "MENTAL").length;

  const greaterSuccessEffectLabels = normalizeLabels(
    isMelee
      ? input.attackEffectsMelee
      : isRanged
        ? input.attackEffectsRanged
        : input.attackEffectsAoE,
    isMelee
      ? input.attackEffectMeleeNames
      : isRanged
        ? input.attackEffectRangedNames
        : input.attackEffectAoENames,
  );

  const physicalWoundsPerSuccess = strengthToTableWoundsPerSuccess(physicalStrength);
  const mentalWoundsPerSuccess = strengthToTableWoundsPerSuccess(mentalStrength);
  const totalPhysicalWoundsPerSuccess = physicalWoundsPerSuccess * physicalDamageTypeCount;
  const totalMentalWoundsPerSuccess = mentalWoundsPerSuccess * mentalDamageTypeCount;
  const totalWoundsPerSuccess = totalPhysicalWoundsPerSuccess + totalMentalWoundsPerSuccess;

  const targetCount = isAoe
    ? toPositiveNumber(input.aoeCount, 1)
    : isRanged
      ? toPositiveNumber(input.rangedTargets, 1)
      : toPositiveNumber(input.meleeTargets, 1);

  const hasProfileData =
    physicalStrength > 0 ||
    mentalStrength > 0 ||
    damageTypes.length > 0 ||
    greaterSuccessEffectLabels.length > 0 ||
    (isRanged && toNumber(input.rangedDistanceFeet, 0) > 0) ||
    (isAoe && Boolean(input.aoeShape));

  return {
    profileKind,
    enabled: enabledFromRange || hasProfileData,
    present: enabledFromRange || hasProfileData,
    physicalStrength,
    mentalStrength,
    physicalWoundsPerSuccess,
    mentalWoundsPerSuccess,
    physicalDamageTypeCount,
    mentalDamageTypeCount,
    damageTypeCount: physicalDamageTypeCount + mentalDamageTypeCount,
    damageTypeNames: damageTypes.map((entry) => entry.name),
    damageTypes,
    totalPhysicalWoundsPerSuccess,
    totalMentalWoundsPerSuccess,
    totalWoundsPerSuccess,
    targetCount,
    rangeCategory: PROFILE_RANGE_CATEGORY[profileKind],
    rangedDistanceFeet: isRanged ? toNullablePositiveNumber(input.rangedDistanceFeet) : null,
    aoe: isAoe
      ? {
          centerRangeFeet: toNumber(input.aoeCenterRangeFeet, 0),
          count: toPositiveNumber(input.aoeCount, 1),
          shape: input.aoeShape ? (String(input.aoeShape).toUpperCase() as AoEShape) : null,
          sphereRadiusFeet: toNullablePositiveNumber(input.aoeSphereRadiusFeet),
          coneLengthFeet: toNullablePositiveNumber(input.aoeConeLengthFeet),
          lineWidthFeet: toNullablePositiveNumber(input.aoeLineWidthFeet),
          lineLengthFeet: toNullablePositiveNumber(input.aoeLineLengthFeet),
        }
      : null,
    greaterSuccessEffectCount: greaterSuccessEffectLabels.length,
    greaterSuccessEffectLabels,
  };
}

export function buildForgeOutputProfile(input: ForgeOutputProfileInput): ForgeOutputProfile {
  const rangeCategories = getRangeCategories(input);
  const attackProfiles = (["melee", "ranged", "aoe"] as const).map((profileKind) =>
    buildAttackProfile(input, profileKind, rangeCategories.has(PROFILE_RANGE_CATEGORY[profileKind])),
  );

  const defensiveEffectLabels = normalizeLabels(input.defEffects, input.defEffectNames);
  const armourAttributeDetails = normalizeAttributeDetails(input.armorAttributes, input.armorAttributeNames);
  const armourAttributeLabels = armourAttributeDetails.map((entry) => entry.name);
  const shieldAttributeDetails = normalizeAttributeDetails(input.shieldAttributes, input.shieldAttributeNames);
  const shieldAttributeLabels = shieldAttributeDetails.map((entry) => entry.name);
  const weaponAttributeDetails = normalizeAttributeDetails(input.weaponAttributes, input.weaponAttributeNames);
  const weaponAttributeLabels = weaponAttributeDetails.map((entry) => entry.name);
  const vrpSummary = summarizeVrpEntries(input.vrpEntries);
  const customTextLabels = normalizeCustomTextLabels(input);
  const globalAttributeModifierSummary = summarizeGlobalAttributeModifiers(input.globalAttributeModifiers);
  const tags = normalizeTags(input.tags);
  const ppv = toNumber(input.ppv, 0);
  const mpv = toNumber(input.mpv, 0);

  const hasAttackOutput = attackProfiles.some(
    (profile) => profile.enabled && profile.totalWoundsPerSuccess > 0,
  );
  const hasDefenceOutput =
    ppv > 0 ||
    mpv > 0 ||
    toNumber(input.auraPhysical, 0) > 0 ||
    toNumber(input.auraMental, 0) > 0 ||
    defensiveEffectLabels.length > 0 ||
    armourAttributeLabels.length > 0 ||
    shieldAttributeLabels.length > 0 ||
    vrpSummary.length > 0;
  const hasShieldAttack = Boolean(input.shieldHasAttack) || (String(input.type ?? "").toUpperCase() === "SHIELD" && hasAttackOutput);

  return {
    common: {
      level: typeof input.level === "number" && Number.isFinite(input.level) ? input.level : null,
      rarity: input.rarity ? String(input.rarity) : null,
      type: input.type ? String(input.type) : null,
      size: input.size ? String(input.size) : null,
      normalizedSize: normalizeWeaponSize(input.size),
      shieldHasAttack: typeof input.shieldHasAttack === "boolean" ? input.shieldHasAttack : null,
    },
    attackProfiles,
    defensiveProfile: {
      ppv,
      mpv,
      auraPhysical: toNullablePositiveNumber(input.auraPhysical),
      auraMental: toNullablePositiveNumber(input.auraMental),
      defensiveEffectCount: defensiveEffectLabels.length,
      defensiveEffectLabels,
      armourAttributeCount: armourAttributeLabels.length,
      armourAttributeLabels,
      armourAttributeDetails,
      shieldAttributeCount: shieldAttributeLabels.length,
      shieldAttributeLabels,
      shieldAttributeDetails,
      vrpCount: vrpSummary.length,
      vrpSummary,
    },
    shieldCoPresence: {
      hasShieldAttack,
      hasDefenceOutput,
      hasAttackAndDefence: hasShieldAttack && hasDefenceOutput,
    },
    featureProfile: {
      weaponAttributeCount: weaponAttributeLabels.length,
      weaponAttributeLabels,
      weaponAttributeDetails,
      customTextLabels,
      globalAttributeModifierCount: globalAttributeModifierSummary.length,
      globalAttributeModifierSummary,
      tagCount: tags.length,
      tags,
    },
    debug: {
      source: "forge_output_profile_v1",
      strengthRule: "Strength x 2 table-facing wounds per success",
      noBandComparisonYet: true,
    },
  };
}
