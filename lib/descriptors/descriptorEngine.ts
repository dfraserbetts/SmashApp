// lib/descriptors/descriptorEngine.ts
import type {
  AttackActionLine,
  DescriptorInput,
  DescriptorResult,
  DescriptorSection,
  WeaponAttributeLine,
} from "./types";

function normalizeMods(
  mods: DescriptorInput["globalAttributeModifiers"],
): Array<{ attributeName: string; magnitude: number }> {
  if (!Array.isArray(mods) || mods.length === 0) return [];

  // Dedup by attribute name; keep last entry (Forge UI already replaces, but we harden here)
  const byName = new Map<string, number>();

  for (const m of mods) {
    const name = (m?.attribute ?? "").trim();
    const amt = Number(m?.amount);

    if (!name) continue;
    if (!Number.isFinite(amt)) continue;

    byName.set(name, amt);
  }

  // Deterministic order: alphabetical by attribute name
  return Array.from(byName.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([attributeName, magnitude]) => ({
      attributeName,
      magnitude,
    }));
}

function parseAttributeName(name: string): { baseName: string; value: number | null } {
  const raw = String(name ?? "").trim();
  if (!raw) return { baseName: "", value: null };

  // If it ends with a number, treat it as the attribute value: "Reload 5" -> ("Reload", 5)
  const m = raw.match(/^(.*?)(?:\s+(\d+))$/);
  if (!m) return { baseName: raw, value: null };

  const baseName = String(m[1] ?? "").trim();
  const value = Number(m[2]);
  if (!baseName) return { baseName: raw, value: Number.isFinite(value) ? value : null };

  return { baseName, value: Number.isFinite(value) ? value : null };
}

function safeNum(n: any): string {
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : "?";
}

