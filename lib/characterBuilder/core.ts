export const CHARACTER_ATTRIBUTES = [
  "Attack",
  "Guard",
  "Fortitude",
  "Intellect",
  "Synergy",
  "Bravery",
] as const;

export type CharacterAttribute = (typeof CHARACTER_ATTRIBUTES)[number];

export type AttributeMethod = "HEROIC" | "DESTINY" | "ROLLED";

export type CharacterAttributeValue = number | "";

export type GreatSecretState = {
  templateKey: string;
  fields: string[];
};

export type CharacteristicEffectFamily =
  | "additionalDice"
  | "resultModifier"
  | "rerollOnes";

export type CharacteristicState = {
  id: string;
  name: string;
  keyword: string;
  additionalDice?: number;
  resultModifier?: number;
  rerollOnes?: number;
  attributeSwaps: CharacterAttribute[];
};

export type CharacterBuilderData = {
  narrativeNotes: string;
  greatSecret: GreatSecretState;
  characteristics: CharacteristicState[];
  attributeMethod: AttributeMethod;
  attributes: Record<CharacterAttribute, CharacterAttributeValue>;
  resistPoints: Record<CharacterAttribute, number>;
  selectedTraitKeys: string[];
};

export type TraitClassification = "POSITIVE" | "NEGATIVE";

export type PlayerTraitDefinition = {
  key: string;
  name: string;
  descriptor: string;
  classification: TraitClassification;
  pointValue: number;
};

export const LEGAL_ATTRIBUTE_VALUES = [4, 6, 8, 10, 12] as const;

export const HEROIC_ATTRIBUTE_ARRAY = [12, 10, 8, 8, 6, 4] as const;

export const MAX_CHARACTERISTIC_UNITS = 5;

export const DEFAULT_ATTRIBUTES: Record<CharacterAttribute, CharacterAttributeValue> = {
  Attack: "",
  Guard: "",
  Fortitude: "",
  Intellect: "",
  Synergy: "",
  Bravery: "",
};

export const DEFAULT_RESIST_POINTS: Record<CharacterAttribute, number> = {
  Attack: 0,
  Guard: 0,
  Fortitude: 0,
  Intellect: 0,
  Synergy: 0,
  Bravery: 0,
};

export const GREAT_SECRET_TEMPLATES = [
  {
    key: "historic_bloodline",
    name: "Historic Bloodline",
    fieldLabels: ["My family were once...", "Those who recognise my family name may..."],
    render(fields: string[]) {
      const familyPast = fields[0]?.trim() || "[free text]";
      const recognition = fields[1]?.trim() || "[free text]";
      return `Importance runs through my bloodline. My family were once ${familyPast}. Due to this, those who recognise my family name may ${recognition}.`;
    },
  },
] as const;

export const PLAYER_TRAIT_CATALOG: PlayerTraitDefinition[] = [
  {
    key: "keen_eye",
    name: "Keen Eye",
    descriptor: "You notice small details others miss and are quick to spot hidden opportunities.",
    classification: "POSITIVE",
    pointValue: 1,
  },
  {
    key: "steady_nerves",
    name: "Steady Nerves",
    descriptor: "Pressure rarely shakes you; your calm presence is obvious in tense moments.",
    classification: "POSITIVE",
    pointValue: 1,
  },
  {
    key: "oathbound",
    name: "Oathbound",
    descriptor: "A serious promise limits your choices and can complicate travel, alliances, or rewards.",
    classification: "NEGATIVE",
    pointValue: 1,
  },
  {
    key: "known_rival",
    name: "Known Rival",
    descriptor: "Someone capable has a personal reason to oppose you and may appear at difficult times.",
    classification: "NEGATIVE",
    pointValue: 1,
  },
];

export function characterPoints(level: number) {
  return Math.max(1, Math.floor(level)) * 5;
}

export function resistPointBudget(level: number) {
  return 3 + Math.floor(Math.max(1, Math.floor(level)) / 3);
}

export function traitPointBudget(level: number) {
  return 2 + Math.floor(Math.max(1, Math.floor(level)) / 4);
}

export function triangularCost(units: number) {
  const n = Math.max(0, Math.floor(units));
  return (n * (n + 1)) / 2;
}

export function cumulativeFamilyCost(value: number) {
  return triangularCost(value);
}

export function defaultBuilderData(): CharacterBuilderData {
  return {
    narrativeNotes: "",
    greatSecret: {
      templateKey: "historic_bloodline",
      fields: ["", ""],
    },
    characteristics: [],
    attributeMethod: "HEROIC",
    attributes: { ...DEFAULT_ATTRIBUTES },
    resistPoints: { ...DEFAULT_RESIST_POINTS },
    selectedTraitKeys: [],
  };
}

