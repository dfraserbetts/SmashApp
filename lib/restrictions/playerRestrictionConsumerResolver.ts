import type { CharacterBuilderData } from "@/lib/characterBuilder/core";
import type { CharacterPower } from "@/lib/characterBuilder/powers";
import type { RoleplayAbility } from "@/lib/characterBuilder/roleplayAbilities";
import type {
  AbilityRestrictionDefinitionV1,
  RestrictionIssue,
} from "@/lib/restrictions";
import type { PlayerRestrictionConsumer } from "@/lib/restrictions/governance";
import {
  normalizePlayerRestrictionSnapshot,
  type PlayerRestrictionSnapshot,
} from "@/lib/restrictions/governancePersistence";

export type PlayerRestrictionConsumerLocator = Readonly<{
  campaignId: string;
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
}>;

export type PlayerRestrictionConsumerPresence =
  | "PRESENT"
  | "ABSENT"
  | "DUPLICATE";

export type PlayerRestrictionSemanticStatus =
  | "NONE"
  | "VALID"
  | "UNSUPPORTED"
  | "MALFORMED"
  | "UNRESOLVED_LEGACY_REVIEW";

export type PlayerRestrictionConsumerResolution = Readonly<{
  ok: boolean;
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  consumerName: string | null;
  consumerIndex: number | null;
  consumerPresence: PlayerRestrictionConsumerPresence;
  semanticStatus: PlayerRestrictionSemanticStatus;
  semanticRestriction: AbilityRestrictionDefinitionV1 | null;
  normalizedSnapshot: PlayerRestrictionSnapshot | null;
  currentFingerprint: string | null;
  issues: readonly RestrictionIssue[];
}>;

type LocatedConsumer = Readonly<{
  name: string;
  index: number | null;
  restriction: unknown;
  roleplayAbility: RoleplayAbility | null;
}>;

function issue(
  code: string,
  message: string,
  path: string,
  severity: RestrictionIssue["severity"] = "error",
): RestrictionIssue {
  return Object.freeze({ code, message, path, severity });
}

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function powerName(power: CharacterPower, index: number): string {
  return power.name?.trim() || `Power ${index + 1}`;
}

function roleplayName(ability: RoleplayAbility, index: number): string {
  return ability.name?.trim() || `Roleplay Ability ${index + 1}`;
}

function matchesForType(
  builderData: CharacterBuilderData,
  consumerType: PlayerRestrictionConsumer,
  consumerId: string,
): LocatedConsumer[] {
  if (consumerType === "PLAYER_POWER") {
    return builderData.powers.flatMap((power, index) =>
      normalizeId(power.id) === consumerId
        ? [{
            name: powerName(power, index),
            index,
            restriction: power.restriction,
            roleplayAbility: null,
          }]
        : []);
  }
  if (consumerType === "SIGNATURE_MOVE") {
    const power = builderData.signatureMove;
    return power && normalizeId(power.id) === consumerId
      ? [{
          name: power.name?.trim() || "Signature Move",
          index: null,
          restriction: power.restriction,
          roleplayAbility: null,
        }]
      : [];
  }
  return builderData.roleplayAbilities.flatMap((ability, index) =>
    normalizeId(ability.id) === consumerId
      ? [{
          name: roleplayName(ability, index),
          index,
          restriction: ability.restriction,
          roleplayAbility: ability,
        }]
      : []);
}

function typesContainingId(
  builderData: CharacterBuilderData,
  consumerId: string,
): PlayerRestrictionConsumer[] {
  const types: PlayerRestrictionConsumer[] = [];
  if (builderData.powers.some((power) => normalizeId(power.id) === consumerId)) {
    types.push("PLAYER_POWER");
  }
  if (normalizeId(builderData.signatureMove?.id) === consumerId) {
    types.push("SIGNATURE_MOVE");
  }
  if (builderData.roleplayAbilities.some((ability) => normalizeId(ability.id) === consumerId)) {
    types.push("ROLEPLAY_ABILITY");
  }
  return types;
}

