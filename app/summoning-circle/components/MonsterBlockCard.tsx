"use client";

import { useMemo } from "react";
import type { DiceSize, MonsterNaturalAttackConfig, MonsterUpsertInput } from "@/lib/summoning/types";
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
  melee: MonsterNaturalAttackConfig["melee"];
  ranged: MonsterNaturalAttackConfig["ranged"];
  aoe: MonsterNaturalAttackConfig["aoe"];
};

type MonsterBlockCardProps = {
  monster: MonsterUpsertInput;
  selectedWeapon?: WeaponProjection | null;
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

export function MonsterBlockCard({ monster, selectedWeapon, className }: MonsterBlockCardProps) {
  const attackLines = useMemo(() => {
    if (monster.attackMode === "EQUIPPED_WEAPON") {
      if (!selectedWeapon) return [];
      return renderAttackActionLines(
        {
          melee: selectedWeapon.melee,
          ranged: selectedWeapon.ranged,
          aoe: selectedWeapon.aoe,
        } as MonsterNaturalAttackConfig,
        monster.weaponSkillValue,
        { applyWeaponSkillOverride: true },
      );
    }

    if (!monster.naturalAttack) return [];
    return renderAttackActionLines(monster.naturalAttack.attackConfig, monster.weaponSkillValue);
  }, [monster, selectedWeapon]);

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
        <p>Physical Protection {monster.physicalProtection}</p>
        <p>Mental Protection {monster.mentalProtection}</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Attributes, Resists & Modifiers</p>
        {ATTR_ROWS.map(([label, dieKey, resistKey, modKey]) => (
          <p key={label}>
            {label}: {dieLabel(monster[dieKey])}
            {Number(monster[resistKey]) > 0 ? ` | Resist ${Number(monster[resistKey])} dice` : ""}
            {" | Mod "}
            {formatModifierWithEffective(Number(monster[modKey]))}
          </p>
        ))}
        <p>
          Weapon Skill: {monster.weaponSkillValue} dice | Mod{" "}
          {formatModifierWithEffective(monster.weaponSkillModifier)}
        </p>
        <p>
          Armor Skill: {monster.armorSkillValue} dice | Mod{" "}
          {formatModifierWithEffective(monster.armorSkillModifier)}
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
        {monster.attackMode === "EQUIPPED_WEAPON" && (
          <p>Equipped Weapon: {selectedWeapon?.name ?? "(Referenced item missing)"}</p>
        )}
        {monster.attackMode === "NATURAL_WEAPON" && (
          <p>Natural Weapon: {monster.naturalAttack?.attackName ?? "Natural Weapon"}</p>
        )}
        {attackLines.map((line, idx) => {
          const parsed = parseHeaderLine(line);
          return (
            <div key={idx} className="grid grid-cols-[82px_1fr] gap-2">
              <p className="font-medium">{parsed.header}</p>
              <p>{parsed.text}</p>
            </div>
          );
        })}
        {attackLines.length === 0 && <p className="text-zinc-500">No attack lines.</p>}
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
