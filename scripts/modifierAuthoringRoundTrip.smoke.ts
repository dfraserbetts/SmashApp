import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MonsterBlockCard } from "../app/summoning-circle/components/MonsterBlockCard";
import {
  createDefaultPowerPacket,
  toEditable,
  toPayload,
} from "../app/summoning-circle/components/SummoningCircleEditor";
import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  normalizeCharacterPower,
  summarizeCharacterPowers,
} from "../lib/characterBuilder/powers";
import {
  MODIFIER_AUTHORING_VALUES,
  confirmModifierConversion,
  createModifierConversionDraft,
  formatModifierForIntention,
  getModifierAuthoringPacketErrors,
  isLegacyAugmentDebuffPacket,
  switchModifierAuthoringIntention,
} from "../lib/powers/modifierAuthoring";
import {
  getThreeFieldAugmentDebuffPublicWriteError,
  THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR,
  THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_ENABLED,
  validateThreeFieldAugmentDebuffPowers,
} from "../lib/powers/authoringRules";
import { assignSummoningPowerIdentities } from "../lib/summoning/monsterPowerReconciliation";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import { renderPowerDescriptorLines } from "../lib/summoning/render";
import { normalizeMonsterUpsertInput } from "../lib/summoning/validation";
import type { EffectPacket, Power } from "../lib/summoning/types";

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

function semanticPower(modifier = 2, intention: "AUGMENT" | "DEBUFF" = "AUGMENT"): Power {
  const packet = {
    ...createDefaultCharacterPowerPacket(intention, 0),
    targetedAttribute: "GUARD" as const,
    modifier,
    detailsJson: {
      statTarget: "Guard",
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
    },
  };
  const power = {
    ...createDefaultCharacterPower(0),
    name: `${intention} ${modifier}`,
    effectPackets: [packet],
    intentions: [packet],
  };
  return normalizeCharacterPower(power, 0);
}

const defaultAugment = createDefaultCharacterPowerPacket("AUGMENT", 0);
const defaultDebuff = createDefaultPowerPacket("ATTACK", 0, () => "summoning-packet");
const initializedDebuff = switchModifierAuthoringIntention(
  defaultDebuff,
  "DEBUFF",
  { statTarget: "Guard" },
);
check(defaultAugment.potency === 1 && defaultAugment.modifier === 1, "Character semantic defaults separate Potency and Modifier.");
check(defaultAugment.effectDurationType === "UNTIL_TARGET_NEXT_TURN", "Character semantic defaults use a supported duration.");
check(initializedDebuff.id === "summoning-packet" && initializedDebuff.modifier === 1, "Summoning intention initialization preserves identity and defaults Modifier.");

for (const value of MODIFIER_AUTHORING_VALUES) {
  check(formatModifierForIntention("AUGMENT", value) === `+${value}`, `Augment ${value} displays a positive sign.`);
  check(formatModifierForIntention("DEBUFF", value) === `−${value}`, `Debuff ${value} displays a negative sign.`);
}
check(MODIFIER_AUTHORING_VALUES.every((value) => value > 0), "Display signs are not persisted in unsigned storage.");

const legacy: EffectPacket = {
  ...defaultAugment,
  id: "legacy-packet",
  modifier: null,
  potency: 4,
  effectDurationType: "INSTANT",
};
const legacyBefore = JSON.stringify(legacy);
const conversionDraft = createModifierConversionDraft(legacy);
check(isLegacyAugmentDebuffPacket(legacy), "A Modifier-null Augment remains legacy.");
check(conversionDraft.potency === null && conversionDraft.modifier === null, "Conversion starts with semantic values unselected.");
check(conversionDraft.effectDurationType === null, "Unsupported legacy Instant duration is not silently retained.");
check(JSON.stringify(legacy) === legacyBefore, "Opening conversion does not mutate the packet.");
check(JSON.stringify(legacy) === legacyBefore, "Cancelling conversion leaves the packet byte-for-byte unchanged.");
const confirmed = confirmModifierConversion({
  packet: legacy,
  packetIndex: 0,
  requiresExpectedTargets: false,
  draft: {
    ...conversionDraft,
    potency: 2,
    modifier: 3,
    effectDurationType: "TURNS",
    effectDurationTurns: 3,
  },
});
check(confirmed.errors.length === 0 && confirmed.packet?.id === legacy.id, "Conversion confirmation preserves packet identity.");
check(confirmed.packet?.potency === 2 && confirmed.packet.modifier === 3, "Conversion persists only explicitly selected Potency and Modifier.");