export function renderGreatSecret(secret: GreatSecretState) {
  const template =
    GREAT_SECRET_TEMPLATES.find((candidate) => candidate.key === secret.templateKey) ??
    GREAT_SECRET_TEMPLATES[0];
  return template.render(secret.fields);
}

function effectUnits(value: number | undefined) {
  return Number.isInteger(value) && value !== undefined && value >= 1 ? value : 0;
}

export function getCharacteristicUnits(characteristic: CharacteristicState) {
  return (
    effectUnits(characteristic.additionalDice) +
    effectUnits(characteristic.resultModifier) +
    effectUnits(characteristic.rerollOnes) +
    characteristic.attributeSwaps.length
  );
}

export function getCharacteristicCost(characteristic: CharacteristicState) {
  return triangularCost(getCharacteristicUnits(characteristic));
}

export function characteristicCost(characteristic: CharacteristicState) {
  return getCharacteristicCost(characteristic);
}

export function totalCharacteristicCost(characteristics: CharacteristicState[]) {
  return characteristics.reduce(
    (sum, characteristic) => sum + getCharacteristicCost(characteristic),
    0,
  );
}

export function getRemainingCharacteristicUnits(
  characteristic: CharacteristicState,
  family?: CharacteristicEffectFamily,
) {
  const currentFamilyUnits = family ? effectUnits(characteristic[family]) : 0;
  return Math.max(
    0,
    MAX_CHARACTERISTIC_UNITS - getCharacteristicUnits(characteristic) + currentFamilyUnits,
  );
}

export function getLegalMagnitudeOptions(
  characteristic: CharacteristicState,
  family: CharacteristicEffectFamily,
) {
  const max = getRemainingCharacteristicUnits(characteristic, family);
  return [1, 2, 3, 4, 5].filter((value) => value <= max);
}

export function getLegalMagnitudeOptionsForBudget(
  characteristic: CharacteristicState,
  family: CharacteristicEffectFamily,
  availableGlobalPoints: number,
) {
  return getLegalMagnitudeOptions(characteristic, family).filter((value) => {
    const candidate = { ...characteristic, [family]: value };
    return getCharacteristicCost(candidate) <= availableGlobalPoints;
  });
}

export function getCanAddAttributeSwapForBudget(
  characteristic: CharacteristicState,
  availableGlobalPoints: number,
) {
  if (getRemainingCharacteristicUnits(characteristic) < 1) return false;
  return getCharacteristicCost({
    ...characteristic,
    attributeSwaps: [...characteristic.attributeSwaps, "Attack"],
  }) <= availableGlobalPoints;
}

export function validateCharacteristic(characteristic: CharacteristicState) {
  const errors: string[] = [];
  for (const family of ["additionalDice", "resultModifier", "rerollOnes"] as const) {
    const value = characteristic[family];
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 5)) {
      errors.push("Characteristic magnitude selections must be whole values from 1 to 5.");
      break;
    }
  }

  const seenSwaps = new Set<CharacterAttribute>();
  for (const swap of characteristic.attributeSwaps) {
    if (!CHARACTER_ATTRIBUTES.includes(swap)) {
      errors.push("Attribute Swap selections must use a legal attribute.");
      break;
    }
    if (seenSwaps.has(swap)) {
      errors.push("The same Attribute Swap cannot be selected twice for one Characteristic.");
      break;
    }
    seenSwaps.add(swap);
  }

  const units = getCharacteristicUnits(characteristic);
  if (units > MAX_CHARACTERISTIC_UNITS) {
    errors.push("Each Characteristic may use at most 5 total choice-units.");
  }
  if (getCharacteristicCost(characteristic) > 15) {
    errors.push("Each Characteristic may spend at most 15 Character Points.");
  }
  return errors;
}

export function validateAttributes(
  method: AttributeMethod,
  attributes: Record<CharacterAttribute, CharacterAttributeValue>,
) {
  const errors: string[] = [];
  const values = CHARACTER_ATTRIBUTES.map((attribute) => attributes[attribute]);
  if (values.some((value) => value === "")) {
    errors.push("All attributes must be assigned before saving.");
    return errors;
  }
  const assignedValues = values as number[];
  const hasIllegalValue = values.some(
    (value) => !LEGAL_ATTRIBUTE_VALUES.includes(value as (typeof LEGAL_ATTRIBUTE_VALUES)[number]),
  );
  if (hasIllegalValue) {
    errors.push("Attributes must use only 4, 6, 8, 10, or 12.");
  }

  if (method === "HEROIC") {
    const requiredCounts = new Map<number, number>();
    for (const value of HEROIC_ATTRIBUTE_ARRAY) {
      requiredCounts.set(value, (requiredCounts.get(value) ?? 0) + 1);
    }
    const actualCounts = new Map<number, number>();
    for (const value of assignedValues) {
      actualCounts.set(value, (actualCounts.get(value) ?? 0) + 1);
    }
    const matchesHeroic = [...requiredCounts].every(
      ([value, count]) => (actualCounts.get(value) ?? 0) === count,
    );
    if (!matchesHeroic || actualCounts.size !== requiredCounts.size) {
      errors.push("Heroic attributes must use exactly 12, 10, 8, 8, 6, and 4.");
    }
  }

  if (method === "DESTINY") {
    const total = assignedValues.reduce((sum, value) => sum + value, 0);
    if (total !== 48) {
      errors.push("Destiny attributes must total exactly 48.");
    }
  }

  return errors;
}

