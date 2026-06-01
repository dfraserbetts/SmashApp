"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CampaignOption = { id: string; name: string };
type CombatantOption = {
  id: string;
  name: string;
  level: number;
  tier?: string;
  powerCount: number;
  updatedAt: string;
};
type RosterPayload = {
  campaign: { id: string; name: string; descriptorVersionTag: string };
  characters: CombatantOption[];
  monsters: CombatantOption[];
};
type RunPayload = {
  campaign: { id: string; name: string };
  selectedCharacters: Array<{
    id: string;
    name: string;
    level: number;
    actionCount: number;
    actions: ActionSummary[];
  }>;
  selectedMonsters: Array<{
    id: string;
    name: string;
    level: number;
    tier: string | null;
    actionCount: number;
    actions: ActionSummary[];
  }>;
  hydrationWarnings: Array<{ actorId: string; actorName: string; field: string; message: string }>;
  report: {
    scenarioName: string;
    runs: number;
    playerWinRate: number;
    monsterWinRate: number;
    stalemateRate: number;
    averageRounds: number;
    averageWinnerHealthRemainingPercent: number;
    averageDamagePerRound: { players: number; monsters: number };
    averageProtectionPrevented: { players: number; monsters: number };
    averageDodgeAvoided: { players: number; monsters: number };
    unsupported: {
      unsupportedPowerCount: number;
      unsupportedPowerNames: string[];
      unsupportedEffectCount: number;
      reasons: Array<{ powerName: string; reason: string; packetIntention?: string | null }>;
    };
    hydrationIntegrity: {
      realCharacterCount: number;
      realMonsterCount: number;
      fallbackActionCount: number;
      unsupportedActionCount: number;
      unsupportedPowerCount: number;
      unsupportedEquipmentCount: number;
      unsupportedTraitCount: number;
      hydrationWarnings: string[];
      actors: Array<{
        id: string;
        name: string;
        source: string;
        actionCount: number;
        actions: ActionSummary[];
        fallbackActions: string[];
        unsupportedPowers: Array<{ powerName: string; reason: string }>;
        unsupportedEquipment: string[];
        unsupportedTraits: string[];
        warnings: string[];
      }>;
    };
    verdict: string;
  };
};

type ActionSummary = {
  id: string;
  name: string;
  sourceType: "naturalAttack" | "equippedWeapon" | "power" | "fallback";
  supported: boolean;
  targetCount?: number;
  rangeCategory?: "MELEE" | "RANGED" | "AOE" | null;
  unsupportedReasons?: string[];
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function toggleSelection(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
}

function actionLabel(action: ActionSummary): string {
  const source = action.sourceType === "fallback" ? "fallback" : action.sourceType;
  const range = action.rangeCategory ? ` ${action.rangeCategory.toLowerCase()}` : "";
  const targets = action.targetCount && action.targetCount > 1 ? `, ${action.targetCount} targets` : "";
  return `${action.name} (${source}${range}${targets}${action.supported ? "" : ", unsupported"})`;
}

async function readJson<T>(res: Response): Promise<T> {
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error ?? `Request failed (${res.status})`);
  }
  return payload;
}

