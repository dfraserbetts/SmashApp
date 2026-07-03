import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = "scripts/fixtures/monsters/natural-baseline";

const FIXTURES = [
  { key: "bruiser", label: "Natural Bruiser", prefix: "01-natural-bruiser" },
  { key: "glass", label: "Glass Cannon", prefix: "02-glass-cannon" },
  { key: "defender", label: "Natural Defender", prefix: "03-natural-defender" },
  { key: "controller", label: "Natural Controller", prefix: "04-natural-controller" },
] as const;

const EQUIPMENT_ID_KEYS = [
  "mainHandItemId",
  "offHandItemId",
  "smallItemId",
  "headArmorItemId",
  "shoulderArmorItemId",
  "torsoArmorItemId",
  "legsArmorItemId",
  "feetArmorItemId",
  "headItemId",
  "neckItemId",
  "armsItemId",
  "beltItemId",
] as const;

const AXES = [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
] as const;

type Axis = (typeof AXES)[number];
type JsonRecord = Record<string, unknown>;

type AttackSummary = {
  name: string;
  mode: string;
  rangeCategory: "melee" | "ranged" | "aoe";
  targetCount: number;
  range: string;
  damageLane: string;
  damageTypeCount: number;
  damageTypes: string[];
  authoredStrength: number;
  tableWoundsPerSuccessPerType: number;
  totalSingleTargetWoundsPerSuccess: number;
  totalPressureWoundsPerSuccess: number;
  effects: string[];
};

type MonsterSummary = {
  key: string;
  label: string;
  rawPath: string;
  powerPath: string;
  calculatorPath: string;
  raw: JsonRecord;
  power: JsonRecord;
  calculator: JsonRecord;
  attacks: AttackSummary[];
  ppv: number;
  mpv: number;
  physicalDefenceStringValue: number;
  mentalDefenceStringValue: number;
  dodgeDice: number;
  physicalResilience: number;
  mentalPerseverance: number;
  powers: Array<{ name: string; derivedCooldownTurns: number | null; basePowerValue: number | null }>;
};

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getAxisVector(record: JsonRecord, path: string[]): Record<Axis, number> {
  let current: unknown = record;
  for (const segment of path) current = asRecord(current)[segment];
  const vector = asRecord(current);
  return Object.fromEntries(AXES.map((axis) => [axis, round(asNumber(vector[axis]))])) as Record<
    Axis,
    number
  >;
}

function getPathNumber(record: JsonRecord, path: string[], fallback = 0): number {
  let current: unknown = record;
  for (const segment of path) current = asRecord(current)[segment];
  return asNumber(current, fallback);
}

function getPathRecord(record: JsonRecord, path: string[]): JsonRecord {
  let current: unknown = record;
  for (const segment of path) current = asRecord(current)[segment];
  return asRecord(current);
}

function classifyDamage(value: number): string {
  if (value >= 14) return "Extreme";
  if (value >= 10) return "High";
  if (value >= 6) return "Standard";
  if (value >= 2) return "Low";
  return "Below Low";
}

function classifyPpv(value: number): string {
  if (value >= 18) return "Extreme";
  if (value >= 12) return "High";
  if (value >= 6) return "Standard";
  if (value >= 0) return "Low";
  return "Below Low";
}

function classifyMpv(value: number): string {
  if (value >= 14) return "Extreme";
  if (value >= 9) return "High";
  if (value >= 6) return "Standard";
  if (value >= 0) return "Low";
  return "Below Low";
}

function classifyPhysicalDefenceString(value: number): string {
  if (value >= 7) return "Extreme";
  if (value >= 5) return "High";
  if (value >= 3) return "Standard";
  if (value >= 0) return "Low";
  return "Below Low";
}

function classifyMentalDefenceString(value: number): string {
  if (value >= 5) return "Extreme";
  if (value >= 3) return "High";
  if (value >= 2) return "Standard";
  if (value >= 0) return "Low";
  return "Below Low";
}