export function validateResistPoints(
  level: number,
  resistPoints: Record<CharacterAttribute, number>,
) {
  const errors: string[] = [];
  const values = CHARACTER_ATTRIBUTES.map((attribute) => resistPoints[attribute]);
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    errors.push("Resist Point allocations must be non-negative whole numbers.");
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total > resistPointBudget(level)) {
    errors.push("Resist Point allocation cannot exceed available Resist Points.");
  }
  return errors;
}

export function renderCharacteristicDescriptor(characteristic: CharacteristicState) {
  const name = characteristic.name.trim() || "Unnamed Characteristic";
  const keyword = characteristic.keyword.trim();
  const gains: string[] = [];
  const mayEffects: string[] = [];
  const youMayEffects: string[] = [];
  if (characteristic.additionalDice) {
    gains.push(
      `${characteristic.additionalDice} additional ${
        characteristic.additionalDice === 1 ? "die" : "dice"
      }`,
    );
  }
  if (characteristic.resultModifier) {
    gains.push(`+${characteristic.resultModifier} to the result of any dice rolled`);
  }
  if (characteristic.rerollOnes) {
    mayEffects.push(
      `reroll up to ${characteristic.rerollOnes} ${
        characteristic.rerollOnes === 1 ? "result" : "results"
      } of 1`,
    );
  }
  if (characteristic.attributeSwaps.length > 0) {
    youMayEffects.push(
      `use your ${formatList(characteristic.attributeSwaps)} instead of the GD specified core attribute`,
    );
  }

  const effectText = formatCharacteristicEffects(gains, mayEffects, youMayEffects);
  const triggerText = keyword
    ? `When you make a Trial or Clash regarding ${keyword}`
    : "When you make a relevant Trial or Clash";
  return `${name}: ${triggerText}, ${effectText}.`;
}

function formatList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}