export default function CombatLabPage() {
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [roster, setRoster] = useState<RosterPayload | null>(null);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [selectedMonsterIds, setSelectedMonsterIds] = useState<string[]>([]);
  const [runs, setRuns] = useState(50);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunPayload | null>(null);

  async function loadCampaigns() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", { cache: "no-store" });
      const data = await readJson<{ campaigns?: CampaignOption[] }>(res);
      const list = data.campaigns ?? [];
      setCampaigns(list);
      setCampaignId((current) => current || list[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  const loadRoster = useCallback(async (id = campaignId) => {
    if (!id) return;
    setError(null);
    setLoading(true);
    setRoster(null);
    setResult(null);
    setSelectedCharacterIds([]);
    setSelectedMonsterIds([]);
    try {
      const res = await fetch(`/api/combat-lab/campaign/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = await readJson<RosterPayload>(res);
      setRoster(data);
      setSelectedCharacterIds(data.characters.slice(0, 4).map((character) => character.id));
      setSelectedMonsterIds(data.monsters.slice(0, 1).map((monster) => monster.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign combatants");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  async function runSimulation() {
    setError(null);
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/combat-lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          characterIds: selectedCharacterIds,
          monsterIds: selectedMonsterIds,
          runs,
        }),
      });
      const data = await readJson<RunPayload>(res);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run combat simulation");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    void loadRoster(campaignId);
  }, [campaignId, loadRoster]);

  const canRun = useMemo(
    () => Boolean(campaignId && selectedCharacterIds.length > 0 && selectedMonsterIds.length > 0 && !running),
    [campaignId, running, selectedCharacterIds.length, selectedMonsterIds.length],
  );

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Combat Lab V1 Engine</h1>
          <p className="text-sm text-zinc-400">
            Campaign-data-first automated simulation. Select saved campaign characters and monsters, run the shared
            resolver, then edit the real source data and rerun.
          </p>
        </header>

        {error ? (
          <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-100">{error}</div>
        ) : null}

        <section className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Campaign</span>
              <select
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                disabled={loading}
              >
                <option value="">Select campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Batch runs</span>
              <input
                type="number"
                min={1}
                max={500}
                value={runs}
                onChange={(event) => setRuns(Math.max(1, Math.min(500, Number(event.target.value) || 1)))}
                className="w-32 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadRoster()}
              disabled={!campaignId || loading}
              className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Reload Data"}
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4">
            <h2 className="mb-3 text-lg font-semibold">Player Side: Campaign Characters</h2>
            {!roster || roster.characters.length === 0 ? (
              <p className="text-sm text-zinc-500">No campaign characters loaded.</p>
            ) : (
              <div className="space-y-2">
                {roster.characters.map((character) => (
                  <label key={character.id} className="flex gap-3 rounded border border-zinc-800 bg-zinc-950 p-3">
                    <input
                      type="checkbox"
                      checked={selectedCharacterIds.includes(character.id)}
                      onChange={() => setSelectedCharacterIds((current) => toggleSelection(current, character.id))}
                    />
                    <span>
                      <span className="block font-medium">{character.name}</span>
                      <span className="text-xs text-zinc-400">
                        Level {character.level} | powers {character.powerCount} | id {character.id}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4">
            <h2 className="mb-3 text-lg font-semibold">Monster Side: Campaign Monsters</h2>
            {!roster || roster.monsters.length === 0 ? (
              <p className="text-sm text-zinc-500">No campaign monsters loaded.</p>
            ) : (
              <div className="space-y-2">
                {roster.monsters.map((monster) => (
                  <label key={monster.id} className="flex gap-3 rounded border border-zinc-800 bg-zinc-950 p-3">
                    <input
                      type="checkbox"
                      checked={selectedMonsterIds.includes(monster.id)}
                      onChange={() => setSelectedMonsterIds((current) => toggleSelection(current, monster.id))}
                    />
                    <span>
                      <span className="block font-medium">{monster.name}</span>
                      <span className="text-xs text-zinc-400">
                        Level {monster.level} {monster.tier ?? ""} | powers {monster.powerCount} | id {monster.id}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void runSimulation()}
            disabled={!canRun}
            className="rounded border border-emerald-500 bg-emerald-950 px-8 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-900 disabled:opacity-50"
          >
            {running ? "Running..." : "GO / Run Simulation"}
          </button>
        </div>

        {result ? (
          <section className="space-y-4 rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <div>
              <h2 className="text-lg font-semibold">Report</h2>
              <p className="text-sm text-zinc-400">
                Campaign: {result.campaign.name} | Scenario: {result.report.scenarioName}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Player Win Rate</div>
                <div className="text-xl font-semibold">{pct(result.report.playerWinRate)}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Monster Win Rate</div>
                <div className="text-xl font-semibold">{pct(result.report.monsterWinRate)}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Average Rounds</div>
                <div className="text-xl font-semibold">{num(result.report.averageRounds)}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Verdict</div>
                <div className="text-sm font-semibold">{result.report.verdict}</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Real Actors</div>
                <div className="text-sm font-semibold">
                  Characters {result.report.hydrationIntegrity.realCharacterCount} / Monsters{" "}
                  {result.report.hydrationIntegrity.realMonsterCount}
                </div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Fallback Actions</div>
                <div className="text-xl font-semibold">{result.report.hydrationIntegrity.fallbackActionCount}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Unsupported Actions</div>
                <div className="text-xl font-semibold">{result.report.hydrationIntegrity.unsupportedActionCount}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Unsupported Equipment / Traits</div>
                <div className="text-sm font-semibold">
                  {result.report.hydrationIntegrity.unsupportedEquipmentCount} /{" "}
                  {result.report.hydrationIntegrity.unsupportedTraitCount}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
                <h3 className="mb-2 font-semibold">Selected Characters</h3>
                {result.selectedCharacters.map((character) => (
                  <div key={character.id} className="mb-3">
                    <div>
                      {character.name} | level {character.level} | actions {character.actionCount} | {character.id}
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                      {character.actions.map((action) => (
                        <li key={action.id}>{actionLabel(action)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
                <h3 className="mb-2 font-semibold">Selected Monsters</h3>
                {result.selectedMonsters.map((monster) => (
                  <div key={monster.id} className="mb-3">
                    <div>
                      {monster.name} | level {monster.level} {monster.tier ?? ""} | actions {monster.actionCount} | {monster.id}
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                      {monster.actions.map((action) => (
                        <li key={action.id}>{actionLabel(action)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Damage / Defence</h3>
              <p>
                Damage per round: players {num(result.report.averageDamagePerRound.players)}, monsters{" "}
                {num(result.report.averageDamagePerRound.monsters)}
              </p>
              <p>
                Protection prevented: players {num(result.report.averageProtectionPrevented.players)}, monsters{" "}
                {num(result.report.averageProtectionPrevented.monsters)}
              </p>
              <p>
                Dodge avoided: players {num(result.report.averageDodgeAvoided.players)}, monsters{" "}
                {num(result.report.averageDodgeAvoided.monsters)}
              </p>
            </div>

            <div className="rounded border border-amber-800 bg-amber-950/20 p-3 text-sm text-amber-100">
              <h3 className="mb-2 font-semibold">Unsupported / Fallbacks</h3>
              {result.hydrationWarnings.length === 0 &&
              result.report.unsupported.unsupportedPowerCount === 0 &&
              result.report.hydrationIntegrity.fallbackActionCount === 0 ? (
                <p>No unsupported campaign fields or powers were reported.</p>
              ) : (
                <div className="space-y-2">
                  {result.report.hydrationIntegrity.fallbackActionCount > 0 ? (
                    <p>
                      Fallback actions used: {result.report.hydrationIntegrity.fallbackActionCount}. Treat this
                      simulation as provisional for those actors.
                    </p>
                  ) : null}
                  {result.hydrationWarnings.map((warning) => (
                    <p key={`${warning.actorId}-${warning.field}`}>
                      {warning.actorName}: {warning.message}
                    </p>
                  ))}
                  {result.report.unsupported.reasons.map((reason, index) => (
                    <p key={`${reason.powerName}-${index}`}>
                      {reason.powerName}: {reason.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        <footer className="rounded border border-zinc-800 bg-zinc-900/30 p-3 text-xs text-zinc-500">
          Fixture diagnostics remain available with{" "}
          <span className="font-mono text-zinc-300">npx --yes tsx scripts/combatLab.smoke.ts</span>. The product
          workflow above uses real campaign data through server-authorized routes.
        </footer>
      </div>
    </main>
  );
}