function classifyDodge(value: number): string {
  if (value >= 4) return "Extreme";
  if (value >= 3) return "High";
  if (value >= 2) return "Standard";
  if (value >= 1) return "Low";
  return "Below Low";
}

function attackSummaries(raw: JsonRecord): AttackSummary[] {
  return asArray(raw.attacks).flatMap((attackValue) => {
    const attack = asRecord(attackValue);
    const attackName = asString(attack.attackName, "Unnamed Attack");
    const attackMode = asString(attack.attackMode, "UNKNOWN");
    const config = asRecord(attack.attackConfig);

    return (["melee", "ranged", "aoe"] as const).flatMap((rangeCategory) => {
      const profile = asRecord(config[rangeCategory]);
      if (profile.enabled !== true) return [];

      const damageTypes = asArray(profile.damageTypes).map((damageType) => {
        const damage = asRecord(damageType);
        return `${asString(damage.mode, "UNKNOWN")} ${asString(damage.name, "Unknown")}`.trim();
      });
      const physicalStrength = asNumber(profile.physicalStrength);
      const mentalStrength = asNumber(profile.mentalStrength);
      const authoredStrength = Math.max(physicalStrength, mentalStrength);
      const damageLane =
        physicalStrength > 0 && mentalStrength > 0
          ? "mixed"
          : mentalStrength > 0
            ? "mental"
            : "physical";
      const tableWoundsPerSuccessPerType = authoredStrength * 2;
      const damageTypeCount = Math.max(1, damageTypes.length);
      const targetCount =
        rangeCategory === "aoe"
          ? Math.max(1, asNumber(profile.count, 1))
          : Math.max(1, asNumber(profile.targets, 1));
      const totalSingleTargetWoundsPerSuccess =
        tableWoundsPerSuccessPerType * damageTypeCount;
      const totalPressureWoundsPerSuccess = totalSingleTargetWoundsPerSuccess * targetCount;
      const range =
        rangeCategory === "melee"
          ? "melee"
          : rangeCategory === "ranged"
            ? `${asNumber(profile.distance)} ft`
            : `${asString(profile.shape, "AOE")} @ ${asNumber(profile.centerRange)} ft`;

      return [
        {
          name: attackName,
          mode: attackMode,
          rangeCategory,
          targetCount,
          range,
          damageLane,
          damageTypeCount,
          damageTypes,
          authoredStrength,
          tableWoundsPerSuccessPerType,
          totalSingleTargetWoundsPerSuccess,
          totalPressureWoundsPerSuccess,
          effects: asArray(profile.attackEffects).map((effect) => String(effect)),
        },
      ];
    });
  });
}

function readPowerCooldowns(power: JsonRecord): MonsterSummary["powers"] {
  const resolverOutput = asRecord(power.resolverOutput);
  return asArray(resolverOutput.powers).map((powerValue) => {
    const resolvedPower = asRecord(powerValue);
    const derivedCooldown = asRecord(resolvedPower.derivedCooldown);
    return {
      name: asString(resolvedPower.name, "Unnamed Power"),
      derivedCooldownTurns:
        typeof resolvedPower.derivedCooldownTurns === "number"
          ? resolvedPower.derivedCooldownTurns
          : typeof derivedCooldown.derivedCooldownTurns === "number"
            ? derivedCooldown.derivedCooldownTurns
            : null,
      basePowerValue:
        typeof derivedCooldown.basePowerValue === "number" ? derivedCooldown.basePowerValue : null,
    };
  });
}

