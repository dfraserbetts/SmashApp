"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildDescriptorResult } from '@/lib/descriptors/descriptorEngine';
import { renderForgeResult } from '@/lib/descriptors/renderers/forgeRenderer';

type Props = {
  campaignId: string;
};

type LayoutPreset = 'standard' | 'verbose';

type DamageTypeRef = {
  name?: string | null;
  attackMode?: string | null;
};

type ForgeApiItem = {
  id: string;
  name: string | null;
  type: string | null;
  rarity: string | null;
  level: number | null;
  generalDescription: string | null;
  itemUrl?: string | null;
  size?: string | null;
  armorLocation?: string | null;
  itemLocation?: string | null;

  globalAttributeModifiers?: Array<{ attribute?: string; amount?: number }> | null;

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
  aoeShape?: string | null;
  aoeSphereRadiusFeet?: number | null;
  aoeConeLengthFeet?: number | null;
  aoeLineWidthFeet?: number | null;
  aoeLineLengthFeet?: number | null;

  customWeaponAttributes?: string | null;
  customArmorAttributes?: string | null;
  customShieldAttributes?: string | null;
  customItemAttributes?: string | null;

  ppv?: number | null;
  mpv?: number | null;
  auraPhysical?: number | null;
  auraMental?: number | null;

  rangeCategories?: Array<{ rangeCategory?: string | null }>;

  meleeDamageTypes?: Array<{ damageType?: DamageTypeRef | null }>;
  rangedDamageTypes?: Array<{ damageType?: DamageTypeRef | null }>;
  aoeDamageTypes?: Array<{ damageType?: DamageTypeRef | null }>;

  attackEffectsMelee?: Array<{ attackEffect?: { name?: string | null } | null }>;
  attackEffectsRanged?: Array<{ attackEffect?: { name?: string | null } | null }>;
  attackEffectsAoE?: Array<{ attackEffect?: { name?: string | null } | null }>;

  weaponAttributes?: Array<{
    strengthSource?: 'MELEE' | 'RANGED' | 'AOE' | null;
    rangeSource?: 'MELEE' | 'RANGED' | 'AOE' | null;
    weaponAttribute?: {
      name?: string | null;
      descriptorTemplate?: string | null;
    } | null;
  }>;

  armorAttributes?: Array<{
    armorAttribute?: {
      name?: string | null;
      descriptorTemplate?: string | null;
    } | null;
  }>;

  shieldAttributes?: Array<{
    shieldAttribute?: {
      name?: string | null;
      descriptorTemplate?: string | null;
    } | null;
  }>;

  defEffects?: Array<{ defEffect?: { name?: string | null } | null }>;
  wardingOptions?: Array<{ wardingOption?: { name?: string | null } | null }>;
  sanctifiedOptions?: Array<{ sanctifiedOption?: { name?: string | null } | null }>;

  vrpEntries?: Array<{
    effectKind?: 'VULNERABILITY' | 'RESISTANCE' | 'PROTECTION' | null;
    magnitude?: number | null;
    damageType?: { name?: string | null } | null;
  }>;
};

const SIZE_LABELS: Record<string, string> = {
  SMALL: 'Small',
  ONE_HANDED: 'One Handed',
  TWO_HANDED: 'Two Handed',
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed);
}