function applyWeaponAttributeTokens(
  template: string,
  ctx: {
    attributeValue: number | null;

    // Parameterized attribute context
    strengthSource?: "MELEE" | "RANGED" | "AOE" | null;
    rangeSource?: "MELEE" | "RANGED" | "AOE" | null;

    // Weapon context (selected on this weapon; aggregated across ranges)
    damageTypes?: string;
    gsAttackEffects?: string;

    // Range context
    meleeTargets?: number;
    rangedTargets?: number;
    rangedDistanceFeet?: number;

    aoeCount?: number;
    aoeCenterRangeFeet?: number;
    aoeShape?: string;
    aoeSphereRadiusFeet?: number;
    aoeConeLengthFeet?: number;
    aoeLineWidthFeet?: number;
    aoeLineLengthFeet?: number;

    // Strength tokens
    meleePhysicalStrength?: number;
    meleeMentalStrength?: number;
    rangedPhysicalStrength?: number;
    rangedMentalStrength?: number;
    aoePhysicalStrength?: number;
    aoeMentalStrength?: number;
  },
): { text: string; warnings: string[] } {
  const warnings: string[] = [];

  const replacements: Record<string, string> = {
    "[AttributeValue]": ctx.attributeValue === null ? "?" : String(ctx.attributeValue),

    // Weapon context (selected on this weapon)
    "[GS_AttackEffects]": String(ctx.gsAttackEffects ?? "?"),
    "[DamageTypes]": String(ctx.damageTypes ?? "?"),

    // Range context
    "[MeleeTargets]": safeNum(ctx.meleeTargets),
    "[RangedTargets]": safeNum(ctx.rangedTargets),
    "[RangedDistanceFeet]": safeNum(ctx.rangedDistanceFeet),

    "[AoeCount]": safeNum(ctx.aoeCount),
    "[AoeCenterRangeFeet]": safeNum(ctx.aoeCenterRangeFeet),
    "[AoeShape]": String(ctx.aoeShape ?? "?"),
    "[AoeSphereRadiusFeet]": safeNum(ctx.aoeSphereRadiusFeet),
    "[AoeConeLengthFeet]": safeNum(ctx.aoeConeLengthFeet),
    "[AoeLineWidthFeet]": safeNum(ctx.aoeLineWidthFeet),
    "[AoeLineLengthFeet]": safeNum(ctx.aoeLineLengthFeet),

    // Strength tokens
    "[MeleePhysicalStrength]": safeNum(ctx.meleePhysicalStrength),
    "[MeleeMentalStrength]": safeNum(ctx.meleeMentalStrength),

    "[RangedPhysicalStrength]": safeNum(ctx.rangedPhysicalStrength),
    "[RangedMentalStrength]": safeNum(ctx.rangedMentalStrength),

    "[AoePhysicalStrength]": safeNum(ctx.aoePhysicalStrength),
    "[AoeMentalStrength]": safeNum(ctx.aoeMentalStrength),

    // Parameterised strength selection (chosen per attribute)
    "[ChosenPhysicalStrength]":
      ctx.strengthSource === "MELEE"
        ? safeNum(ctx.meleePhysicalStrength)
        : ctx.strengthSource === "RANGED"
          ? safeNum(ctx.rangedPhysicalStrength)
          : ctx.strengthSource === "AOE"
            ? safeNum(ctx.aoePhysicalStrength)
            : "?",

    "[ChosenMentalStrength]":
      ctx.strengthSource === "MELEE"
        ? safeNum(ctx.meleeMentalStrength)
        : ctx.strengthSource === "RANGED"
          ? safeNum(ctx.rangedMentalStrength)
          : ctx.strengthSource === "AOE"
            ? safeNum(ctx.aoeMentalStrength)
            : "?",

    "[ChosenRange]":
      ctx.rangeSource === "MELEE"
        ? "Melee"
        : ctx.rangeSource === "RANGED"
          ? "Ranged"
          : ctx.rangeSource === "AOE"
            ? "AoE"
            : "?",
  };

  if (template.includes("[AttributeValue]") && ctx.attributeValue === null) {
    warnings.push("Weapon Attribute template uses [AttributeValue] but no value was found in the attribute name.");
  }

  let out = template;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }

  // If any bracket tokens remain, warn (authoring mistake)
  const leftover = out.match(/\[[^\]]+\]/g) ?? [];
  if (leftover.length > 0) {
    warnings.push(`Weapon Attribute template contains unknown token(s): ${Array.from(new Set(leftover)).join(", ")}`);
  }

  return { text: out, warnings };
}

function applyArmorAttributeTokens(
  template: string,
  ctx: {
    attributeValue: string | null;

    // Chosen PV helper
    chosenPv?: number;

    // Armor core tokens
    ppv?: number;
    mpv?: number;
    auraPhysical?: number | null;
    auraMental?: number | null;
  },
): { text: string; warnings: string[] } {
  const warnings: string[] = [];

  // NOTE:
  // - [AuraPhysical] / [AuraMental] are explicit.
  // - [Aura] is a convenience token: prefer Physical if present, else Mental, else 0.
  const auraPhysical =
    typeof ctx.auraPhysical === "number" && Number.isFinite(ctx.auraPhysical)
      ? ctx.auraPhysical
      : null;

  const auraMental =
    typeof ctx.auraMental === "number" && Number.isFinite(ctx.auraMental)
      ? ctx.auraMental
      : null;

  const aura =
    auraPhysical !== null ? auraPhysical : auraMental !== null ? auraMental : 0;

  const replacements: Record<string, string> = {
    "[AttributeValue]": ctx.attributeValue === null ? "?" : String(ctx.attributeValue),
    "[ChosenPV]":
      typeof ctx.chosenPv === "number" && Number.isFinite(ctx.chosenPv)
        ? String(ctx.chosenPv)
        : "?",

    "[PPV]": safeNum(ctx.ppv),
    "[MPV]": safeNum(ctx.mpv),

    "[AuraPhysical]": auraPhysical === null ? "?" : String(auraPhysical),
    "[AuraMental]": auraMental === null ? "?" : String(auraMental),
    "[Aura]": String(aura),
  };

  if (template.includes("[AttributeValue]") && ctx.attributeValue === null) {
    warnings.push(
      'Armor Attribute template uses [AttributeValue] but no value was found in the attribute name.',
    );
  }

  let out = template;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }

  // If any bracket tokens remain, warn (authoring mistake)
  const leftover = out.match(/\[[^\]]+\]/g) ?? [];
  if (leftover.length > 0) {
    warnings.push(
      `Armor Attribute template contains unknown token(s): ${Array.from(
        new Set(leftover),
      ).join(", ")}`,
    );
  }

  return { text: out, warnings };
}

