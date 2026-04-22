"use client";

// SC_COMBAT_LAB_PAGE_V01

import React, { useEffect, useMemo, useState } from "react";
import type { MonsterUpsertInput, DiceSize, MonsterSummary } from "@/lib/summoning/types";
import { normalizeMonsterUpsertInput } from "@/lib/summoning/validation";
import type { PlayerLabState } from "@/lib/summoning/engine/playerLabTypes";
import { adaptMonsterToCombatant, adaptPlayerToCombatant } from "@/lib/summoning/engine/adapters";
import { expectedDuel } from "@/lib/summoning/engine";

const DICE_OPTIONS: DiceSize[] = ["D4", "D6", "D8", "D10", "D12"];
const CAMPAIGNS_ENDPOINT = "/api/campaigns";

type CampaignOption = { id: string; name: string };

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse<T>(raw: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const v = JSON.parse(raw);
    return { ok: true, value: v as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Invalid JSON" };
  }
}

// SC_COMBAT_LAB_OUTCOME_LABELS
function fmtPct(x: number) {
  if (!Number.isFinite(x)) return "-";
  return `${(x * 100).toFixed(1)}%`;
}

function fmtNum(x: number, digits = 2) {
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(digits);
}

export default function CombatLabPage() {
  // -----------------------------
  // Player state (v0.1)
  // -----------------------------
  const [player, setPlayer] = useState<PlayerLabState>(() => ({
    id: "player-1",
    name: "Level 3 Player",
    level: 3,

    attackDie: "D8",
    guardDie: "D8",
    intellectDie: "D8",

    physicalHPMax: 20,
    mentalHPMax: 10,

    physicalProtection: 2,
    mentalProtection: 2,

    actionsPerTurn: 1,

    powers: [
      {
        id: "p-1",
        name: "Basic Strike",
        diceCount: 3,
        potency: 2,
        domain: "physical",
        intent: "attack",
      },
    ],
  }));

  // -----------------------------
  // Campaign monster loading (v0.1)
  // -----------------------------
  const [campaignId, setCampaignId] = useState<string>("");
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [monsterList, setMonsterList] = useState<MonsterSummary[]>([]);
  const [selectedMonsterId, setSelectedMonsterId] = useState<string>("");
  const [monsterLoadError, setMonsterLoadError] = useState<string | null>(null);
  const [monsterLoading, setMonsterLoading] = useState(false);
  const [showAdvancedMonsterJson, setShowAdvancedMonsterJson] = useState(false);

  // -----------------------------
  // Monster input (paste JSON)
  // -----------------------------
  const [monsterJson, setMonsterJson] = useState<string>(() => `{
  "level": 3,
  "physicalResilienceCurrent": 10,
  "physicalResilienceMax": 10,
  "mentalPerseveranceCurrent": 0,
  "mentalPerseveranceMax": 0,
  "physicalProtection": 2,
  "mentalProtection": 2,
  "attackDie": "D8",
  "guardDie": "D8",
  "intellectDie": "D8",
  "powers": [
    {
      "sortOrder": 1,
      "name": "Claw",
      "description": null,
      "diceCount": 2,
      "potency": 2,
      "durationType": "INSTANT",
      "durationTurns": null,
      "defenceRequirement": "PROTECTION",
      "cooldownTurns": 0,
      "cooldownReduction": 0,
      "responseRequired": false,
      "intentions": []
    }
  ],
  "attacks": [],
  "naturalAttack": null
}`);

  const loadCampaigns = async () => {
    setCampaignsError(null);
    setCampaignsLoading(true);
    try {
      const res = await fetch(CAMPAIGNS_ENDPOINT, { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as {
        campaigns?: CampaignOption[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to load campaigns");
      }

      const list = Array.isArray(payload.campaigns) ? payload.campaigns : [];
      setCampaignOptions(list);

      setCampaignId((prev) => {
        const current = prev.trim();
        if (current && list.some((c) => c.id === current)) return current;

        try {
          const stored = localStorage.getItem("sc:lastCampaignId")?.trim();
          if (stored && list.some((c) => c.id === stored)) return stored;
        } catch {
          // localStorage may be unavailable in privacy modes.
        }

        return list[0]?.id ?? "";
      });
    } catch (e: any) {
      setCampaignOptions([]);
      setCampaignsError(e?.message ?? "Failed to load campaigns");
    } finally {
      setCampaignsLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = campaignId.trim();
    if (!id) return;

    try {
      localStorage.setItem("sc:lastCampaignId", id);
    } catch {}

    setMonsterList([]);
    setSelectedMonsterId("");
  }, [campaignId]);

  // SC_COMBAT_LAB_LOAD_MONSTERS
  const loadMonsterSummaries = async () => {
    setMonsterLoadError(null);

    if (!campaignId.trim()) {
      setMonsterLoadError("Select a campaign first.");
      return;
    }

    setMonsterLoading(true);
    try {
      const res = await fetch(
        `/api/summoning-circle/monsters?campaignId=${encodeURIComponent(campaignId.trim())}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to load monsters");
      }

      const data = (await res.json()) as { monsters?: MonsterSummary[] };
      const list = (data.monsters ?? []).filter((m) => m.source === "CAMPAIGN" && !m.isReadOnly);

      setMonsterList(list);
      setSelectedMonsterId((prev) => (prev && list.some((m) => m.id === prev) ? prev : list[0]?.id ?? ""));
    } catch (e: any) {
      setMonsterLoadError(e?.message ?? "Failed to load monsters");
    } finally {
      setMonsterLoading(false);
    }
  };

  // SC_COMBAT_LAB_LOAD_MONSTER_DETAIL
  const loadMonsterDetailIntoJson = async (monsterId: string) => {
    setMonsterLoadError(null);

    if (!campaignId.trim()) {
      setMonsterLoadError("Select a campaign first.");
      return;
    }
    if (!monsterId) {
      setMonsterLoadError("Select a monster first.");
      return;
    }

    setMonsterLoading(true);
    try {
      const res = await fetch(
        `/api/summoning-circle/monsters/${monsterId}?campaignId=${encodeURIComponent(campaignId.trim())}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to load monster");
      }

      const raw = (await res.json()) as Record<string, unknown>;
      const normalizedInput = {
        ...raw,
        tags: Array.isArray(raw.tags)
          ? raw.tags.map((entry) => String((entry as { tag?: unknown }).tag ?? ""))
          : [],
      };

      const parsed = normalizeMonsterUpsertInput(normalizedInput);
      if (!parsed.ok) throw new Error(parsed.error);

      setMonsterJson(JSON.stringify(parsed.data, null, 2));
    } catch (e: any) {
      setMonsterLoadError(e?.message ?? "Failed to load monster");
    } finally {
      setMonsterLoading(false);
    }
  };

  const monsterParse = useMemo(() => safeJsonParse<MonsterUpsertInput>(monsterJson), [monsterJson]);

  const duel = useMemo(() => {
    if (!monsterParse.ok) return { ok: false as const, error: monsterParse.error };

    try {
      const playerPowerNameById = Object.fromEntries(player.powers.map((p) => [p.id, p.name || p.id]));

      const monsterPowerNameById = Object.fromEntries(
        (monsterParse.value.powers ?? []).map((p: any, idx: number) => {
          const id = String(p.id ?? `power-${idx}`);
          const name = String(p.name ?? p.attackName ?? id);
          return [id, name];
        }),
      );

      const monsterCombatant = adaptMonsterToCombatant(monsterParse.value);
      const playerCombatant = adaptPlayerToCombatant(player);
      const res = expectedDuel(playerCombatant, monsterCombatant, { successThreshold: 4 });

      // Also compute reverse (monster attacking player) for quick readability:
      const resReverse = expectedDuel(monsterCombatant, playerCombatant, { successThreshold: 4 });

      return {
        ok: true as const,
        res,
        resReverse,
        playerPowerNameById,
        monsterPowerNameById,
      };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Failed to compute duel" };
    }
  }, [monsterParse, player]);

  // -----------------------------
  // UI helpers
  // -----------------------------
  const updatePlayer = (patch: Partial<PlayerLabState>) => setPlayer((p) => ({ ...p, ...patch }));

  const updatePower = (idx: number, patch: Partial<PlayerLabState["powers"][number]>) => {
    setPlayer((p) => {
      const next = [...p.powers];
      const cur = next[idx];
      if (!cur) return p;
      next[idx] = { ...cur, ...patch };
      return { ...p, powers: next };
    });
  };

  const addPower = () => {
    setPlayer((p) => ({
      ...p,
      powers: [
        ...p.powers,
        {
          id: `p-${p.powers.length + 1}`,
          name: `Power ${p.powers.length + 1}`,
          diceCount: 2,
          potency: 2,
          domain: "physical",
          intent: "attack",
        },
      ],
    }));
  };

  const removePower = (idx: number) => {
    setPlayer((p) => ({ ...p, powers: p.powers.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Combat Lab</h1>
        <p className="text-sm text-zinc-400">
          v0.1 Expected-Value simulator (success on 4+). This is a calibration dashboard, not the final character
          builder.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* LEFT: Player */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Player</h2>
            <span className="text-xs text-zinc-500">SC_COMBAT_LAB_PLAYER</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Name</div>
              <input
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.name}
                onChange={(e) => updatePlayer({ name: e.target.value })}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Level</div>
              <input
                type="number"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.level}
                onChange={(e) => updatePlayer({ level: clampInt(Number(e.target.value), 1, 99) })}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Attack Die (accuracy)</div>
              <select
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.attackDie}
                onChange={(e) => updatePlayer({ attackDie: e.target.value as DiceSize })}
              >
                {DICE_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Actions / Turn</div>
              <input
                type="number"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.actionsPerTurn}
                onChange={(e) => updatePlayer({ actionsPerTurn: clampInt(Number(e.target.value), 1, 10) })}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Physical HP Max</div>
              <input
                type="number"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.physicalHPMax}
                onChange={(e) => updatePlayer({ physicalHPMax: clampInt(Number(e.target.value), 0, 9999) })}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Mental HP Max</div>
              <input
                type="number"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.mentalHPMax}
                onChange={(e) => updatePlayer({ mentalHPMax: clampInt(Number(e.target.value), 0, 9999) })}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Physical Protection</div>
              <input
                type="number"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.physicalProtection}
                onChange={(e) => updatePlayer({ physicalProtection: clampInt(Number(e.target.value), 0, 9999) })}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Mental Protection</div>
              <input
                type="number"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.mentalProtection}
                onChange={(e) => updatePlayer({ mentalProtection: clampInt(Number(e.target.value), 0, 9999) })}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Guard Die (for Dodge)</div>
              <select
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.guardDie}
                onChange={(e) => updatePlayer({ guardDie: e.target.value as DiceSize })}
              >
                {DICE_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-xs text-zinc-400">Intellect Die (for Dodge)</div>
              <select
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                value={player.intellectDie}
                onChange={(e) => updatePlayer({ intellectDie: e.target.value as DiceSize })}
              >
                {DICE_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Powers</h3>
              <button
                type="button"
                onClick={addPower}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs hover:bg-zinc-800"
              >
                + Add
              </button>
            </div>

            <div className="space-y-2">
              {player.powers.map((pw, idx) => (
                <div key={pw.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 text-sm"
                      value={pw.name}
                      onChange={(e) => updatePower(idx, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removePower(idx)}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-400">Dice Count</div>
                      <input
                        type="number"
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 text-sm"
                        value={pw.diceCount}
                        onChange={(e) => updatePower(idx, { diceCount: clampInt(Number(e.target.value), 0, 999) })}
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-400">Potency</div>
                      <input
                        type="number"
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 text-sm"
                        value={pw.potency}
                        onChange={(e) => updatePower(idx, { potency: clampNum(Number(e.target.value), 0, 9999) })}
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-400">Domain</div>
                      <select
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 text-sm"
                        value={pw.domain}
                        onChange={(e) => updatePower(idx, { domain: e.target.value as any })}
                      >
                        <option value="physical">physical</option>
                        <option value="mental">mental</option>
                      </select>
                    </label>

                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-400">Intent</div>
                      <select
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 text-sm"
                        value={pw.intent}
                        onChange={(e) => updatePower(idx, { intent: e.target.value as any })}
                      >
                        <option value="attack">attack</option>
                        <option value="defence">defence</option>
                        <option value="support">support</option>
                        <option value="control">control</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT: Monster */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Monster</h2>
            <span className="text-xs text-zinc-500">SC_COMBAT_LAB_MONSTER</span>
          </div>

          <p className="text-sm text-zinc-400">
            v0.1 supports campaign load (recommended) or JSON paste (fallback).
          </p>

          <div className="rounded-xl border border-zinc-800 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <label className="space-y-1 md:col-span-2">
                <div className="text-xs text-zinc-400">Campaign</div>
                <select
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  disabled={campaignsLoading}
                >
                  <option value="">(select campaign)</option>
                  {campaignOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={loadCampaigns}
                disabled={campaignsLoading}
                className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
                title="Reload campaigns"
              >
                {campaignsLoading ? "Loading..." : "â†»"}
              </button>

              <button
                type="button"
                onClick={loadMonsterSummaries}
                disabled={monsterLoading || !campaignId.trim()}
                className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
              >
                {monsterLoading ? "Loading..." : "Load Monsters"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="space-y-1 md:col-span-2">
                <div className="text-xs text-zinc-400">Campaign Monster</div>
                <select
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                  value={selectedMonsterId}
                  onChange={(e) => setSelectedMonsterId(e.target.value)}
                >
                  <option value="">(none)</option>
                  {monsterList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (Lv {m.level} {(m as MonsterSummary & { archetype?: string }).archetype ?? m.tier})
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => loadMonsterDetailIntoJson(selectedMonsterId)}
                disabled={monsterLoading || !selectedMonsterId}
                className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
              >
                {monsterLoading ? "Loading..." : "Load Selected"}
              </button>
            </div>

            {monsterLoadError ? (
              <div className="rounded-lg border border-red-900 bg-red-950/30 p-2 text-sm text-red-200">
                {monsterLoadError}
              </div>
            ) : null}
            {campaignsError ? (
              <div className="rounded-lg border border-red-900 bg-red-950/30 p-2 text-sm text-red-200">
                {campaignsError}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-400">Advanced</div>
            <button
              type="button"
              onClick={() => setShowAdvancedMonsterJson((v) => !v)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs hover:bg-zinc-800"
            >
              {showAdvancedMonsterJson ? "Hide JSON" : "Show JSON"}
            </button>
          </div>

          {showAdvancedMonsterJson ? (
            <>
              <label className="space-y-1 block">
                <div className="text-xs text-zinc-400">MonsterUpsertInput JSON</div>
                <textarea
                  className="w-full min-h-[320px] rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-xs font-mono"
                  value={monsterJson}
                  onChange={(e) => setMonsterJson(e.target.value)}
                  spellCheck={false}
                />
              </label>

              {!monsterParse.ok ? (
                <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
                  JSON parse error: {monsterParse.error}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-3 text-sm text-emerald-200">
                  Monster JSON looks valid (parsed).
                </div>
              )}
            </>
          ) : null}
        </section>
      </div>

      {/* OUTCOME */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Outcome</h2>
          <span className="text-xs text-zinc-500">SC_COMBAT_LAB_OUTCOME</span>
        </div>

        {!duel.ok ? (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
            Compute error: {duel.error}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Player -> Monster */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
              <div className="text-sm font-semibold">Player -&gt; Monster</div>

              <div className="text-sm text-zinc-300">
                Expected net wounds per turn (after dodge + protection, v0.1):{" "}
                <span className="font-mono">{fmtNum(duel.res.attacker.expectedNetWoundsPerTurn)}</span>
              </div>
              <div className="text-sm text-zinc-300">
                Monster total HP: <span className="font-mono">{duel.res.defender.totalHP.toFixed(0)}</span>
              </div>
              <div className="text-sm text-zinc-300">
                Expected turns to defeat monster:{" "}
                <span className="font-mono">
                  {Number.isFinite(duel.res.expectedTurnsToDefeatDefender)
                    ? duel.res.expectedTurnsToDefeatDefender.toFixed(2)
                    : "âˆž"}
                </span>
              </div>

              <div className="mt-2 text-xs text-zinc-400">Per power (expected + stability)</div>
              <div className="space-y-2">
                {duel.res.attacker.perPower.map((p) => (
                  <div key={p.powerId} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                    <div className="text-xs text-zinc-200 font-semibold">
                      {duel.playerPowerNameById[p.powerId] ?? p.powerId}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-zinc-400 mt-1">
                      <div title="Chance a single die succeeds (success on 4+).">
                        Success chance per die:{" "}
                        <span className="font-mono text-zinc-100">{fmtPct(p.stats.pSuccessPerDie)}</span>
                      </div>
                      <div title="Expected number of successes across all dice rolled.">
                        Expected successes: <span className="font-mono text-zinc-100">{fmtNum(p.stats.expectedSuccesses)}</span>
                      </div>
                      <div title="How swingy the roll is. Higher SD = more volatility.">
                        Swinginess (Std Dev):{" "}
                        <span className="font-mono text-zinc-100">{fmtNum(p.stats.stdDevSuccesses)}</span>
                      </div>
                      <div title="Chance to roll zero successes (the 'whiff' chance).">
                        Chance of 0 successes:{" "}
                        <span className="font-mono text-zinc-100">{fmtPct(p.stats.pZeroSuccesses)}</span>
                      </div>
                      <div title="Expected wounds before dodge/protection are applied.">
                        Expected raw wounds:{" "}
                        <span className="font-mono text-zinc-100">{fmtNum(p.stats.expectedRawWounds)}</span>
                      </div>
                      <div title="Expected wounds after dodge + protection are applied (v0.1 model).">
                        Expected net wounds:{" "}
                        <span className="font-mono text-zinc-100">{fmtNum(p.stats.expectedNetWounds)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monster -> Player */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
              <div className="text-sm font-semibold">Monster -&gt; Player</div>

              <div className="text-sm text-zinc-300">
                Expected net wounds per turn (after dodge + protection, v0.1):{" "}
                <span className="font-mono">{fmtNum(duel.resReverse.attacker.expectedNetWoundsPerTurn)}</span>
              </div>
              <div className="text-sm text-zinc-300">
                Player total HP: <span className="font-mono">{duel.resReverse.defender.totalHP.toFixed(0)}</span>
              </div>
              <div className="text-sm text-zinc-300">
                Expected turns to defeat player:{" "}
                <span className="font-mono">
                  {Number.isFinite(duel.resReverse.expectedTurnsToDefeatDefender)
                    ? duel.resReverse.expectedTurnsToDefeatDefender.toFixed(2)
                    : "âˆž"}
                </span>
              </div>

              <div className="mt-2 text-xs text-zinc-400">Per power (expected + stability)</div>
              <div className="space-y-2">
                {duel.resReverse.attacker.perPower.map((p) => (
                  <div key={p.powerId} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                    <div className="text-xs text-zinc-200 font-semibold">
                      {duel.monsterPowerNameById[p.powerId] ?? p.powerId}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-zinc-400 mt-1">
                      <div title="Chance a single die succeeds (success on 4+).">
                        Success chance per die:{" "}
                        <span className="font-mono text-zinc-100">{fmtPct(p.stats.pSuccessPerDie)}</span>
                      </div>
                      <div title="Expected number of successes across all dice rolled.">
                        Expected successes: <span className="font-mono text-zinc-100">{fmtNum(p.stats.expectedSuccesses)}</span>
                      </div>
                      <div title="How swingy the roll is. Higher SD = more volatility.">
                        Swinginess (Std Dev):{" "}
                        <span className="font-mono text-zinc-100">{fmtNum(p.stats.stdDevSuccesses)}</span>
                      </div>
                      <div title="Chance to roll zero successes (the 'whiff' chance).">
                        Chance of 0 successes:{" "}
                        <span className="font-mono text-zinc-100">{fmtPct(p.stats.pZeroSuccesses)}</span>
                      </div>
                      <div title="Expected wounds before dodge/protection are applied.">
                        Expected raw wounds:{" "}
                        <span className="font-mono text-zinc-100">{fmtNum(p.stats.expectedRawWounds)}</span>
                      </div>
                      <div title="Expected wounds after dodge + protection are applied (v0.1 model).">
                        Expected net wounds:{" "}
                        <span className="font-mono text-zinc-100">{fmtNum(p.stats.expectedNetWounds)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <footer className="text-xs text-zinc-500">
        v0.1 note: domain/intent mapping for MonsterPower is currently defaulted in the adapter. We&apos;ll map
        intentions properly in v0.2.
      </footer>
    </div>
  );
}