function toDamageSpecs(
  rows: Array<{ damageType?: DamageTypeRef | null }> | undefined,
): Array<{ name: string; mode: 'PHYSICAL' | 'MENTAL' }> {
  const byName = new Map<string, { name: string; mode: 'PHYSICAL' | 'MENTAL' }>();

  for (const row of rows ?? []) {
    const name = String(row.damageType?.name ?? '').trim();
    if (!name) continue;

    const mode = String(row.damageType?.attackMode ?? '').trim().toUpperCase() === 'MENTAL'
      ? 'MENTAL'
      : 'PHYSICAL';

    byName.set(name.toLowerCase(), { name, mode });
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function extractNames<T extends { name?: string | null }>(rows: Array<T | null | undefined>): string[] {
  return rows
    .map((x) => String(x?.name ?? '').trim())
    .filter((x) => x.length > 0);
}

function stripArmorPrefixForBullet(line: string): string {
  let s = String(line ?? '').trim();

  const prefixes = [
    'Whilst wearing this armor, the wielder gains ',
    'Whilst wearing this armor, you gain ',
    'Whilst wearing this armor, you suffer ',
  ];

  for (const p of prefixes) {
    if (s.startsWith(p)) {
      s = s.slice(p.length).trim();
      break;
    }
  }

  const gsPrefix = 'Greater successes on Defence rolls grant you ';
  if (s.startsWith(gsPrefix)) {
    s = s.slice(gsPrefix.length).trim();
  }

  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

function stripShieldPrefixForBullet(line: string): string {
  let s = String(line ?? '').trim();

  const prefixes = [
    'Whilst wielding this shield, the wielder gains ',
    'Whilst wielding this shield, you gain ',
    'Whilst wielding this shield, you suffer ',
  ];

  for (const p of prefixes) {
    if (s.startsWith(p)) {
      s = s.slice(p.length).trim();
      break;
    }
  }

  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

function formatGreaterDefenceLine(lines: string[]): string {
  const prefix = 'Greater successes on Defence rolls grant you 1 stack of ';

  const names = lines
    .map((l) => String(l ?? '').trim())
    .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l))
    .map((l) => (l.endsWith('.') ? l.slice(0, -1) : l))
    .map((l) => l.trim())
    .filter(Boolean);

  if (names.length === 0) return '';
  if (names.length === 1) return `Greater successes on defence rolls grant you 1 stack of ${names[0]}.`;
  if (names.length === 2) return `Greater successes on defence rolls grant you 1 stack of ${names[0]} or ${names[1]}.`;

  const head = names.slice(0, -1).join(', ');
  const tail = names[names.length - 1];
  return `Greater successes on defence rolls grant you 1 stack of ${head} or ${tail}.`;
}

function ForgeItemPrintCard({ item }: { item: ForgeApiItem }) {
  const type = String(item.type ?? 'ITEM').toUpperCase();
  const rangeCategories = new Set(
    (item.rangeCategories ?? [])
      .map((x) => String(x.rangeCategory ?? '').trim().toUpperCase())
      .filter(Boolean),
  );

  const selectedWeaponAttributes = (item.weaponAttributes ?? [])
    .map((row) => {
      const name = String(row.weaponAttribute?.name ?? '').trim();
      if (!name) return null;
      return {
        name,
        descriptorTemplate: row.weaponAttribute?.descriptorTemplate ?? null,
        strengthSource: row.strengthSource ?? null,
        rangeSource: row.rangeSource ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const selectedArmorAttributes = (item.armorAttributes ?? [])
    .map((row) => {
      const name = String(row.armorAttribute?.name ?? '').trim();
      if (!name) return null;
      return {
        name,
        descriptorTemplate: row.armorAttribute?.descriptorTemplate ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const selectedShieldAttributes = (item.shieldAttributes ?? [])
    .map((row) => {
      const name = String(row.shieldAttribute?.name ?? '').trim();
      if (!name) return null;
      return {
        name,
        descriptorTemplate: row.shieldAttribute?.descriptorTemplate ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const engineInput = {
    itemType: type,
    globalAttributeModifiers: Array.isArray(item.globalAttributeModifiers)
      ? item.globalAttributeModifiers
      : [],

    weaponAttributes: selectedWeaponAttributes,
    armorAttributes: selectedArmorAttributes,
    shieldAttributes: selectedShieldAttributes,

    ppv: Number(item.ppv ?? 0),
    mpv: Number(item.mpv ?? 0),
    auraPhysical: item.auraPhysical ?? null,
    auraMental: item.auraMental ?? null,

    defEffects: extractNames((item.defEffects ?? []).map((x) => x.defEffect)),
    wardingOptions: extractNames((item.wardingOptions ?? []).map((x) => x.wardingOption)),
    sanctifiedOptions: extractNames((item.sanctifiedOptions ?? []).map((x) => x.sanctifiedOption)),

    vrpEntries: (item.vrpEntries ?? [])
      .map((entry) => {
        const effectKind = entry.effectKind ?? null;
        const magnitude = Number(entry.magnitude ?? 0);
        const damageType = String(entry.damageType?.name ?? '').trim();

        if (!effectKind || !damageType || !Number.isFinite(magnitude)) return null;

        return {
          effectKind,
          magnitude,
          damageType,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x),

    customArmorAttributes: item.customArmorAttributes ?? null,
    customShieldAttributes: item.customShieldAttributes ?? null,

    melee: {
      enabled: rangeCategories.has('MELEE'),
      damageTypes: toDamageSpecs(item.meleeDamageTypes),
      targets: Number(item.meleeTargets ?? 1),
      physicalStrength: Number(item.meleePhysicalStrength ?? 0),
      mentalStrength: Number(item.meleeMentalStrength ?? 0),
      gsAttackEffects: extractNames((item.attackEffectsMelee ?? []).map((x) => x.attackEffect)),
    },
    ranged: {
      enabled: rangeCategories.has('RANGED'),
      damageTypes: toDamageSpecs(item.rangedDamageTypes),
      targets: Number(item.rangedTargets ?? 1),
      distance: Number(item.rangedDistanceFeet ?? 0),
      physicalStrength: Number(item.rangedPhysicalStrength ?? 0),
      mentalStrength: Number(item.rangedMentalStrength ?? 0),
      gsAttackEffects: extractNames((item.attackEffectsRanged ?? []).map((x) => x.attackEffect)),
    },
    aoe: {
      enabled: rangeCategories.has('AOE'),
      damageTypes: toDamageSpecs(item.aoeDamageTypes),
      count: Number(item.aoeCount ?? 1),
      centerRange: Number(item.aoeCenterRangeFeet ?? 0),
      shape: (item.aoeShape ?? null) as 'SPHERE' | 'CONE' | 'LINE' | null,
      geometry: {
        ...(item.aoeShape === 'SPHERE' && Number(item.aoeSphereRadiusFeet ?? 0) > 0
          ? { radius: Number(item.aoeSphereRadiusFeet) }
          : {}),
        ...(item.aoeShape === 'CONE' && Number(item.aoeConeLengthFeet ?? 0) > 0
          ? { length: Number(item.aoeConeLengthFeet) }
          : {}),
        ...(item.aoeShape === 'LINE'
          ? {
              ...(Number(item.aoeLineLengthFeet ?? 0) > 0
                ? { length: Number(item.aoeLineLengthFeet) }
                : {}),
              ...(Number(item.aoeLineWidthFeet ?? 0) > 0
                ? { width: Number(item.aoeLineWidthFeet) }
                : {}),
            }
          : {}),
      },
      physicalStrength: Number(item.aoePhysicalStrength ?? 0),
      mentalStrength: Number(item.aoeMentalStrength ?? 0),
      gsAttackEffects: extractNames((item.attackEffectsAoE ?? []).map((x) => x.attackEffect)),
    },
  };

  const descriptor = buildDescriptorResult(engineInput as any);
  const rendered = renderForgeResult(descriptor);

  const modifiers = rendered.find((s) => s.title === 'Modifiers');
  const weaponAttributes = rendered.find((s) => s.title === 'Weapon Attributes');
  const attack = rendered.find((s) => s.title === 'Attack Actions');
  const defence = rendered.find((s) => s.title === 'Defence');
  const greaterDefence = rendered.find((s) => s.title === 'Greater Defence Effects');
  const armorAttributes = rendered.find((s) => s.title === 'Armor Attributes');
  const shieldAttributes = rendered.find((s) => s.title === 'Shield Attributes');
  const vrp = rendered.find((s) => s.title === 'VRP');

  const safeCustomWeapon = String(item.customWeaponAttributes ?? '').trim();
  const safeCustomArmor = String(item.customArmorAttributes ?? '').trim();
  const safeCustomShield = String(item.customShieldAttributes ?? '').trim();
  const safeCustomItem = String(item.customItemAttributes ?? '').trim();

  const showModifiers = Boolean(modifiers && modifiers.lines.length > 0);
  const showWeaponAttributes = Boolean(weaponAttributes && weaponAttributes.lines.length > 0);
  const showAttack = Boolean(attack && attack.lines.length > 0);

  const showDefence = Boolean(defence && defence.lines.length > 0);
  const showGreaterDefence = Boolean(greaterDefence && greaterDefence.lines.length > 0);
  const showArmorAttributes = Boolean(armorAttributes && armorAttributes.lines.length > 0);
  const showShieldAttributes = Boolean(shieldAttributes && shieldAttributes.lines.length > 0);
  const showVrp = Boolean(vrp && vrp.lines.length > 0);

  const showCustomWeapon = type === 'WEAPON' && safeCustomWeapon.length > 0;
  const showCustomArmor = type === 'ARMOR' && safeCustomArmor.length > 0;
  const showCustomShield = type === 'SHIELD' && safeCustomShield.length > 0;
  const showCustomItem = type === 'ITEM' && safeCustomItem.length > 0;

  const showArmorWearPreface = type === 'ARMOR' && (showModifiers || showArmorAttributes || showVrp || showGreaterDefence);
  const showShieldWieldPreface = type === 'SHIELD' && (showModifiers || showVrp || showShieldAttributes);

  const showAttributesBox =
    showModifiers ||
    showWeaponAttributes ||
    showArmorAttributes ||
    showShieldAttributes ||
    showVrp ||
    showCustomArmor ||
    showCustomShield ||
    showCustomItem ||
    showCustomWeapon;

  const showDefenceBox = showDefence || showGreaterDefence;

  const sizeLabel = item.size ? (SIZE_LABELS[item.size] ?? item.size) : null;
  const locationLabel =
    (type === 'WEAPON' || type === 'SHIELD') && sizeLabel
      ? sizeLabel
      : type === 'ARMOR' && item.armorLocation
        ? item.armorLocation
        : type === 'ITEM' && item.itemLocation
          ? item.itemLocation
          : 'Unassigned';
  const displayName = item.name?.trim() ? item.name : 'Unnamed item';
  const tagline = item.generalDescription?.trim() ?? '';
  const headerLineText = tagline ? `${displayName} | ${tagline}` : displayName;

  return (
    <div className="forge-item-card h-full rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 p-3 text-sm">
      <div className="forge-item-header space-y-1">
        <p className="forge-item-header-line1 text-xs uppercase tracking-wide text-zinc-400">
          {item.rarity ?? 'COMMON'} {type} - {locationLabel}
        </p>
        <p className="forge-item-header-line2 text-sm font-semibold text-zinc-100" title={headerLineText}>
          {headerLineText}
        </p>
      </div>

      <div className="forge-item-image-wrap rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <img
          src={isHttpUrl(item.itemUrl) ? item.itemUrl!.trim() : '/item-placeholder.png'}
          alt={displayName}
          className="forge-item-image w-full bg-zinc-950/20"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = '/item-placeholder.png';
          }}
        />
      </div>

      <div className="forge-item-body space-y-2">
        {showAttributesBox && (
          <div className="forge-item-section-attributes rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Attributes</p>

            {showArmorWearPreface && (
              <p className="text-sm leading-5 text-zinc-200">Whilst wearing this armor, the wielder gains</p>
            )}

            {showShieldWieldPreface && (
              <p className="text-sm leading-5 text-zinc-200">Whilst wielding this shield, the wielder gains</p>
            )}

            {type === 'ARMOR' && showModifiers && modifiers && (
              <ul className="list-disc pl-5 space-y-1">
                {modifiers.lines
                  .map((l) => stripArmorPrefixForBullet(l))
                  .filter((l) => l.length > 0)
                  .map((l, idx) => (
                    <li key={`mod-${idx}`} className="text-sm leading-5">{l}</li>
                  ))}
              </ul>
            )}

            {type === 'SHIELD' && showModifiers && modifiers && (
              <ul className="list-disc pl-5 space-y-1">
                {modifiers.lines
                  .map((l) => stripShieldPrefixForBullet(l))
                  .filter((l) => l.length > 0)
                  .map((l, idx) => (
                    <li key={`mod-${idx}`} className="text-sm leading-5">{l}</li>
                  ))}
              </ul>
            )}

            {type !== 'ARMOR' && type !== 'SHIELD' && showModifiers && modifiers && (
              <div className="space-y-1">
                {modifiers.lines.map((l, idx) => (
                  <p key={`mod-${idx}`} className="text-sm leading-5">{l}</p>
                ))}
              </div>
            )}

            {showWeaponAttributes && weaponAttributes && (
              <div className="space-y-1">
                {weaponAttributes.lines.map((l, idx) => (
                  <p key={`wa-${idx}`} className="text-sm leading-5">{l}</p>
                ))}
              </div>
            )}

            {showCustomWeapon && (
              <p className="forge-item-section-custom text-sm leading-5">Custom: {safeCustomWeapon}</p>
            )}

            {type === 'ARMOR' && showVrp && vrp && (
              <ul className="list-disc pl-5 space-y-1">
                {vrp.lines
                  .map((l) => stripArmorPrefixForBullet(l))
                  .filter((l) => l.length > 0)
                  .map((l, idx) => (
                    <li key={`vrp-${idx}`} className="text-sm leading-5">{l}</li>
                  ))}
              </ul>
            )}

            {type === 'SHIELD' && showVrp && vrp && (
              <ul className="list-disc pl-5 space-y-1">
                {vrp.lines
                  .map((l) => stripShieldPrefixForBullet(l))
                  .filter((l) => l.length > 0)
                  .map((l, idx) => (
                    <li key={`vrp-${idx}`} className="text-sm leading-5">{l}</li>
                  ))}
              </ul>
            )}

            {type !== 'ARMOR' && type !== 'SHIELD' && showVrp && vrp && (
              <div className="space-y-1">
                {vrp.lines.map((l, idx) => (
                  <p key={`vrp-${idx}`} className="text-sm leading-5">{l}</p>
                ))}
              </div>
            )}

            {type === 'ARMOR' && showArmorAttributes && armorAttributes && (
              <ul className="list-disc pl-5 space-y-1">
                {armorAttributes.lines
                  .map((l) => stripArmorPrefixForBullet(l))
                  .filter((l) => l.length > 0)
                  .map((l, idx) => (
                    <li key={`aa-${idx}`} className="text-sm leading-5">{l}</li>
                  ))}
              </ul>
            )}

            {type !== 'ARMOR' && showArmorAttributes && armorAttributes && (
              <div className="space-y-1">
                {armorAttributes.lines.map((l, idx) => (
                  <p key={`aa-${idx}`} className="text-sm leading-5">{l}</p>
                ))}
              </div>
            )}

            {type === 'SHIELD' && showShieldAttributes && shieldAttributes && (
              <ul className="list-disc pl-5 space-y-1">
                {shieldAttributes.lines
                  .map((l) => stripShieldPrefixForBullet(l))
                  .filter((l) => l.length > 0)
                  .map((l, idx) => (
                    <li key={`sa-${idx}`} className="text-sm leading-5">{l}</li>
                  ))}
              </ul>
            )}

            {showCustomArmor && (
              <p className="forge-item-section-custom text-sm leading-5">Custom: {safeCustomArmor}</p>
            )}

            {showCustomShield && (
              <p className="forge-item-section-custom text-sm leading-5">Custom: {safeCustomShield}</p>
            )}

            {showCustomItem && (
              <p className="forge-item-section-custom text-sm leading-5">Custom: {safeCustomItem}</p>
            )}
          </div>
        )}

        {showDefenceBox && (
          <div className="forge-item-section-defence rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{defence?.title ?? 'Defence'}</p>
            <div className="space-y-1">
              {(defence?.lines ?? []).map((l, idx) => (
                <p key={`def-${idx}`} className="text-sm leading-5">{l}</p>
              ))}
            </div>

            {type === 'ARMOR' && showGreaterDefence && greaterDefence && (() => {
              const line = formatGreaterDefenceLine(greaterDefence.lines);
              if (!line) return null;
              return <p className="text-sm leading-5 text-zinc-200">{line}</p>;
            })()}
          </div>
        )}

        {showAttack && attack && (
          <div className="forge-item-section-attack rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{attack.title}</p>
            {attack.lines.map((line, idx) => {
              const parts = String(line).split('||');
              const hasHeader = parts.length > 1;
              const header = (hasHeader ? parts[0] : '').trim();
              const text = (hasHeader ? parts.slice(1).join('||') : parts[0]).trim();

              return (
                <div key={`atk-${idx}`} className="grid grid-cols-[58px_1fr] gap-x-2">
                  <div className="text-zinc-200 font-semibold">{header}</div>
                  <div className="text-zinc-200">{text}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ForgePrintMode({ campaignId }: Props) {
  const [items, setItems] = useState<ForgeApiItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>('standard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/forge/items?campaignId=${encodeURIComponent(campaignId)}`, {
          cache: 'no-store',
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? 'Failed to load forge items');
        }

        const rows = (await res.json()) as ForgeApiItem[];
        if (cancelled) return;
        setItems(Array.isArray(rows) ? rows : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load print mode data';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const selectedItems = useMemo(() => {
    const set = new Set(selectedIds);
    return items.filter((item) => set.has(item.id));
  }, [items, selectedIds]);

  const cardsPerPage = layoutPreset === 'verbose' ? 2 : 4;
  const pages = useMemo(() => chunk(selectedItems, cardsPerPage), [cardsPerPage, selectedItems]);

  const onToggle = useCallback((itemId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(itemId)) return prev;
        return [...prev, itemId];
      }
      return prev.filter((id) => id !== itemId);
    });
  }, []);

  const triggerPrint = useCallback(() => {
    // Kept isolated so we can later swap this trigger to a server PDF endpoint.
    window.print();
  }, []);

  return (
    <div className="forge-print-root space-y-6">
      <section className="forge-print-controls rounded border border-zinc-800 bg-zinc-900/30 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Print Mode</h2>
            <p className="text-sm text-zinc-400">
              Select items and print A4 portrait sheets using a fixed layout preset.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/campaign/${campaignId}/forge`}
              className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
            >
              Back To Forge
            </Link>
            <button
              type="button"
              onClick={triggerPrint}
              disabled={selectedItems.length === 0}
              className="rounded border border-zinc-700 bg-zinc-100 px-3 py-2 text-sm text-zinc-900 disabled:opacity-50"
            >
              Print
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-zinc-300">
            <span className="mr-2">Layout</span>
            <select
              value={layoutPreset}
              onChange={(e) => setLayoutPreset(e.target.value as LayoutPreset)}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
            >
              <option value="standard">Standard (Portrait 2x2)</option>
              <option value="verbose">Verbose (Portrait 2x1)</option>
            </select>
          </label>
          <p className="text-xs text-zinc-500">
            {layoutPreset === 'verbose'
              ? 'Verbose mode: 2 cards per page for dense Mythic-style content.'
              : 'Standard mode: 4 cards per page with trading-card readability clamps.'}
          </p>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Campaign Forge Items</p>
          {loading && <p className="text-sm text-zinc-400">Loading items...</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-zinc-400">No Forge items available.</p>
          )}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {items.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <label key={item.id} className="flex items-start gap-2 rounded border border-zinc-800 p-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onToggle(item.id, e.target.checked)}
                      className="mt-1"
                    />
                    <span className="text-sm">
                      <span className="block font-medium">{item.name?.trim() ? item.name : 'Unnamed item'}</span>
                      <span className="text-zinc-400">
                        {item.rarity ?? 'COMMON'} {item.type ?? 'ITEM'} Lv {item.level ?? 0}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-6 overflow-x-auto">
        {selectedIds.length === 0 && (
          <div className="forge-print-controls rounded border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
            Select at least one item to preview printable pages.
          </div>
        )}

        {pages.map((page, pageIndex) => (
          <div key={pageIndex} className="space-y-2">
            <article
              className={`forge-print-page layout-${layoutPreset} mx-auto rounded border border-zinc-700 bg-white shadow-xl`}
            >
            <div className="forge-print-grid grid h-full">
              {Array.from({ length: cardsPerPage }).map((_, slotIndex) => {
                const item = page[slotIndex];
                return (
                  <div key={slotIndex} className="forge-print-card-wrap min-h-0 h-full overflow-hidden">
                    {item ? (
                      <ForgeItemPrintCard item={item} />
                    ) : (
                      <div className="h-full rounded border border-dashed border-zinc-300 bg-zinc-50" />
                    )}
                  </div>
                );
              })}
            </div>
          </article>
            <p className="forge-print-controls text-center text-xs text-zinc-500">A4 Page {pageIndex + 1}</p>
          </div>
        ))}
      </section>

      <style jsx global>{`
        .forge-print-page {
          width: min(100%, 980px);
          max-width: calc(100vw - 2rem);
          aspect-ratio: 210 / 297;
          padding: 10mm;
          box-sizing: border-box;
          overflow: hidden;
        }

        .forge-print-grid {
          height: 100%;
          min-height: 0;
          gap: 4mm;
        }

        .forge-print-page.layout-standard .forge-print-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
        }

        .forge-print-page.layout-verbose .forge-print-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: auto;
          grid-auto-rows: auto;
          align-content: start;
          align-items: start;
          height: auto;
        }

        .forge-item-card,
        .forge-print-card-wrap {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .forge-print-card-wrap {
          height: 100%;
          min-height: 0;
        }

        .forge-item-card {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          gap: 0.4rem;
          overflow: hidden;
          min-height: 0;
          height: 100%;
        }

        .forge-item-header {
          height: auto;
          min-height: 0;
          overflow: hidden;
        }

        .forge-item-header-line2 {
          line-height: 1.2;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          min-width: 0;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          overflow: hidden;
        }

        .forge-print-page.layout-standard .forge-item-header {
          max-height: 58px;
        }

        .forge-print-page.layout-verbose .forge-item-header {
          max-height: 76px;
        }

        .forge-print-page.layout-standard .forge-item-header-line2 {
          -webkit-line-clamp: 2;
        }

        .forge-print-page.layout-verbose .forge-item-header-line2 {
          -webkit-line-clamp: 3;
        }

        .forge-item-header-name {
          flex: 0 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .forge-item-header-separator {
          flex: none;
        }

        .forge-item-header-tagline {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .forge-item-image-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }

        .forge-item-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .forge-item-body {
          min-height: 0;
          overflow: hidden;
        }

        .forge-print-page.layout-standard .forge-item-image {
          object-fit: contain;
        }

        .forge-print-page.layout-verbose .forge-item-image {
          object-fit: contain;
        }

        .forge-print-page.layout-verbose .forge-print-card-wrap,
        .forge-print-page.layout-verbose .forge-item-card {
          height: auto;
          min-height: 0;
          align-self: start;
        }

        .forge-print-page.layout-verbose .forge-item-card {
          grid-template-rows: auto auto auto;
          align-content: start;
        }

        .forge-print-page.layout-verbose .forge-item-image-wrap {
          height: auto;
          min-height: 85mm;
          max-height: 140mm;
        }

        .forge-print-page.layout-verbose .forge-item-image {
          width: 100%;
          height: 100%;
          max-height: 140mm;
          object-fit: contain;
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {
          .forge-print-controls {
            display: none !important;
          }

          .forge-print-root {
            padding: 0 !important;
            margin: 0 !important;
          }

          .forge-print-page {
            width: 210mm !important;
            height: 297mm !important;
            max-width: 210mm !important;
            aspect-ratio: auto !important;
            box-sizing: border-box !important;
            padding: 10mm !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
            overflow: visible !important;
            break-after: page;
            page-break-after: always;
          }

          .forge-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          .forge-print-grid {
            height: 100% !important;
            min-height: 0 !important;
            gap: 4mm !important;
          }

          .forge-print-page.layout-standard .forge-print-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
          }

          .forge-print-page.layout-verbose .forge-print-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-template-rows: auto !important;
            grid-auto-rows: auto !important;
            height: auto !important;
            align-content: start !important;
            align-items: start !important;
          }

          .forge-print-page.layout-standard .forge-print-card-wrap,
          .forge-print-page.layout-standard .forge-item-card {
            overflow: hidden !important;
            height: 100% !important;
          }

          .forge-print-page.layout-standard .forge-print-card-wrap {
            height: 100% !important;
            min-height: 0 !important;
          }

          .forge-print-page.layout-verbose .forge-print-card-wrap,
          .forge-print-page.layout-verbose .forge-item-card {
            overflow: hidden !important;
            height: auto !important;
            min-height: 0 !important;
            align-self: start !important;
          }

          .forge-item-card {
            display: grid !important;
            gap: 3mm !important;
            padding: 2.2mm !important;
          }

          .forge-print-page.layout-standard .forge-item-card {
            grid-template-rows: auto minmax(55mm, 85mm) minmax(0, 1fr) !important;
          }

          .forge-print-page.layout-verbose .forge-item-card {
            grid-template-rows: 34px auto auto !important;
            align-content: start !important;
          }

          .forge-item-header {
            height: auto !important;
            min-height: 0 !important;
            overflow: hidden;
            margin: 0 !important;
          }

          .forge-item-header-line1 {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin: 0 !important;
          }

          .forge-item-header-line2 {
            margin: 0 !important;
            display: -webkit-box !important;
            -webkit-box-orient: vertical !important;
            min-width: 0 !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
            overflow: hidden !important;
            font-size: 11px !important;
            line-height: 1.15 !important;
          }

          .forge-print-page.layout-standard .forge-item-header {
            max-height: 42px !important;
          }

          .forge-print-page.layout-verbose .forge-item-header {
            max-height: 56px !important;
          }

          .forge-print-page.layout-standard .forge-item-header-line2 {
            -webkit-line-clamp: 2 !important;
          }

          .forge-print-page.layout-verbose .forge-item-header-line2 {
            -webkit-line-clamp: 3 !important;
          }

          .forge-item-header-name {
            font-weight: 600 !important;
            font-size: 11px !important;
            line-height: 1.15 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .forge-item-header-separator {
            flex: none !important;
          }

          .forge-item-header-tagline {
            font-weight: 400 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .forge-item-image-wrap {
            min-height: 0 !important;
            height: 100% !important;
            overflow: hidden !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          .forge-item-image {
            height: 100% !important;
            max-height: none !important;
            min-height: 0 !important;
          }

          .forge-print-page.layout-standard .forge-item-image {
            object-fit: contain !important;
          }

          .forge-print-page.layout-verbose .forge-item-image {
            object-fit: contain !important;
          }

          .forge-print-page.layout-verbose .forge-item-image-wrap {
            height: auto !important;
            min-height: 85mm !important;
            max-height: 140mm !important;
          }

          .forge-print-page.layout-verbose .forge-item-image {
            width: 100% !important;
            height: 100% !important;
            max-height: 140mm !important;
            object-fit: contain !important;
          }

          .forge-item-body {
            overflow: hidden !important;
            min-height: 0 !important;
          }

          .forge-item-section-attributes,
          .forge-item-section-attack,
          .forge-item-section-defence {
            overflow: hidden !important;
          }

          .forge-item-section-attributes > p:first-child,
          .forge-item-section-attack > p:first-child,
          .forge-item-section-defence > p:first-child {
            font-size: 9px !important;
            line-height: 1.1 !important;
          }

          .forge-item-section-attributes p,
          .forge-item-section-attributes li,
          .forge-item-section-attack p,
          .forge-item-section-attack li,
          .forge-item-section-defence p,
          .forge-item-section-defence li,
          .forge-item-section-custom {
            font-size: 10px !important;
            line-height: 1.25 !important;
          }

          .forge-print-page.layout-standard .forge-item-section-attributes p,
          .forge-print-page.layout-standard .forge-item-section-attributes li,
          .forge-print-page.layout-standard .forge-item-section-attack p,
          .forge-print-page.layout-standard .forge-item-section-attack li,
          .forge-print-page.layout-standard .forge-item-section-defence p,
          .forge-print-page.layout-standard .forge-item-section-defence li,
          .forge-print-page.layout-standard .forge-item-section-custom {
            font-size: 9.4px !important;
            line-height: 1.2 !important;
          }

          .forge-print-page.layout-standard .forge-item-section-attributes > *,
          .forge-print-page.layout-standard .forge-item-section-attack > *,
          .forge-print-page.layout-standard .forge-item-section-defence > * {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .forge-print-page.layout-standard .forge-item-section-attributes > * {
            -webkit-line-clamp: 13;
          }

          .forge-print-page.layout-standard .forge-item-section-attack > * {
            -webkit-line-clamp: 11;
          }

          .forge-print-page.layout-standard .forge-item-section-defence > * {
            -webkit-line-clamp: 9;
          }

          .forge-print-page.layout-standard .forge-item-section-custom {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 7;
            overflow: hidden;
          }

          .forge-print-page.layout-verbose .forge-item-section-attributes > * {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 26;
            overflow: hidden;
          }

          .forge-print-page.layout-verbose .forge-item-section-attack > * {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 22;
            overflow: hidden;
          }

          .forge-print-page.layout-verbose .forge-item-section-defence > * {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 18;
            overflow: hidden;
          }

          .forge-print-page.layout-verbose .forge-item-section-custom {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 14;
            overflow: hidden;
          }

          .forge-item-card {
            background: #ffffff !important;
            color: #111111 !important;
            border-color: #222222 !important;
          }

          .forge-item-card * {
            color: inherit !important;
          }
        }
      `}</style>
    </div>
  );
}