function joinWithAnd(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function formatCharacteristicEffects(
  gains: string[],
  mayEffects: string[],
  youMayEffects: string[],
) {
  if (gains.length === 0 && mayEffects.length === 0 && youMayEffects.length === 0) {
    return "you have no selected effect yet";
  }
  const hasGains = gains.length > 0;
  const gainClauses = hasGains ? [`you gain ${gains[0]}`, ...gains.slice(1)] : [];
  const mayClauses = mayEffects.map((effect, index) =>
    hasGains || index > 0 ? `may ${effect}` : `you may ${effect}`,
  );
  const youMayClauses = youMayEffects.map((effect) => `you may ${effect}`);
  return joinWithAnd([...gainClauses, ...mayClauses, ...youMayClauses]);
}

export function selectedTraitSummary(selectedTraitKeys: string[], level: number) {
  const selected = selectedTraitKeys
    .map((key) => PLAYER_TRAIT_CATALOG.find((trait) => trait.key === key))
    .filter((trait): trait is PlayerTraitDefinition => Boolean(trait));
  const positiveCost = selected
    .filter((trait) => trait.classification === "POSITIVE")
    .reduce((sum, trait) => sum + trait.pointValue, 0);
  const negativeTraits = selected.filter((trait) => trait.classification === "NEGATIVE");
  const negativeBonusRaw = negativeTraits.reduce((sum, trait) => sum + trait.pointValue, 0);
  const negativeBonusAllowed = Math.min(2, negativeBonusRaw);
  const budget = traitPointBudget(level);
  return {
    selected,
    budget,
    positiveCost,
    negativeTraitCount: negativeTraits.length,
    negativeBonusRaw,
    negativeBonusAllowed,
    available: budget + negativeBonusAllowed,
    remaining: budget + negativeBonusAllowed - positiveCost,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readStrictInteger<T extends number | "">(value: unknown, fallback: T): number | T {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numeric) ? numeric : Number.NaN;
}

function readMagnitude(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return readStrictInteger(value, Number.NaN);
}

function normalizeAttributeValue(value: unknown, fallback: CharacterAttributeValue) {
  if (value === undefined || value === null || value === "") return fallback;
  return readStrictInteger(value, fallback);
}

function normalizeAttributes(value: unknown) {
  const record = readRecord(value);
  return CHARACTER_ATTRIBUTES.reduce<Record<CharacterAttribute, CharacterAttributeValue>>((acc, attribute) => {
    acc[attribute] = normalizeAttributeValue(record[attribute], DEFAULT_ATTRIBUTES[attribute]);
    return acc;
  }, { ...DEFAULT_ATTRIBUTES });
}

function normalizeResistPoints(value: unknown) {
  const record = readRecord(value);
  return CHARACTER_ATTRIBUTES.reduce<Record<CharacterAttribute, number>>((acc, attribute) => {
    acc[attribute] = readStrictInteger(record[attribute], 0);
    return acc;
  }, { ...DEFAULT_RESIST_POINTS });
}

function normalizeGreatSecret(value: unknown): GreatSecretState {
  const record = readRecord(value);
  const templateKey = readString(record.templateKey, 80) || "historic_bloodline";
  const template =
    GREAT_SECRET_TEMPLATES.find((candidate) => candidate.key === templateKey) ??
    GREAT_SECRET_TEMPLATES[0];
  const fields = Array.isArray(record.fields)
    ? record.fields.map((field) => readString(field, 500))
    : [];
  return {
    templateKey: template.key,
    fields: template.fieldLabels.map((_, index) => fields[index] ?? ""),
  };
}

function normalizeAttributeSwaps(record: Record<string, unknown>) {
  const swaps = Array.isArray(record.attributeSwaps)
    ? record.attributeSwaps
    : record.attributeSwap
      ? [record.attributeSwap]
      : [];
  return swaps
    .map((swap) => readString(swap, 40) as CharacterAttribute)
    .filter(Boolean)
    .slice(0, CHARACTER_ATTRIBUTES.length + 1);
}

function normalizeCharacteristics(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((row, index): CharacteristicState => {
    const record = readRecord(row);
    const characteristic: CharacteristicState = {
      id: readString(record.id, 80) || `characteristic-${index + 1}`,
      name: readString(record.name, 120),
      keyword: readString(record.keyword, 120),
      attributeSwaps: normalizeAttributeSwaps(record),
    };
    const additionalDice = readMagnitude(record.additionalDice);
    const resultModifier = readMagnitude(record.resultModifier);
    const rerollOnes = readMagnitude(record.rerollOnes);
    if (additionalDice !== undefined) characteristic.additionalDice = additionalDice;
    if (resultModifier !== undefined) characteristic.resultModifier = resultModifier;
    if (rerollOnes !== undefined) characteristic.rerollOnes = rerollOnes;
    return characteristic;
  });
}

function normalizeAttributeMethod(value: unknown): AttributeMethod {
  return value === "DESTINY" || value === "ROLLED" || value === "HEROIC" ? value : "HEROIC";
}

function normalizeSelectedTraitKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  const legalKeys = new Set(PLAYER_TRAIT_CATALOG.map((trait) => trait.key));
  return Array.from(
    new Set(
      value
        .map((key) => readString(key, 80))
        .filter((key) => legalKeys.has(key)),
    ),
  );
}

export function normalizeBuilderData(value: unknown): CharacterBuilderData {
  const defaults = defaultBuilderData();
  const record = readRecord(value);
  return {
    narrativeNotes: readString(record.narrativeNotes, 4000),
    greatSecret: normalizeGreatSecret(record.greatSecret),
    characteristics: normalizeCharacteristics(record.characteristics),
    attributeMethod: normalizeAttributeMethod(record.attributeMethod),
    attributes: normalizeAttributes(record.attributes),
    resistPoints: normalizeResistPoints(record.resistPoints),
    selectedTraitKeys: normalizeSelectedTraitKeys(record.selectedTraitKeys ?? defaults.selectedTraitKeys),
  };
}

export function validateBuilderData(data: CharacterBuilderData, level: number) {
  const errors: string[] = [];

  const characteristicErrors = data.characteristics.flatMap(validateCharacteristic);
  if (characteristicErrors.length > 0) {
    errors.push(...Array.from(new Set(characteristicErrors)));
  }
  const characteristicTotal = totalCharacteristicCost(data.characteristics);
  if (characteristicTotal > characterPoints(level)) {
    errors.push("Total Characteristic cost cannot exceed available Character Points.");
  }

  errors.push(...validateAttributes(data.attributeMethod, data.attributes));
  errors.push(...validateResistPoints(level, data.resistPoints));

  const traitSummary = selectedTraitSummary(data.selectedTraitKeys, level);
  if (traitSummary.negativeTraitCount > 2) {
    errors.push("A character may select at most 2 Negative Traits.");
  }
  if (traitSummary.positiveCost > traitSummary.available) {
    errors.push("Positive Trait cost cannot exceed Trait Points plus allowed Negative Trait bonus.");
  }

  return Array.from(new Set(errors));
}