export function buildDescriptorResult(input: DescriptorInput): DescriptorResult {
  const sections: DescriptorSection[] = [];

  const mods = normalizeMods(input.globalAttributeModifiers);

  if (mods.length > 0) {
    sections.push({
      id: "MODIFIERS",
      title: "Modifiers",
      order: 10,
      lines: [
        {
          kind: "GLOBAL_ATTRIBUTE_MODIFIERS",
          itemType: input.itemType,
          mods,
        },
      ],
    });
  }

  // WEAPON ATTRIBUTES (render-only; templates authored in Admin UI)
  const weaponAttributes = Array.isArray((input as any)?.weaponAttributes)
    ? ((input as any).weaponAttributes as Array<{
        name: string;
        descriptorTemplate?: string | null;
        strengthSource?: "MELEE" | "RANGED" | "AOE" | null;
        rangeSource?: "MELEE" | "RANGED" | "AOE" | null;
      }>)
    : [];

  if (
    weaponAttributes.length > 0 &&
    (input.itemType === "WEAPON" || input.itemType === "SHIELD")
  ) {
    const lines: WeaponAttributeLine[] = [];
    const warnings: string[] = [];

    // Deterministic order: by baseName then full name
    const sorted = weaponAttributes
      .map((wa) => ({
        name: String(wa?.name ?? "").trim(),
        descriptorTemplate: wa?.descriptorTemplate ?? null,
        strengthSource:
          wa?.strengthSource === "MELEE" ||
          wa?.strengthSource === "RANGED" ||
          wa?.strengthSource === "AOE"
            ? wa.strengthSource
            : null,

        rangeSource:
          wa?.rangeSource === "MELEE" ||
          wa?.rangeSource === "RANGED" ||
          wa?.rangeSource === "AOE"
            ? wa.rangeSource
            : null,
      }))
      .filter((wa) => wa.name.length > 0)
      .map((wa) => {
        const parsed = parseAttributeName(wa.name);
        return { ...wa, baseName: parsed.baseName, value: parsed.value };
      })
      .sort((a, b) => {
        const aKey = `${a.baseName}::${a.name}`;
        const bKey = `${b.baseName}::${b.name}`;
        return aKey.localeCompare(bKey);
      });

    for (const wa of sorted) {
      const tplRaw = String(wa.descriptorTemplate ?? "").trim();
      if (!tplRaw) {
        warnings.push(`Weapon Attribute "${wa.name}" has no descriptorTemplate.`);
        continue;
      }

      // Aggregate "selected on this weapon" values across all enabled ranges
      const dmgTypes = new Set<string>();
      const gsEffects = new Set<string>();

      const meleeDTs = (input as any)?.melee?.damageTypes ?? [];
      const rangedDTs = (input as any)?.ranged?.damageTypes ?? [];
      const aoeDTs = (input as any)?.aoe?.damageTypes ?? [];

      for (const d of [...meleeDTs, ...rangedDTs, ...aoeDTs]) {
        const n = String(d?.name ?? "").trim();
        if (n) dmgTypes.add(n);
      }

      const meleeGS = (input as any)?.melee?.gsAttackEffects ?? [];
      const rangedGS = (input as any)?.ranged?.gsAttackEffects ?? [];
      const aoeGS = (input as any)?.aoe?.gsAttackEffects ?? [];

      for (const g of [...meleeGS, ...rangedGS, ...aoeGS]) {
        const n = String(g?.name ?? "").trim();
        if (n) gsEffects.add(n);
      }

      const applied = applyWeaponAttributeTokens(tplRaw, {
        attributeValue: wa.value,
        strengthSource: (wa as any).strengthSource ?? null,
        rangeSource: (wa as any).rangeSource ?? null,

        // Weapon context
        damageTypes: Array.from(dmgTypes).sort().join(", ") || "?",
        gsAttackEffects: Array.from(gsEffects).sort().join(", ") || "?",

        // Range context
        meleeTargets: (input as any)?.melee?.targets,
        rangedTargets: (input as any)?.ranged?.targets,
        rangedDistanceFeet: (input as any)?.ranged?.distanceFeet,

        aoeCount: (input as any)?.aoe?.count,
        aoeCenterRangeFeet: (input as any)?.aoe?.centerRangeFeet,
        aoeShape: (input as any)?.aoe?.shape,
        aoeSphereRadiusFeet: (input as any)?.aoe?.sphereRadiusFeet,
        aoeConeLengthFeet: (input as any)?.aoe?.coneLengthFeet,
        aoeLineWidthFeet: (input as any)?.aoe?.lineWidthFeet,
        aoeLineLengthFeet: (input as any)?.aoe?.lineLengthFeet,

        // Strength
        meleePhysicalStrength: (input as any)?.melee?.physicalStrength,
        meleeMentalStrength: (input as any)?.melee?.mentalStrength,
        rangedPhysicalStrength: (input as any)?.ranged?.physicalStrength,
        rangedMentalStrength: (input as any)?.ranged?.mentalStrength,
        aoePhysicalStrength: (input as any)?.aoe?.physicalStrength,
        aoeMentalStrength: (input as any)?.aoe?.mentalStrength,
      });

      warnings.push(...applied.warnings);

      // If author already wrote "Reload: ..." keep as-is, otherwise prefix "BaseName: "
      const baseName = wa.baseName || wa.name;
      const alreadyPrefixed =
        applied.text.toLowerCase().startsWith(`${baseName.toLowerCase()}:`) ||
        applied.text.toLowerCase().startsWith(`${wa.name.toLowerCase()}:`);

      const finalText = alreadyPrefixed ? applied.text : `${baseName}: ${applied.text}`;

      lines.push({
        kind: "WEAPON_ATTRIBUTE",
        itemType: input.itemType,
        text: finalText,
      });
    }

    if (lines.length > 0) {
      sections.push({
        id: "WEAPON_ATTRIBUTES",
        title: "Weapon Attributes",
        order: 40,
        lines,
      });
    }

    if (warnings.length > 0) {
      (sections as any).__weaponAttrWarnings = warnings;
    }
  }

    // ARMOR / SHIELD DESCRIPTORS (deterministic + templated)
      if (input.itemType === "ARMOR" || input.itemType === "SHIELD") {
    const ppv = Number((input as any)?.ppv ?? 0);
    const mpv = Number((input as any)?.mpv ?? 0);
    const defenceNoun = input.itemType === "ARMOR" ? "armor" : "shield";
    const defenceVerb = input.itemType === "ARMOR" ? "wearing" : "wielding";
    const defencePrefix =
      input.itemType === "SHIELD" ? "Whilst wielding this shield" : "Whilst wearing this armor";
    const auraPhysical = (input as any)?.auraPhysical ?? null;
    const auraMental = (input as any)?.auraMental ?? null;

    // 1) Defence String (deterministic)
    const defenceLines: any[] = [];

    const hasPpv = Number.isFinite(ppv) && ppv > 0;
    const hasMpv = Number.isFinite(mpv) && mpv > 0;

    if (hasPpv && hasMpv) {
      defenceLines.push({
        kind: "TEXT",
        text: `Whilst ${defenceVerb} this ${defenceNoun}, increase your Physical Protection by ${ppv}, and Mental Protection by ${mpv}.`,
      });
    } else if (hasPpv) {
      defenceLines.push({
        kind: "TEXT",
        text: `Whilst ${defenceVerb} this ${defenceNoun}, increase your Physical Protection by ${ppv}.`,
      });
    } else if (hasMpv) {
      defenceLines.push({
        kind: "TEXT",
        text: `Whilst ${defenceVerb} this ${defenceNoun}, increase your Mental Protection by ${mpv}.`,
      });
    }

    if (defenceLines.length > 0) {
      sections.push({
        id: "DEFENCE",
        title: "Defence",
        order: 20,
        lines: defenceLines as any,
      });
    }

    // 2) Greater Defence Effects (deterministic; picklist-driven names)
    const rawDefEffects: any[] = Array.isArray((input as any)?.defEffects)
      ? (input as any).defEffects
      : [];

    const defEffects = Array.from(
      new Set(rawDefEffects.map((x) => String(x ?? "").trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    if (defEffects.length > 0) {
      sections.push({
        id: "GREATER_DEFENCE_EFFECTS" ,
        title: "Greater Defence Effects",
        order: 30,
        lines: defEffects.map((name) => ({
          kind: "TEXT",
          text: `Greater successes on Defence rolls grant you 1 stack of ${name}.`,
        })) as any,
      });
    }

  // 3) Armor / Shield Attributes (templated; admin-authored)
    const rawAttributes =
      input.itemType === "ARMOR"
        ? (Array.isArray((input as any)?.armorAttributes) ? (input as any).armorAttributes : [])
        : (Array.isArray((input as any)?.shieldAttributes) ? (input as any).shieldAttributes : []);

    const typedAttributes = (rawAttributes as Array<{
      name: string;
      descriptorTemplate?: string | null;
      attributeValue?: number | string | null;
    }>) ?? [];

    if (typedAttributes.length > 0) {
      const warnings: string[] = [];

      const sorted = typedAttributes
        .filter((aa) => aa.name.length > 0)
        .map((aa) => {
          const parsed = parseAttributeName(aa.name);
          return { ...aa, baseName: parsed.baseName, value: parsed.value };
        })
        .sort((a, b) => {
          const aKey = `${a.baseName}::${a.name}`;
          const bKey = `${b.baseName}::${b.name}`;
          return aKey.localeCompare(bKey);
        });

      const lines: any[] = [];

      for (const aa of sorted) {
        const tplRaw = String(aa.descriptorTemplate ?? "").trim();
        if (!tplRaw) {
          warnings.push(`Armor Attribute "${aa.name}" has no descriptorTemplate.`);
          continue;
        }

        const wardingOptions = Array.isArray((input as any)?.wardingOptions)
          ? ((input as any).wardingOptions as any[])
          : [];

        const sanctifiedOptions = Array.isArray((input as any)?.sanctifiedOptions)
          ? ((input as any).sanctifiedOptions as any[])
          : [];

        const wardingValue =
          wardingOptions.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ") || null;

        const sanctifiedValue =
          sanctifiedOptions.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ") || null;

        const derivedAttributeValue =
          aa.attributeValue !== null && aa.attributeValue !== undefined
            ? String(aa.attributeValue)
            : aa.value !== null
              ? String(aa.value)
              : aa.baseName === "Warding"
                ? wardingValue
                : aa.baseName === "Sanctified"
                  ? sanctifiedValue
                  : null;

        const chosenPv =
          typeof ppv === "number" && ppv > 0
            ? ppv
            : typeof mpv === "number" && mpv > 0
              ? mpv
              : 0;

        const rendered = applyArmorAttributeTokens(tplRaw, {
          attributeValue: derivedAttributeValue,
          chosenPv,
          ppv,
          mpv,
          auraPhysical,
          auraMental,
        });

        for (const w of rendered.warnings) warnings.push(`${aa.name}: ${w}`);

        lines.push({
          kind: "TEXT",
          text: `${aa.baseName}: ${rendered.text}`,
        });
      }

      if (lines.length > 0) {
          sections.push({ 
          id: input.itemType === "ARMOR" ? "ARMOR_ATTRIBUTES" : "SHIELD_ATTRIBUTES",
          title: input.itemType === "ARMOR" ? "Armor Attributes" : "Shield Attributes",
          order: 40,
          lines: lines as any,
        });
      }

      if (warnings.length > 0) {
        (sections as any).__armorAttrWarnings = warnings;
      }
    }

    // 4) VRP (deterministic; no templates)
    const rawVrp: any[] = Array.isArray((input as any)?.vrpEntries)
      ? (input as any).vrpEntries
      : [];

    const vrpNormalized = rawVrp
      .map((e) => ({
        effectKind: String(e?.effectKind ?? "").trim().toUpperCase(),
        magnitude: Number(e?.magnitude ?? 0),
        damageType: String(e?.damageType ?? "").trim(),
      }))
      .filter(
        (e) =>
          (e.effectKind === "VULNERABILITY" ||
            e.effectKind === "RESISTANCE" ||
            e.effectKind === "PROTECTION") &&
          Number.isFinite(e.magnitude) &&
          e.magnitude > 0 &&
          e.damageType.length > 0,
      )
      .sort((a, b) => {
        const aKey = `${a.effectKind}::${a.damageType}::${a.magnitude}`;
        const bKey = `${b.effectKind}::${b.damageType}::${b.magnitude}`;
        return aKey.localeCompare(bKey);
      });

    if (vrpNormalized.length > 0) {
      const lines: any[] = vrpNormalized.map((e) => {
        if (e.effectKind === "VULNERABILITY") {
          return {
            kind: "TEXT",
            text: `${defencePrefix}, you suffer −${e.magnitude} to Defence rolls against ${e.damageType} attacks.`,
          };
        }

        if (e.effectKind === "RESISTANCE") {
          return {
            kind: "TEXT",
            text: `${defencePrefix}, you gain +${e.magnitude} to Defence rolls against ${e.damageType} attacks.`,
          };
        }

        // PROTECTION
        return {
          kind: "TEXT",
          text: `${defencePrefix}, you gain +${e.magnitude} dice to Defence rolls against ${e.damageType} attacks.`,
        };
      });

      sections.push({
        id: "VRP" ,
        title: "VRP",
        order: 15,
        lines: lines as any,
      });
    }
  }
  // ATTACK ACTIONS (Physical + Mental)
  // DT-A6: No global damageTypes fallback. Each enabled range must provide its own damageTypes.

  const melee = (input as any)?.melee;
  const ranged = (input as any)?.ranged;
  const aoe = (input as any)?.aoe;

    const attackLines: AttackActionLine[] = [];

    const pushRangeLines = (rangeInput: any, kind: "MELEE" | "RANGED" | "AOE") => {
        if (!rangeInput?.enabled) return;

        // Only weapons and shields
        if (input.itemType !== "WEAPON" && input.itemType !== "SHIELD") return;

        const physicalStrength = Number(rangeInput?.physicalStrength ?? 0);
        const mentalStrength = Number(rangeInput?.mentalStrength ?? 0);

        // Require a damage type if any attack is present
        if ((!Number.isFinite(physicalStrength) || physicalStrength <= 0) && (!Number.isFinite(mentalStrength) || mentalStrength <= 0)) return;

        // DT-A6: Require per-range damageTypes (no global fallback)
        const rawDamageTypes: any[] = Array.isArray(rangeInput?.damageTypes)
          ? rangeInput.damageTypes
          : [];

        const rangeDamageTypes = rawDamageTypes
          .map((dt) => {
            if (typeof dt === "string") {
              return { name: dt, mode: "PHYSICAL" as const };
            }
            const name = String(dt?.name ?? "").trim();
            const mode = dt?.mode === "MENTAL" ? ("MENTAL" as const) : ("PHYSICAL" as const);
            return name ? { name, mode } : null;
          })
          .filter(Boolean) as Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;

        // Dedup by name (case-insensitive), deterministic sort
        const byName = new Map<string, { name: string; mode: "PHYSICAL" | "MENTAL" }>();
        for (const dt of rangeDamageTypes) byName.set(dt.name.toLowerCase(), dt);
        const dedupedDamageTypes = Array.from(byName.values()).sort((a, b) =>
  a.name.localeCompare(b.name),
);

        if (dedupedDamageTypes.length === 0) return;

        // Per-range GS Attack Effects (names). These are presentation-only here.
        const rawGs: any[] = Array.isArray((rangeInput as any)?.gsAttackEffects)
          ? (rangeInput as any).gsAttackEffects
          : [];

        const gsAttackEffects = Array.from(
          new Set(rawGs.map((x) => String(x ?? "").trim()).filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b));

        // Build a single-range array (one entry)
        const ranges: AttackActionLine["ranges"] = [];

        if (kind === "MELEE") {
            ranges.push({
                kind: "MELEE",
                targets: rangeInput.targets ?? 1,
            });
        } else if (kind === "RANGED") {
            ranges.push({
                kind: "RANGED",
                targets: rangeInput.targets ?? 1,
                distance: rangeInput.distance ?? 0,
            });
        } else {
            // AOE (minimal phrasing; require shape to exist)
            if (!rangeInput.shape) return;
            ranges.push({
                kind: "AOE",
                count: rangeInput.count ?? 1,
                centerRange: rangeInput.centerRange ?? 0,
                shape: rangeInput.shape,
                geometry: rangeInput.geometry ?? {},
            });
        }

      const damageEntries: Array<{
        amount: number;
        mode: "PHYSICAL" | "MENTAL";
        damageType: string;
      }> = [];

      for (const dmgType of dedupedDamageTypes) {
        const dmgMode = dmgType.mode === "MENTAL" ? "MENTAL" : "PHYSICAL";

        if (dmgMode === "PHYSICAL" && physicalStrength > 0) {
          damageEntries.push({
            amount: physicalStrength,
            mode: "PHYSICAL",
            damageType: dmgType.name,
          });
        }

        if (dmgMode === "MENTAL" && mentalStrength > 0) {
          damageEntries.push({
            amount: mentalStrength,
            mode: "MENTAL",
            damageType: dmgType.name,
          });
        }
      }

      if (damageEntries.length > 0) {
        attackLines.push({
          kind: "ATTACK_ACTION",
          itemType: input.itemType,
          ranges,
          damage: {
            entries: damageEntries,
          },
          // Extra per-range presentation data (kept as "any" to avoid widening shared types)
          gsAttackEffects,
        } as any);
      }
    };

    pushRangeLines(melee, "MELEE");
    pushRangeLines(ranged, "RANGED");
    pushRangeLines(aoe, "AOE");

  if (attackLines.length > 0) {
    sections.push({
      id: "ATTACK_ACTIONS",
      title: "Attack Actions",
      order: 50,
      lines: attackLines,
    });
  }

  // Deterministic section order
  sections.sort((a, b) => a.order - b.order);

  const weaponWarnings: string[] = (sections as any).__weaponAttrWarnings ?? [];
  const armorWarnings: string[] = (sections as any).__armorAttrWarnings ?? [];

  if (weaponWarnings.length > 0) delete (sections as any).__weaponAttrWarnings;
  if (armorWarnings.length > 0) delete (sections as any).__armorAttrWarnings;

  const mergedWarnings = [...weaponWarnings, ...armorWarnings];

  if (mergedWarnings.length > 0) {
    return { sections, meta: { warnings: mergedWarnings } };
  }

  return { sections };
}