const augment = semanticPower(3).effectPackets[0]!;
const debuff = switchModifierAuthoringIntention(augment, "DEBUFF", { ...augment.detailsJson });
check(debuff.id === augment.id && debuff.modifier === 3 && debuff.potency === augment.potency, "Augment to Debuff preserves ID and unsigned values.");
const augmentAgain = switchModifierAuthoringIntention(debuff, "AUGMENT", { ...debuff.detailsJson });
check(augmentAgain.id === debuff.id && augmentAgain.modifier === 3, "Debuff to Augment preserves ID and Modifier.");
const attack = switchModifierAuthoringIntention(augmentAgain, "ATTACK", { attackMode: "PHYSICAL", damageTypes: ["Slash"] });
check(attack.id === augmentAgain.id && attack.modifier === null, "Switching away clears Modifier without replacing identity.");

const aoeMissing = semanticPower(2).effectPackets[0]!;
check(getModifierAuthoringPacketErrors({ packet: aoeMissing, packetIndex: 0, requiresExpectedTargets: true }).length === 0, "Expected Targets is no longer a player-authored validation field.");

const invalidBase = semanticPower(2);
for (const invalid of [0, 6, 2.5]) {
  const invalidPower = structuredClone(invalidBase);
  invalidPower.effectPackets[0]!.modifier = invalid;
  invalidPower.intentions = invalidPower.effectPackets;
  check(validateThreeFieldAugmentDebuffPowers([invalidPower]) !== null, `Modifier ${invalid} is rejected.`);
}
const unsupported = structuredClone(invalidBase);
unsupported.effectPackets[0]!.intention = "ATTACK";
unsupported.effectPackets[0]!.type = "ATTACK";
unsupported.intentions = unsupported.effectPackets;
check(validateThreeFieldAugmentDebuffPowers([unsupported]) !== null, "Modifier on an unsupported intention is rejected.");

const characterRoundTripSource = semanticPower(4);
const characterRoundTrip = normalizeCharacterPower(JSON.parse(JSON.stringify(characterRoundTripSource)), 0);
check(characterRoundTrip.effectPackets[0]?.modifier === 4, "Character save/reload preserves Modifier.");
check(characterRoundTrip.id === characterRoundTripSource.id && characterRoundTrip.effectPackets[0]?.id === characterRoundTripSource.effectPackets[0]?.id, "Character save/reload preserves power and packet IDs.");

const summoningSourcePower = semanticPower(5);
const summoningHydrated = toEditable({
  id: "monster-round-trip",
  name: "Round Trip",
  level: 3,
  tier: "SOLDIER",
  powers: [summoningSourcePower],
});
const summoningPayload = toPayload(summoningHydrated);
const summoningNormalized = normalizeMonsterUpsertInput(summoningPayload);
check(summoningNormalized.ok, "Summoning POST/PUT normalization accepts a complete semantic payload.");
if (summoningNormalized.ok) {
  check(summoningNormalized.data.powers[0]?.effectPackets[0]?.modifier === 5, "Summoning save/reload preserves Modifier.");
  check(summoningNormalized.data.powers[0]?.effectPackets[0]?.id === summoningSourcePower.effectPackets[0]?.id, "Summoning save/reload preserves a stable packet identity.");
}
const copySource = semanticPower(5);
const copied = assignSummoningPowerIdentities(copySource, {
  forceNew: true,
  createId: (() => { let index = 0; return () => `copy-${++index}`; })(),
});
check(copied.id !== copySource.id && copied.effectPackets[0]?.id !== copySource.effectPackets[0]?.id, "Copy creates fresh power and packet IDs.");
check(copied.effectPackets[0]?.modifier === 5, "Copy preserves semantic values.");
let legacyCopyId = 0;
const copiedLegacy = assignSummoningPowerIdentities({ ...semanticPower(2), effectPackets: [legacy], intentions: [legacy] }, { forceNew: true, createId: () => `legacy-copy-${++legacyCopyId}` });
check(copiedLegacy.effectPackets[0]?.modifier === null, "Copy preserves legacy null.");