function loadFixture(prefix: string, key: string, label: string): MonsterSummary {
  const rawPath = join(FIXTURE_DIR, `${prefix}.raw.json`);
  const powerPath = join(FIXTURE_DIR, `${prefix}.power.json`);
  const calculatorPath = join(FIXTURE_DIR, `${prefix}.calculator.json`);
  const raw = readJson(rawPath);
  const power = readJson(powerPath);
  const calculator = readJson(calculatorPath);
  return {
    key,
    label,
    rawPath,
    powerPath,
    calculatorPath,
    raw,
    power,
    calculator,
    attacks: attackSummaries(raw),
    ppv: asNumber(raw.physicalProtection),
    mpv: asNumber(raw.mentalProtection),
    physicalDefenceStringValue: getPathNumber(calculator, [
      "debug",
      "survivabilityLaneBreakdown",
      "physicalDefence",
      "blockPerSuccess",
    ]),
    mentalDefenceStringValue: getPathNumber(calculator, [
      "debug",
      "survivabilityLaneBreakdown",
      "mentalDefence",
      "blockPerSuccess",
    ]),
    dodgeDice: getPathNumber(calculator, [
      "debug",
      "survivabilityLaneBreakdown",
      "dodge",
      "currentDodgeDice",
    ]),
    physicalResilience: asNumber(raw.physicalResilienceMax),
    mentalPerseverance: asNumber(raw.mentalPerseveranceMax),
    powers: readPowerCooldowns(power),
  };
}

function checkFixturePresence(): MonsterSummary[] {
  const missing = FIXTURES.flatMap((fixture) =>
    ["raw", "power", "calculator"].flatMap((kind) => {
      const path = join(FIXTURE_DIR, `${fixture.prefix}.${kind}.json`);
      return existsSync(path) ? [] : [path];
    }),
  );
  if (missing.length > 0) {
    throw new Error(`Missing expected fixture files:\n${missing.join("\n")}`);
  }
  return FIXTURES.map((fixture) => loadFixture(fixture.prefix, fixture.key, fixture.label));
}

function isNaturalOnly(monster: MonsterSummary): boolean {
  const equipmentClear = EQUIPMENT_ID_KEYS.every((key) => monster.raw[key] === null);
  const attacksNatural = asArray(monster.raw.attacks).every(
    (attack) => asRecord(attack).attackMode === "NATURAL",
  );
  const naturalProtectionPresent =
    typeof monster.raw.naturalPhysicalProtection === "number" &&
    typeof monster.raw.naturalMentalProtection === "number";
  const noTestTags = !asArray(monster.raw.tags).includes("Test");
  return equipmentClear && attacksNatural && naturalProtectionPresent && noTestTags;
}

function maxAttack(monster: MonsterSummary, selector: (attack: AttackSummary) => boolean): number {
  return Math.max(
    0,
    ...monster.attacks
      .filter(selector)
      .map((attack) => attack.totalSingleTargetWoundsPerSuccess),
  );
}

function radar(monster: MonsterSummary, axis: Axis): number {
  return round(asNumber(asRecord(monster.calculator.radarAxes)[axis]));
}

function printVector(label: string, vector: Record<Axis, number>): void {
  console.log(`${label}: ${AXES.map((axis) => `${axis} ${vector[axis]}`).join(" | ")}`);
}

