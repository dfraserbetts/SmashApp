// lib/descriptors/renderers/forgeRenderer.ts
import type { AttackRangeSpec, DescriptorLine, DescriptorResult, DescriptorSection } from "../types";

export type ForgeRenderOptions = {
  weaponSkillDiceOverride?: number;
};

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function joinMods(mods: Array<{ attributeName: string; magnitude: number }>): string {
  // “+1 to Attack and +2 to Defence”
  return mods
    .map((m) => `${formatSigned(m.magnitude)} to ${m.attributeName}`)
    .reduce<string[]>((acc, part, idx, arr) => {
      if (arr.length === 1) return [part];
      if (idx === 0) return [part];
      if (idx === arr.length - 1) return [`${acc.join("")} and ${part}`];
      return [`${acc.join("")}, ${part}`];
    }, [])
    .join("");
}

function joinWithCommaOr(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}, or ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, or ${parts[parts.length - 1]}`;
}

function plural(n: number, singular: string, pluralWord?: string): string {
  return n === 1 ? singular : (pluralWord ?? `${singular}s`);
}

function itemWording(itemType: string): { verb: string; noun: string } {
  // Your spec:
  // - WEAPONS/SHIELDS: wielding this weapon/shield
  // - ARMOR/ITEMS: wearing this armor/item
  // We treat CONSUMABLE like ITEM here for now.
  if (itemType === "WEAPON") return { verb: "wielding", noun: "weapon" };
  if (itemType === "SHIELD") return { verb: "wielding", noun: "shield" };
  if (itemType === "ARMOR") return { verb: "wearing", noun: "armor" };
  return { verb: "wearing", noun: "item" };
}

const getRangeHeader = (ranges: AttackRangeSpec[]): string => {
  if (ranges.some((r) => r.kind === 'MELEE')) return 'Melee:';
  if (ranges.some((r) => r.kind === 'RANGED')) return 'Ranged:';
  if (ranges.some((r) => r.kind === 'AOE')) return 'AoE:';
  return '';
};

export function renderForgeLine(
  line: DescriptorLine,
  options?: ForgeRenderOptions,
): string {
  switch (line.kind) {
    case "TEXT": {
      return String((line as any).text ?? "");
    }
    case "GLOBAL_ATTRIBUTE_MODIFIERS": {
      const { verb, noun } = itemWording(line.itemType);
      const modsText = joinMods(line.mods);
      return `Whilst ${verb} this ${noun}, the wielder gains ${modsText}.`;
    }

    case "WEAPON_ATTRIBUTE": {
      // Current system: engine produces fully-rendered text lines.
      const asAny = line as any;

      if (typeof asAny.text === "string" && asAny.text.trim().length > 0) {
        return asAny.text;
      }

      // Backwards compatibility: older/structured shape (if it still appears anywhere)
      const name = typeof asAny.name === "string" ? asAny.name : "";
      const template =
        typeof asAny.descriptorTemplate === "string" ? asAny.descriptorTemplate : "";

      if (!name || !template) return "";

      const tokenMap: Record<string, string> = {
        MeleePhysicalStrength: String(asAny.meleePhysicalStrength ?? 0),
        MeleeMentalStrength: String(asAny.meleeMentalStrength ?? 0),
        RangedPhysicalStrength: String(asAny.rangedPhysicalStrength ?? 0),
        RangedMentalStrength: String(asAny.rangedMentalStrength ?? 0),
        AoEPhysicalStrength: String(asAny.aoePhysicalStrength ?? 0),
        AoEMentalStrength: String(asAny.aoeMentalStrength ?? 0),
        AttributeValue: String(asAny.attributeValue ?? 0),
      };

      const rendered = template.replace(
        /\[([A-Za-z0-9_]+)\]/g,
        (_match: string, token: string) => {
          return tokenMap[token] ?? `[${token}]`;
        },
      );

      return `${name}: ${rendered}`;
    }

    case "ATTACK_ACTION": {
      // Skill text is generic in Forge; resolved later when equipped
      const skillText =
        typeof options?.weaponSkillDiceOverride === "number" &&
        Number.isFinite(options.weaponSkillDiceOverride) &&
        options.weaponSkillDiceOverride > 0
          ? `${Math.trunc(options.weaponSkillDiceOverride)} dice`
          : "weapon skill dice";

       const parts = (line.ranges ?? []).map((r) => {
        if (r.kind === "MELEE") {
          const t = r.targets;
          return `${t} adjacent ${plural(t, "target")}`;
        }

        if (r.kind === "RANGED") {
          const t = r.targets;
          return `${t} ${plural(t, "target")} within ${r.distance}ft`;
        }

        // AOE (basic phrasing with "up to", geometry slot, and origin rules)
        const count = Number(r.count ?? 1);
        const countText =
          count > 1
            ? `up to ${count} ×`
            : `${count} ×`;

        const shapeUpper = (r.shape ?? "SPHERE").toString().toUpperCase();
        const shapePlural =
          shapeUpper === "LINE" ? plural(count, "Line", "Lines") :
          shapeUpper === "CONE" ? plural(count, "Cone", "Cones") :
          plural(count, "Sphere", "Spheres");

        // Geometry is still minimal in the engine right now; include what we can if present.
        // Common keys we might emit later: radius, length, width.
        const g: any = (r as any).geometry ?? {};

        const lengthFt = typeof g.length === "number" && g.length > 0 ? g.length : null;
        const widthFt = typeof g.width === "number" && g.width > 0 ? g.width : null;

        const geomText =
          typeof g.radius === "number" && g.radius > 0
            ? `${g.radius}ft`
            : shapeUpper === "LINE" && lengthFt && widthFt
              ? `${lengthFt}ft × ${widthFt}ft`
              : lengthFt
                ? `${lengthFt}ft`
                : "";

        const geomPart = geomText ? `${geomText} ` : "";

        // centerRange can be 0: special self-centered/emanating phrasing
        if (Number(r.centerRange ?? 0) === 0) {
          const originText =
            shapeUpper === "SPHERE" ? "centered on yourself" : "emanating from yourself";
          return `${countText} ${geomPart}${shapePlural} ${originText}`;
        }

        return `${countText} ${geomPart}${shapePlural} within ${r.centerRange}ft`;
      });

      const joined = joinWithCommaOr(parts);
      const rangeText = joined ? `Choose ${joined}` : "Choose a target";

      const itemNoun = line.itemType === "SHIELD" ? "shield" : "weapon";

      // Unified mixed-mode wounds: each entry decides its own mode + amount.
      const entries = Array.isArray((line as any).damage?.entries)
        ? ((line as any).damage.entries as Array<{ amount: number; mode: "PHYSICAL" | "MENTAL"; damageType: string }>)
        : [];

      const dmgClauses =
        entries.length > 0
          ? entries.map((e) => {
              const amt = Number(e.amount ?? 0);
              const woundWord = amt === 1 ? "wound" : "wounds";
              const modeWord = e.mode === "MENTAL" ? "mental" : "physical";
              const dt = String(e.damageType ?? "damage");
              return `${amt} ${modeWord} ${dt} ${woundWord}`;
            })
          : [`0 damage wounds`];

      const dmgText =
        dmgClauses.length === 1
          ? dmgClauses[0]
          : `${dmgClauses.slice(0, -1).join(" and ")} and ${dmgClauses[dmgClauses.length - 1]}`;

      const header = getRangeHeader(line.ranges);

      const baseText = `${rangeText} and roll ${skillText}. This ${itemNoun} inflicts ${dmgText} per success.`;

      const gs = Array.isArray((line as any).gsAttackEffects)
        ? ((line as any).gsAttackEffects as string[])
        : [];

      const gsNames = Array.from(
        new Set(gs.map((x) => String(x ?? "").trim()).filter(Boolean)),
      );

      const gsClause =
        gsNames.length > 0
          ? ` Each greater success inflicts ${joinWithCommaOr(
              gsNames.map((n) => `1 stack of ${n}`),
            )}.`
          : "";

      const text = `${baseText}${gsClause}`;
      // We keep renderForgeLine() returning a string.
      // UI can split on "||" to render a 2-column layout: [Header] [Text]
      return `${header}||${text}`;
    }
    default:
      return "";
  }
}

export function renderForgeSection(
  section: DescriptorSection,
  options?: ForgeRenderOptions,
): { title: string; lines: string[] } {
  return {
    title: section.title,
    lines: section.lines.map((line) => renderForgeLine(line, options)).filter(Boolean),
  };
}

export function renderForgeResult(
  result: DescriptorResult,
  options?: ForgeRenderOptions,
): Array<{ title: string; lines: string[] }> {
  return result.sections
    .map((section) => renderForgeSection(section, options))
    .filter((s) => s.lines.length > 0);
}