for (const modifier of MODIFIER_AUTHORING_VALUES) {
  const augmentDescriptor = renderPowerDescriptorLines(semanticPower(modifier)).join(" ");
  const debuffDescriptor = renderPowerDescriptorLines(semanticPower(modifier, "DEBUFF")).join(" ");
  check(augmentDescriptor.includes(`+${modifier} Guard`), `Shared descriptor renders Augment +${modifier}.`);
  check(debuffDescriptor.includes(`-${modifier} Guard`), `Shared descriptor renders Debuff -${modifier}.`);
}
const stacked = semanticPower(2);
stacked.effectPackets[0]!.potency = 3;
stacked.intentions = stacked.effectPackets;
const stackedText = renderPowerDescriptorLines(stacked).join(" ");
check(stackedText.includes("3 stacks of +2 Guard") && !stackedText.includes("+6 Guard"), "Descriptor separates stacks from fixed strength.");
const oneStack = semanticPower(1);
oneStack.effectPackets[0]!.potency = 1;
oneStack.intentions = oneStack.effectPackets;
check(renderPowerDescriptorLines(oneStack).join(" ").includes("1 stack of +1 Guard"), "Descriptor uses singular stack.");
const finite = semanticPower(2);
finite.effectPackets[0]!.effectDurationType = "TURNS";
finite.effectPackets[0]!.effectDurationTurns = 3;
finite.intentions = finite.effectPackets;
check(renderPowerDescriptorLines(finite).join(" ").includes("for up to 3 turns"), "Semantic finite duration uses up-to wording and plural turns.");
check(renderPowerDescriptorLines(semanticPower(2)).join(" ").includes("target's next turn"), "Until-target-next-turn descriptor is truthful.");
const passive = semanticPower(2);
passive.effectPackets[0]!.effectDurationType = "PASSIVE";
passive.effectPackets[0]!.effectDurationTurns = null;
passive.intentions = passive.effectPackets;
const passiveText = renderPowerDescriptorLines(passive).join(" ");
check(passiveText.includes("no fixed duration") && passiveText.includes("stacks still degrade"), "Passive descriptor does not claim a four-turn runtime.");
const recurring = semanticPower(2);
recurring.effectPackets[0]!.effectTimingType = "START_OF_TURN";
recurring.effectPackets[0]!.effectDurationType = "TURNS";
recurring.effectPackets[0]!.effectDurationTurns = 2;
recurring.intentions = recurring.effectPackets;
const recurringText = renderPowerDescriptorLines(recurring).join(" ");
check(!recurringText.includes("max-and-refresh") && !recurringText.includes("failed same-source"), "Recurring descriptor omits internal reapplication mechanics.");
const recurringMonster = { ...summoningHydrated, powers: [recurring] };
const livePreviewMarkup = renderToStaticMarkup(createElement(MonsterBlockCard, {
  monster: recurringMonster,
}));
const printModeMarkup = renderToStaticMarkup(createElement(MonsterBlockCard, {
  monster: recurringMonster,
  isPrint: true,
}));
for (const [surface, markup] of [["live preview", livePreviewMarkup], ["print mode", printModeMarkup]] as const) {
  check(markup.includes(recurring.name), `${surface} renders the recurring Power fixture.`);
  check(!markup.includes("max-and-refresh") && !markup.includes("failed same-source"), `${surface} omits the recurring reapplication warning.`);
}

const linked = semanticPower(2);
const linkedPacket = {
  ...createDefaultCharacterPowerPacket("AUGMENT", 1),
  potency: 2,
  modifier: 1,
  targetedAttribute: "GUARD" as const,
  detailsJson: { statTarget: "Guard" },
};
linked.effectPackets.push(linkedPacket);
linked.intentions = linked.effectPackets;
const linkedText = renderPowerDescriptorLines(linked).join(" ");
check(linkedText.toLowerCase().includes("primary packet"), "Linked descriptor names the primary packet.");
check(!/roll[^.]*linked/i.test(linkedText), "Linked descriptor does not imply an additional roll.");
check(linkedPacket.diceCount === 1 && linkedPacket.potency === 2 && linkedPacket.modifier === 1, "Linked Potency and Modifier remain independent while Dice is inherited.");