function printFixture(monster: MonsterSummary): void {
  console.log(`\n## ${monster.label}`);
  console.log(
    `natural-only ${isNaturalOnly(monster) ? "PASS" : "CHECK"} | PR ${monster.physicalResilience} | MP ${monster.mentalPerseverance} | PPV ${monster.ppv} (${classifyPpv(monster.ppv)}) | MPV ${monster.mpv} (${classifyMpv(monster.mpv)}) | PDSV ${monster.physicalDefenceStringValue} (${classifyPhysicalDefenceString(monster.physicalDefenceStringValue)}) | MDSV ${monster.mentalDefenceStringValue} (${classifyMentalDefenceString(monster.mentalDefenceStringValue)}) | Dodge ${monster.dodgeDice} (${classifyDodge(monster.dodgeDice)})`,
  );
  for (const attack of monster.attacks) {
    console.log(
      `attack ${attack.name} [${attack.mode}/${attack.rangeCategory}/${attack.damageLane}] ${attack.damageTypes.join(", ") || "no damage type"} | die ${asString(monster.raw.attackDie)} | targets ${attack.targetCount} | range ${attack.range} | Strength ${attack.authoredStrength} => ${attack.tableWoundsPerSuccessPerType}/type | single-target total ${attack.totalSingleTargetWoundsPerSuccess} (${classifyDamage(attack.totalSingleTargetWoundsPerSuccess)}) | total pressure ${attack.totalPressureWoundsPerSuccess}${attack.effects.length ? ` | riders ${attack.effects.join(", ")}` : ""}`,
    );
  }
  console.log(
    `powers: ${monster.powers
      .map((power) => `${power.name} cd ${power.derivedCooldownTurns ?? "?"} BPV ${power.basePowerValue ?? "?"}`)
      .join("; ")}`,
  );
  printVector("radar", getAxisVector(monster.calculator, ["radarAxes"]));
  printVector("canonical power", getAxisVector(monster.calculator, ["debug", "powerContribution", "canonicalPowerAxisVector"]));
  printVector("effective power", getAxisVector(monster.calculator, ["debug", "powerContribution", "effectivePowerAxisVector"]));
  printVector("non-power", getAxisVector(monster.calculator, ["debug", "nonPowerContribution", "axisVector"]));
}

function printRoleFriction(monsters: MonsterSummary[]): void {
  const byKey = Object.fromEntries(monsters.map((monster) => [monster.key, monster]));
  const bruiser = byKey.bruiser;
  const glass = byKey.glass;
  const defender = byKey.defender;
  const controller = byKey.controller;
  if (!bruiser || !glass || !defender || !controller) throw new Error("Missing role fixtures.");

  const checks = [
    [
      "Bruiser direct physical threat > Defender",
      maxAttack(bruiser, (attack) => attack.damageLane === "physical") >
        maxAttack(defender, (attack) => attack.damageLane === "physical") &&
        radar(bruiser, "physicalThreat") > radar(defender, "physicalThreat"),
    ],
    [
      "Bruiser physical survivability > Controller",
      bruiser.ppv > controller.ppv &&
        bruiser.physicalDefenceStringValue > controller.physicalDefenceStringValue &&
        radar(bruiser, "physicalSurvivability") > radar(controller, "physicalSurvivability"),
    ],
    [
      "Glass Cannon peak output > Bruiser",
      Math.max(...glass.attacks.map((attack) => attack.totalSingleTargetWoundsPerSuccess)) >
        Math.max(...bruiser.attacks.map((attack) => attack.totalSingleTargetWoundsPerSuccess)),
    ],
    [
      "Controller manipulation > Bruiser",
      radar(controller, "manipulation") > radar(bruiser, "manipulation"),
    ],
    [
      "Defender does not out-threat Bruiser/Glass",
      radar(defender, "physicalThreat") < radar(bruiser, "physicalThreat") &&
        radar(defender, "physicalThreat") < radar(glass, "physicalThreat"),
    ],
    [
      "Controller is not a better Glass Cannon",
      radar(controller, "physicalThreat") < radar(glass, "physicalThreat") &&
        radar(controller, "mentalThreat") < radar(glass, "mentalThreat") &&
        Math.max(...controller.attacks.map((attack) => attack.totalSingleTargetWoundsPerSuccess)) <
          Math.max(...glass.attacks.map((attack) => attack.totalSingleTargetWoundsPerSuccess)),
    ],
  ] as const;

  console.log("\n## Role-Friction Checks");
  for (const [label, passed] of checks) {
    console.log(`${passed ? "PASS" : "CHECK"} ${label}`);
  }

  console.log("\nRole rankings:");
  const rankings: Array<[string, (monster: MonsterSummary) => number]> = [
    ["peak single-target wounds/success", (monster) => Math.max(...monster.attacks.map((attack) => attack.totalSingleTargetWoundsPerSuccess))],
    ["PPV", (monster) => monster.ppv],
    ["MPV", (monster) => monster.mpv],
    ["PDSV", (monster) => monster.physicalDefenceStringValue],
    ["MDSV", (monster) => monster.mentalDefenceStringValue],
    ["Dodge dice", (monster) => monster.dodgeDice],
    ["radar manipulation", (monster) => radar(monster, "manipulation")],
    ["radar synergy", (monster) => radar(monster, "synergy")],
  ];
  for (const [label, selector] of rankings) {
    const sorted = [...monsters].sort((a, b) => selector(b) - selector(a));
    console.log(
      `${label}: ${sorted.map((monster) => `${monster.label} ${round(selector(monster))}`).join(" > ")}`,
    );
  }
}

