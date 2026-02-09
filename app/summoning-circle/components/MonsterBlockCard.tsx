"use client";

import { useMemo } from "react";
import type {
  DiceSize,
  MonsterAttack,
  MonsterNaturalAttackConfig,
  MonsterUpsertInput,
} from "@/lib/summoning/types";
import {
  getArmorSkillDiceCountFromAttributes,
  getWeaponSkillDiceCountFromAttributes,
} from "@/lib/summoning/attributes";
import {
  getHighestItemModifiers,
  getProtectionTotalsFromItems,
  type MonsterModifierField,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import {
  effectiveCooldownTurns,
  formatModifierWithEffective,
  renderAttackActionLines,
  renderPowerDurationText,
  renderPowerStackCleanupText,
  renderPowerSuccessClause,
} from "@/lib/summoning/render";

export type WeaponProjection = {
  id: string;
  name: string;
  type: "WEAPON" | "SHIELD" | "ARMOR" | "ITEM" | "CONSUMABLE";
  size: "SMALL" | "ONE_HANDED" | "TWO_HANDED" | null;
  armorLocation: "HEAD" | "SHOULDERS" | "TORSO" | "LEGS" | "FEET" | null;
  ppv: number | null;
  mpv: number | null;
  globalAttributeModifiers?: Array<{ attribute?: string; amount?: number }>;
  melee: MonsterNaturalAttackConfig["melee"];
  ranged: MonsterNaturalAttackConfig["ranged"];
  aoe: MonsterNaturalAttackConfig["aoe"];
};

type MonsterBlockCardProps = {
  monster: MonsterUpsertInput;
  weaponById?: Record<string, WeaponProjection>;
  className?: string;
};

const ATTR_ROWS = [
  ["Attack", "attackDie", "attackResistDie", "attackModifier"],
  ["Defence", "defenceDie", "defenceResistDie", "defenceModifier"],
  ["Fortitude", "fortitudeDie", "fortitudeResistDie", "fortitudeModifier"],
  ["Intellect", "intellectDie", "intellectResistDie", "intellectModifier"],
  ["Support", "supportDie", "supportResistDie", "supportModifier"],
  ["Bravery", "braveryDie", "braveryResistDie", "braveryModifier"],
] as const;

function dieLabel(value: DiceSize | null | undefined): string {
  if (!value) return "-";
  return `d${value.replace("D", "")}`;
}

function parseHeaderLine(line: string): { header: string; text: string } {
  const parts = String(line).split("||");
  if (parts.length < 2) return { header: "", text: line };
  return { header: parts[0].trim(), text: parts.slice(1).join("||").trim() };
}

function getRenderableNaturalAttacks(monster: MonsterUpsertInput): MonsterAttack[] {
  if (Array.isArray(monster.attacks) && monster.attacks.length > 0) {
    return [...monster.attacks].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  if (!monster.naturalAttack) return [];
  return [
    {
      sortOrder: 0,
      attackMode: "NATURAL",
      attackName: monster.naturalAttack.attackName ?? "Natural Weapon",
      attackConfig: monster.naturalAttack.attackConfig,
    },
  ];
}

function hasItemSlots(monster: MonsterUpsertInput): boolean {
  return Boolean(
    monster.mainHandItemId ||
      monster.offHandItemId ||
      monster.smallItemId ||
      monster.headItemId ||
      monster.shoulderItemId ||
      monster.torsoItemId ||
      monster.legsItemId ||
      monster.feetItemId,
  );
}

function getEquippedItems(
  monster: MonsterUpsertInput,
  weaponById?: Record<string, WeaponProjection>,
): Array<SummoningEquipmentItem | null> {
  if (!weaponById) return [];
  const slotIds = [
    monster.mainHandItemId ?? null,
    monster.offHandItemId ?? null,
    monster.smallItemId ?? null,
    monster.headItemId ?? null,
    monster.shoulderItemId ?? null,
    monster.torsoItemId ?? null,
    monster.legsItemId ?? null,
    monster.feetItemId ?? null,
  ];
  return slotIds.map((id) => (id ? (weaponById[id] ?? null) : null));
}

function buildEquipmentWeaponAttacks(
  monster: MonsterUpsertInput,
  weaponSkillValue: number,
  weaponById?: Record<string, WeaponProjection>,
): Array<{ label: string; lines: string[] }> {
  if (!weaponById) return [];

  const slots: Array<{ slotLabel: string; id: string | null | undefined }> = [
    { slotLabel: "Main Hand", id: monster.mainHandItemId },
    { slotLabel: "Off Hand", id: monster.offHandItemId },
    { slotLabel: "Small Slot", id: monster.smallItemId },
  ];

  const output: Array<{ label: string; lines: string[] }> = [];

  for (const slot of slots) {
    if (!slot.id) continue;
    const item = weaponById[slot.id];
    if (!item) continue;
    if (item.type !== "WEAPON" && item.type !== "SHIELD") continue;

    const lines = renderAttackActionLines(
      {
        melee: item.melee,
        ranged: item.ranged,
        aoe: item.aoe,
      } as MonsterNaturalAttackConfig,
      weaponSkillValue,
      { applyWeaponSkillOverride: true },
    );

    if (lines.length === 0) continue;

    output.push({
      label: `${slot.slotLabel}: ${item.name}`,
      lines,
    });
  }

  return output;
}

export function MonsterBlockCard({ monster, weaponById, className }: MonsterBlockCardProps) {
  const computedWeaponSkillValue = useMemo(
    () => getWeaponSkillDiceCountFromAttributes(monster.attackDie, monster.braveryDie),
    [monster.attackDie, monster.braveryDie],
  );
  const computedArmorSkillValue = useMemo(
    () => getArmorSkillDiceCountFromAttributes(monster.defenceDie, monster.fortitudeDie),
    [monster.defenceDie, monster.fortitudeDie],
  );
  const itemDerived = useMemo(() => {
    const equippedItems = getEquippedItems(monster, weaponById);
    const itemModifiers = getHighestItemModifiers(equippedItems);
    const itemProtection = getProtectionTotalsFromItems(equippedItems);
    return { itemModifiers, itemProtection };
  }, [monster, weaponById]);

  const renderedAttacks = useMemo(() => {
    const slotBasedAttacks = buildEquipmentWeaponAttacks(
      monster,
      computedWeaponSkillValue,
      weaponById,
    );
    const naturalMapped = getRenderableNaturalAttacks(monster).map((attack) => ({
      label: `Natural Weapon: ${attack.attackName ?? "Natural Weapon"}`,
      lines: renderAttackActionLines(
        (attack.attackConfig ?? {}) as MonsterNaturalAttackConfig,
        computedWeaponSkillValue,
        { applyWeaponSkillOverride: true },
      ),
    }));
    return [...slotBasedAttacks, ...naturalMapped];
  }, [computedWeaponSkillValue, monster, weaponById]);

  const useItemDerivedValues = hasItemSlots(monster);
  const protectionValues = useItemDerivedValues
    ? itemDerived.itemProtection
    : {
        physicalProtection: monster.physicalProtection,
        mentalProtection: monster.mentalProtection,
      };

  const MOD_KEY_TO_ITEM_FIELD: Record<(typeof ATTR_ROWS)[number][3], MonsterModifierField> = {
    attackModifier: "attackModifier",
    defenceModifier: "defenceModifier",
    fortitudeModifier: "fortitudeModifier",
    intellectModifier: "intellectModifier",
    supportModifier: "supportModifier",
    braveryModifier: "braveryModifier",
  };

  return (
    <div className={["sc-monster-block rounded border border-zinc-800 bg-zinc-950 p-4 space-y-3 text-sm", className ?? ""].join(" ").trim()}>
      <div>
        <p className="text-lg font-semibold">{monster.name}</p>
        <p className="text-zinc-300">
          Level {monster.level} {monster.tier}
          {monster.legendary ? " - Legendary" : ""}
        </p>
        {monster.tags.length > 0 && <p className="text-xs text-zinc-500">{monster.tags.join(" ")}</p>}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Survivability & Defence</p>
        <p>PR {monster.physicalResilienceCurrent}/{monster.physicalResilienceMax}</p>
        <p>MP {monster.mentalPerseveranceCurrent}/{monster.mentalPerseveranceMax}</p>
        <p>Physical Protection {protectionValues.physicalProtection}</p>
        <p>Mental Protection {protectionValues.mentalProtection}</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Attributes, Resists & Modifiers</p>
        {ATTR_ROWS.map(([label, dieKey, resistKey, modKey]) => {
          const itemModifier = itemDerived.itemModifiers[MOD_KEY_TO_ITEM_FIELD[modKey]];
          const modifierValue = useItemDerivedValues ? itemModifier : Number(monster[modKey]);
          return (
            <p key={label}>
              {label}: {dieLabel(monster[dieKey])}
              {Number(monster[resistKey]) > 0 ? ` | Resist ${Number(monster[resistKey])} dice` : ""}
              {" | Mod "}
              {formatModifierWithEffective(modifierValue)}
            </p>
          );
        })}
        <p>
          Weapon Skill: {computedWeaponSkillValue} dice | Mod{" "}
          {formatModifierWithEffective(
            useItemDerivedValues ? itemDerived.itemModifiers.weaponSkillModifier : monster.weaponSkillModifier,
          )}
        </p>
        <p>
          Armor Skill: {computedArmorSkillValue} dice | Mod{" "}
          {formatModifierWithEffective(
            useItemDerivedValues ? itemDerived.itemModifiers.armorSkillModifier : monster.armorSkillModifier,
          )}
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Traits</p>
        {monster.traits.length === 0 && <p className="text-zinc-500">None</p>}
        {monster.traits.map((trait, idx) => (
          <p key={idx}>- {trait.text}</p>
        ))}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Attacks</p>
        {renderedAttacks.length === 0 && <p className="text-zinc-500">No attack lines.</p>}
        {renderedAttacks.map((attack, attackIndex) => (
          <div key={attackIndex} className="space-y-1">
            <p className="font-medium">Attack {attackIndex + 1}</p>
            <p>{attack.label}</p>
            {attack.lines.map((line, idx) => {
              const parsed = parseHeaderLine(line);
              return (
                <div key={idx} className="grid grid-cols-[82px_1fr] gap-2">
                  <p className="font-medium">{parsed.header}</p>
                  <p>{parsed.text}</p>
                </div>
              );
            })}
            {attack.lines.length === 0 && (
              <p className="text-zinc-500">No attack lines.</p>
            )}
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Powers</p>
        {monster.powers.length === 0 && <p className="text-zinc-500">None</p>}
        {monster.powers.map((power, idx) => (
          <div key={idx} className="rounded border border-zinc-800 p-2 space-y-1">
            <p className="font-medium">{power.name}</p>
            {power.description && <p className="text-zinc-300">{power.description}</p>}
            <p>Dice Count: {power.diceCount} | Potency: {power.potency}</p>
            <p>Cooldown: {effectiveCooldownTurns(power)}</p>
            <p>Response: {power.responseRequired ? "Yes" : "No"}</p>
            {power.intentions.length > 1 && (
              <p>
                Multi-Intention: roll once vs primary ({power.intentions[0].type}); net successes apply to all.
              </p>
            )}
            <p>{renderPowerSuccessClause(power)}</p>
            {renderPowerDurationText(power) && <p>{renderPowerDurationText(power)}</p>}
            {renderPowerStackCleanupText(power) && <p>{renderPowerStackCleanupText(power)}</p>}
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Custom Notes</p>
        <p className="whitespace-pre-wrap">{monster.customNotes?.trim() || "None"}</p>
      </div>
    </div>
  );
}