function hasUnresolvedLegacyRestriction(ability: RoleplayAbility | null): boolean {
  return Boolean(ability && (
    ability.restrictionType !== "NONE" ||
    ability.restrictionBand !== "NONE_COSMETIC" ||
    ability.restrictionTag.trim() !== "" ||
    ability.restrictionText.trim() !== ""
  ));
}

function resolution(
  input: Omit<PlayerRestrictionConsumerResolution, "ok" | "issues">,
  issues: readonly RestrictionIssue[],
): PlayerRestrictionConsumerResolution {
  const frozenIssues = Object.freeze(issues.map((entry) => Object.freeze({ ...entry })));
  return Object.freeze({
    ...input,
    ok: !frozenIssues.some((entry) => entry.severity === "error"),
    issues: frozenIssues,
  });
}

export function resolvePlayerRestrictionConsumer(
  builderData: CharacterBuilderData,
  locator: PlayerRestrictionConsumerLocator,
): PlayerRestrictionConsumerResolution {
  const consumerId = normalizeId(locator.consumerId);
  const base = {
    consumerType: locator.consumerType,
    consumerId,
    consumerName: null,
    consumerIndex: null,
    consumerPresence: "ABSENT" as const,
    semanticStatus: "NONE" as const,
    semanticRestriction: null,
    normalizedSnapshot: null,
    currentFingerprint: null,
  };

  if (!consumerId) {
    return resolution(base, [issue(
      "BLANK_PLAYER_RESTRICTION_CONSUMER_ID",
      "A nonblank stable consumer ID is required.",
      "consumerId",
    )]);
  }

  const matches = matchesForType(builderData, locator.consumerType, consumerId);
  if (matches.length > 1) {
    return resolution({
      ...base,
      consumerPresence: "DUPLICATE",
    }, [issue(
      "DUPLICATE_PLAYER_RESTRICTION_CONSUMER_ID",
      "The requested consumer type contains more than one consumer with this stable ID.",
      "consumerId",
    )]);
  }
  if (matches.length === 0) {
    const otherTypes = typesContainingId(builderData, consumerId)
      .filter((type) => type !== locator.consumerType);
    return resolution(base, [issue(
      otherTypes.length > 0
        ? "PLAYER_RESTRICTION_CONSUMER_TYPE_MISMATCH"
        : "PLAYER_RESTRICTION_CONSUMER_ABSENT",
      otherTypes.length > 0
        ? `The stable consumer ID belongs to ${otherTypes.join(", ")}, not ${locator.consumerType}.`
        : "The requested live consumer no longer exists.",
      "consumerId",
    )]);
  }

  const consumer = matches[0];
  const present = {
    ...base,
    consumerName: consumer.name,
    consumerIndex: consumer.index,
    consumerPresence: "PRESENT" as const,
  };
  if (hasUnresolvedLegacyRestriction(consumer.roleplayAbility)) {
    return resolution({
      ...present,
      semanticStatus: "UNRESOLVED_LEGACY_REVIEW",
    }, [issue(
      "UNRESOLVED_LEGACY_RESTRICTION_REVIEW",
      "This Roleplay Ability still contains ambiguous legacy Restriction data that requires deliberate review.",
      "restriction",
    )]);
  }
  if (consumer.restriction == null) {
    return resolution(present, [issue(
      "MISSING_SEMANTIC_RESTRICTION",
      "The live consumer has no semantic Restriction.",
      "restriction",
      "warning",
    )]);
  }

  const snapshot = normalizePlayerRestrictionSnapshot(
    consumer.restriction,
    locator.campaignId,
  );
  if (!snapshot.value) {
    return resolution({
      ...present,
      semanticStatus: "MALFORMED",
    }, snapshot.issues.length > 0
      ? snapshot.issues
      : [issue(
          "MALFORMED_SEMANTIC_RESTRICTION",
          "The live semantic Restriction is malformed.",
          "restriction",
        )]);
  }

  return resolution({
    ...present,
    semanticStatus: snapshot.value.status,
    semanticRestriction: snapshot.value.definition,
    normalizedSnapshot: snapshot.value,
    currentFingerprint: snapshot.value.fingerprint,
  }, snapshot.issues);
}