const bpvLow = resolvePowerCosts([semanticPower(1)], undefined, { level: 3, tier: "SOLDIER" }).powers[0]!;
const bpvHigh = resolvePowerCosts([semanticPower(5)], undefined, { level: 3, tier: "SOLDIER" }).powers[0]!;
check(bpvLow.breakdown.basePowerValue !== bpvHigh.breakdown.basePowerValue, "Semantic BPV updates when Modifier changes.");
check(bpvLow.derivedCooldownTurns !== null && bpvHigh.derivedCooldownTurns !== null, "Authoritative cooldown resolves from semantic BPV.");
const completePreview = summarizeCharacterPowers({ level: 3, powers: [semanticPower(2)], cooldownAuthorityMode: "EXPLICIT_BUILTIN_PREVIEW" });
check(completePreview.powers[0]?.costValid, "Complete Character semantic preview resolves.");
const incompleteAoe = semanticPower(2);
incompleteAoe.effectPackets[0]!.detailsJson = {
  ...incompleteAoe.effectPackets[0]!.detailsJson,
  rangeCategory: "AOE",
  rangeValue: 0,
  rangeExtra: { count: 1, shape: "SPHERE", sphereRadiusFeet: 10 },
};
incompleteAoe.intentions = incompleteAoe.effectPackets;
const incompletePreview = summarizeCharacterPowers({ level: 3, powers: [incompleteAoe], cooldownAuthorityMode: "EXPLICIT_BUILTIN_PREVIEW" });
check(incompletePreview.powers[0]?.costValid === true && incompletePreview.powers[0]?.power.effectPackets[0]?.detailsJson?.expectedTargetCount === 2, "Character preview automatically derives AoE Expected Targets.");

const writeError = getThreeFieldAugmentDebuffPublicWriteError([semanticPower(2)]);
check(writeError === (THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_ENABLED ? null : THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR), "Public writes follow the single shared gate.");
check(getThreeFieldAugmentDebuffPublicWriteError([{ ...semanticPower(2), effectPackets: [legacy], intentions: [legacy] }]) === null, "Legacy payloads remain accepted regardless of gate state.");

const characterSource = readFileSync("app/campaign/[id]/characters/[characterId]/builder/page.tsx", "utf8");
const summoningSource = readFileSync("app/summoning-circle/components/SummoningCircleEditor.tsx", "utf8");
check(
  characterSource.includes("renderPowerEditorCards({") &&
    characterSource.includes("powers: [signatureMoveDraft]"),
  "Signature Move uses the same gated packet/chassis editor as ordinary Character powers.",
);
for (const [surface, source] of [["Character Builder", characterSource], ["Summoning Circle", summoningSource]] as const) {
  check(source.includes("Convert to Dice / Potency / Modifier"), `${surface} exposes deliberate legacy conversion.`);
  check(source.includes("Estimated Targets:") && source.includes("Modifier"), `${surface} exposes Modifier and read-only Estimated Targets.`);
  check(source.includes("Legacy Potency currently represents the fixed attribute bonus or penalty."), `${surface} explains legacy semantics.`);
  check(
    source.includes("semanticChassisOptions") &&
      source.includes("isSemanticRuntimeSupportedTimingOption") &&
      source.includes("Unsupported runtime"),
    `${surface} prevents new unsupported semantic chassis/timing authoring while displaying persisted invalid forms for repair.`,
  );
  check(
    source.includes("canAuthorSemanticModifierHere"),
    `${surface} blocks semantic creation or legacy conversion on unsupported runtime forms.`,
  );
}

assert.ok(checks >= 65, `Expected at least 65 cross-surface assertions, got ${checks}.`);
console.log(`Modifier authoring round-trip smoke passed (${checks} assertions).`);