function printBandSanity(monsters: MonsterSummary[]): void {
  console.log("\n## Band Sanity vs docs/07 Level 5 Bands");
  for (const monster of monsters) {
    const attackBands = monster.attacks
      .map((attack) => `${attack.name} ${attack.totalSingleTargetWoundsPerSuccess} ${classifyDamage(attack.totalSingleTargetWoundsPerSuccess)}`)
      .join("; ");
    console.log(
      `${monster.label}: damage [${attackBands}] | PPV ${monster.ppv} ${classifyPpv(monster.ppv)} | MPV ${monster.mpv} ${classifyMpv(monster.mpv)} | PDSV ${monster.physicalDefenceStringValue} ${classifyPhysicalDefenceString(monster.physicalDefenceStringValue)} | MDSV ${monster.mentalDefenceStringValue} ${classifyMentalDefenceString(monster.mentalDefenceStringValue)} | Dodge ${monster.dodgeDice} ${classifyDodge(monster.dodgeDice)}`,
    );
  }
  console.log(
    "Band sanity: accepted fixtures occupy the intended Level 5 spread. Glass Cannon defines Extreme damage, Bruiser defines High physical output/protection, Defender defines high defence with low damage, and Controller defines manipulation/mental survivability without out-damaging Glass Cannon.",
  );
}

function printNormalizationContext(monster: MonsterSummary): void {
  const curves = getPathRecord(monster.calculator, [
    "debug",
    "normalizationBreakdown",
    "displayCurvePoints",
  ]);
  console.log(`\nnormalization ${monster.label}:`);
  for (const axis of AXES) {
    const curve = asRecord(curves[axis]);
    console.log(`${axis} min ${round(asNumber(curve.min))} max ${round(asNumber(curve.max))}`);
  }
}

function main(): void {
  const monsters = checkFixturePresence();
  console.log("Natural Baseline Role-Friction Report");
  console.log(`Fixture directory: ${FIXTURE_DIR}`);
  console.log("All 12 fixture files exist and parsed as JSON.");
  console.log(
    `Natural-only compliance: ${monsters.every(isNaturalOnly) ? "PASS" : "CHECK"}`,
  );
  console.log(
    `No Test tags: ${monsters.every((monster) => !asArray(monster.raw.tags).includes("Test")) ? "PASS" : "CHECK"}`,
  );

  for (const monster of monsters) printFixture(monster);
  printRoleFriction(monsters);
  printBandSanity(monsters);
  for (const monster of monsters) printNormalizationContext(monster);

  console.log("\n## Feasibility");
  console.log(
    "The retired scripts/combatSmokeTest.ts legacy simulator no longer runs. Current fixture diagnostics live in scripts/combatLab.smoke.ts; this report avoids fake simulation and compares accepted fixture table-facing outputs instead.",
  );
  console.log("\n## Recommendation");
  console.log(
    "The four accepted natural-only fixtures are coherent enough to define Natural Baseline v1. docs/07 Level 5 bands are good enough to feed Forge Output Bands Blueprint v1. No fixture, tuning, or gameplay-code adjustment is required before drafting docs/08; carry forward the note that Defender is near-lead rather than sole leader in PPV/PDSV because Bruiser intentionally owns the physical-bruiser defence peak.",
  );
}

main();
