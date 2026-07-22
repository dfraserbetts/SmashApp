"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CampaignOption = { id: string; name: string };
type CombatTurnOrder = "playersFirst" | "monstersFirst" | "alternatingByRound" | "randomSeeded";
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

const MONSTER_LEVEL_FILTER_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1);
type RunPayload = {
  campaign: { id: string; name: string };
  selectedCharacters: Array<{
    id: string;
    name: string;
    level: number;
    quantity: number;
    actionCount: number;
    actions: ActionSummary[];
  }>;
  selectedMonsters: Array<{
    id: string;
    name: string;
    level: number;
    tier: string | null;
    quantity: number;
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
    stoppedByBreakdown: {
      playersDefeated: number;
      monstersDefeated: number;
      maxRounds: number;
      stalemate: number;
    };
    averageRounds: number;
    averageWinnerHealthRemainingPercent: number;
    averageDamagePerRound: { players: number; monsters: number };
    averageProtectionPrevented: { players: number; monsters: number };
    averageDodgeAvoided: { players: number; monsters: number };
    averageMechanics: Record<string, { players: number; monsters: number }>;
    ongoingPressure: {
      convention: string;
      bySourceSide: Record<"players" | "monsters", {
        statusesCreated: number;
        storedTickAverage: number;
        storedTickMax: number;
        firstTicksApplied: number;
        firstTickDamageAverage: number;
        firstTickLethalCount: number;
        firstTickLethalRate: number;
        firstTickBeforeCleanup: number;
        cleanupAttempts: number;
        cleanupSuccesses: number;
        cleanupUnitsRemoved: number;
        cleanupWoundsRemoved: number;
        cleanupPreventedWoundsEstimate: number | null;
      }>;
      bySourceAction: Array<{
        sourceActorId: string;
        sourceActorName: string;
        sourceSide: "players" | "monsters";
        sourceActionId: string;
        sourceActionName: string;
        statusesCreated: number;
        averageStoredTick: number;
        maxStoredTick: number;
        firstTicksApplied: number;
        averageFirstTickDamage: number;
        firstTickLethalCount: number;
        firstTickLethalRate: number;
        ticksAppliedTotal: number;
        totalOngoingDamage: number;
        cleanupAttempts: number;
        cleanupSuccesses: number;
        cleanupUnitsRemoved: number;
        averageRemainingTicksAtCleanup: number;
        averageStoredTickRemoved: number;
        cleanupPreventedWoundsEstimate: number | null;
      }>;
    };
    defensivePools: {
      convention: string;
      unsupportedNotes: string[];
      bySourceSide: Record<"players" | "monsters", {
        poolsCreated: number;
        averageGeneratedPoints: number;
        committedPoints: number;
        spentPoints: number;
        wastedPoints: number;
        remainingAtExpiry: number;
        refreshReplaceEvents: number;
        expiredEmpty: number;
        expiredDuration: number;
        expiredFieldExit: number;
        expiredAttachmentEnd: number;
        expiredChannelEnd: number;
        expiredCleanse: number;
        expiredDefeatCleanup: number;
        dodgeAvoids: number;
        blockWoundsPrevented: number;
        resistUnitsCancelled: number;
      }>;
      bySourceAction: Array<{
        sourceActorId: string;
        sourceActorName: string;
        sourceSide: "players" | "monsters";
        sourceActionId: string;
        sourceActionName: string;
        poolType: string;
        poolsCreated: number;
        averageGeneratedPoints: number;
        committedPoints: number;
        spentPoints: number;
        wastedPoints: number;
        remainingAtExpiry: number;
        refreshReplaceEvents: number;
        expiredEmpty: number;
        expiredDuration: number;
        expiredCleanse: number;
        dodgeAvoids: number;
        blockWoundsPrevented: number;
        resistUnitsCancelled: number;
      }>;
    };
    unsupported: {
      unsupportedPowerCount: number;
      unsupportedPowerNames: string[];
      unsupportedEffectCount: number;
      reasons: Array<{ powerName: string; reason: string; packetIntention?: string | null }>;
    };
    hydrationIntegrity: {
      realCharacterCount: number;
      realMonsterCount: number;
      monsterInstanceCount: number;
      fallbackActionCount: number;
      unsupportedActionCount: number;
      unsupportedPowerCount: number;
      unsupportedEquipmentCount: number;
      unsupportedTraitCount: number;
      ignoredTraitCount: number;
      unsupportedCombatTraitCount: number;
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
        ignoredTraits: string[];
        unsupportedCombatTraits: string[];
        warnings: string[];
      }>;
    };
    actorContributions: Array<{
      actorId: string;
      actorName: string;
      baseActorId?: string;
      instanceIndex?: number;
      displayGroupName?: string;
      side: "players" | "monsters";
      role: string;
      actionsUsed: number;
      damage: number;
      healing: number;
      healingOverTimeApplied: number;
      healingTicks: number;
      mitigation: number;
      counterUses: number;
      counterDamage: number;
      counterMitigation: number;
      buffApplications: number;
      buffUptime: number;
      debuffApplications: number;
      debuffUptime: number;
      controlTurnsApplied: number;
      actionsDenied: number;
      ongoingDamageApplied: number;
      ongoingDamageTicks: number;
      topActionName: string | null;
      actionContributions: Array<{
        actionId: string;
        actionName: string;
        kind: string;
        uses: number;
        damage: number;
        healing: number;
        healingOverTimeApplied: number;
        healingTicks: number;
        mitigation: number;
        counterUses: number;
        counterDamage: number;
        counterMitigation: number;
        buffApplications: number;
        buffUptime: number;
        debuffApplications: number;
        debuffUptime: number;
        controlTurnsApplied: number;
        actionsDenied: number;
        ongoingDamageApplied: number;
        ongoingDamageTicks: number;
        linkedActionCount: number;
      }>;
    }>;
    monsterGroupContributions: Array<{
      baseActorId: string;
      displayGroupName: string;
      quantity: number;
      survivors: number;
      defeated: number;
      actionsUsed: number;
      damage: number;
      healing: number;
      mitigation: number;
      controlTurnsApplied: number;
      ongoingDamageApplied: number;
      averageDamagePerInstance: number;
    }>;
    defensiveContributions: Array<{
      actorId: string;
      actorName: string;
      side: "players" | "monsters";
      role: string;
      attacksDefended: number;
      woundsDodged: number;
      defenceStringBlocked: number;
      staticProtectionPrevented: number;
      buffedDefenceRolls: number;
      debuffedDefenceRolls: number;
      buffedResistRolls: number;
      debuffedResistRolls: number;
      counterUses: number;
      counterDamage: number;
      counterMitigation: number;
      responsesUsed: number;
      netDamageTaken: number;
    }>;
    cooldownTrace: Array<{
      actorId: string;
      actorName: string;
      side: "players" | "monsters";
      actionId: string;
      actionName: string;
      sourceType: string;
      isCounter: boolean;
      cooldownRounds: number;
      uses: number;
      attemptedUsesWhileOnCooldown: number;
      preventedByCooldown: number;
      cooldownApplied: number;
      cooldownTicks: number;
      availableTurns: number;
      unavailableTurns: number;
    }>;
    counterCandidateDiagnostics: Array<{
      actorId: string;
      actorName: string;
      side: "players" | "monsters";
      actionId: string;
      actionName: string;
      sourceType: string;
      considered: number;
      selected: number;
      skippedNormalDefenceBetter: number;
      skippedNoResponse: number;
      skippedCooldown: number;
      skippedUnsupported: number;
      skippedNonAvoidable: number;
      skippedNonApplicable: number;
      totalExpectedCounterPrevention: number;
      totalExpectedNormalPrevention: number;
      expectedSamples: number;
      lastReason?: string | null;
    }>;
    firstRunTranscript?: {
      runIndex: number;
      scenarioName: string;
      truncated: boolean;
      lines: string[];
      events: Array<{
        id: string;
        type: string;
        round: number;
        actorId?: string;
        actorName?: string;
        targetId?: string;
        targetName?: string;
        message: string;
      }>;
    };
    verdict: string;
  };
};

type ActionSummary = {
  id: string;
  name: string;
  sourceType: "naturalAttack" | "equippedWeapon" | "power" | "signatureMove" | "fallback";
  supported: boolean;
  kind?: string;
  targetCount?: number;
  rangeCategory?: "MELEE" | "RANGED" | "AOE" | null;
  abstractionNotes?: string[];
  secondaryActionCount?: number;
  secondaryActions?: Array<{
    id: string;
    name: string;
    kind?: string;
    targetCount?: number;
    rangeCategory?: "MELEE" | "RANGED" | "AOE" | null;
  }>;
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

function toggleNumberSelection(current: number[], value: number): number[] {
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value].sort((a, b) => a - b);
}

function clampCombatantQuantity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(30, Math.trunc(parsed)));
}

function actionLabel(action: ActionSummary): string {
  const source = action.sourceType === "fallback" ? "fallback" : action.sourceType;
  const range = action.rangeCategory ? ` ${action.rangeCategory.toLowerCase()}` : "";
  const targets = action.targetCount && action.targetCount > 1 ? `, ${action.targetCount} targets` : "";
  const linked = action.secondaryActionCount ? `, ${action.secondaryActionCount} linked` : "";
  return `${action.name} (${action.kind ?? source}${range}${targets}${linked}${action.supported ? "" : ", unsupported"})`;
}

const TRANSCRIPT_ACTOR_COLOURS = [
  "text-white",
  "text-sky-300",
  "text-emerald-300",
  "text-yellow-300",
  "text-rose-300",
  "text-fuchsia-300",
  "text-orange-300",
  "text-cyan-200",
  "text-lime-300",
  "text-violet-300",
];

type TranscriptEvent = NonNullable<RunPayload["report"]["firstRunTranscript"]>["events"][number];

function splitTranscriptTargets(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildTranscriptActorColours(events: TranscriptEvent[]): Map<string, string> {
  const actorColours = new Map<string, string>();

  function addActorName(name?: string) {
    if (!name || actorColours.has(name)) return;
    actorColours.set(name, TRANSCRIPT_ACTOR_COLOURS[actorColours.size % TRANSCRIPT_ACTOR_COLOURS.length]);
  }

  for (const event of events) {
    addActorName(event.actorName);
    for (const targetName of splitTranscriptTargets(event.targetName)) {
      addActorName(targetName);
    }
  }

  return actorColours;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderTranscriptMessage(message: string, actorColours: Map<string, string>) {
  const actorNames = [...actorColours.keys()]
    .filter((name) => message.includes(name))
    .sort((a, b) => b.length - a.length);

  if (actorNames.length === 0) return message;

  const matcher = new RegExp(`(${actorNames.map(escapeRegExp).join("|")})`, "g");
  return message.split(matcher).map((part, index) => {
    const colourClass = actorColours.get(part);
    return colourClass ? (
      <span key={`${part}-${index}`} className={`${colourClass} font-semibold`}>
        {part}
      </span>
    ) : (
      part
    );
  });
}

function CombatTranscriptView({
  transcript,
}: {
  transcript?: RunPayload["report"]["firstRunTranscript"];
}) {
  if (!transcript || transcript.lines.length === 0) {
    return <p className="text-zinc-500">No first-run transcript was captured.</p>;
  }

  const actorColours = buildTranscriptActorColours(transcript.events);
  const transcriptEntries =
    transcript.events.length > 0
      ? transcript.events
      : transcript.lines.map((message, index) => ({
          id: `transcript-line-${index}`,
          type: "line",
          round: 0,
          message,
        }));

  return (
    <div className="space-y-2">
      {actorColours.size > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {[...actorColours.entries()].map(([actorName, colourClass]) => (
            <span key={actorName} className={`${colourClass} font-semibold`}>
              {actorName}
            </span>
          ))}
        </div>
      ) : null}
      <div className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-black p-3 font-mono text-xs leading-relaxed text-zinc-200">
        {transcriptEntries.map((event) => (
          <div key={event.id}>{renderTranscriptMessage(event.message, actorColours)}</div>
        ))}
      </div>
    </div>
  );
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
  const [characterQuantities, setCharacterQuantities] = useState<Record<string, number>>({});
  const [selectedMonsterIds, setSelectedMonsterIds] = useState<string[]>([]);
  const [monsterQuantities, setMonsterQuantities] = useState<Record<string, number>>({});
  const [selectedMonsterLevels, setSelectedMonsterLevels] = useState<number[]>([]);
  const [monsterLevelFilterOpen, setMonsterLevelFilterOpen] = useState(false);
  const [runs, setRuns] = useState(50);
  const [turnOrder, setTurnOrder] = useState<CombatTurnOrder>("alternatingByRound");
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
    setCharacterQuantities({});
    setSelectedMonsterIds([]);
    setMonsterQuantities({});
    setSelectedMonsterLevels([]);
    setMonsterLevelFilterOpen(false);
    try {
      const res = await fetch(`/api/combat-lab/campaign/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = await readJson<RosterPayload>(res);
      setRoster(data);
      setSelectedCharacterIds(data.characters.slice(0, 4).map((character) => character.id));
      setCharacterQuantities(
        Object.fromEntries(data.characters.map((character) => [character.id, 1])),
      );
      setSelectedMonsterIds(data.monsters.slice(0, 1).map((monster) => monster.id));
      setMonsterQuantities(
        Object.fromEntries(data.monsters.map((monster) => [monster.id, 1])),
      );
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
          characters: selectedCharacterIds.map((characterId) => ({
            characterId,
            quantity: clampCombatantQuantity(characterQuantities[characterId] ?? 1),
          })),
          monsters: selectedMonsterIds.map((monsterId) => ({
            monsterId,
            quantity: clampCombatantQuantity(monsterQuantities[monsterId] ?? 1),
          })),
          runs,
          turnOrder,
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

  const selectedMonsterInstanceCount = useMemo(
    () =>
      selectedMonsterIds.reduce(
        (sum, monsterId) => sum + clampCombatantQuantity(monsterQuantities[monsterId] ?? 1),
        0,
      ),
    [monsterQuantities, selectedMonsterIds],
  );

  const selectedCharacterInstanceCount = useMemo(
    () =>
      selectedCharacterIds.reduce(
        (sum, characterId) => sum + clampCombatantQuantity(characterQuantities[characterId] ?? 1),
        0,
      ),
    [characterQuantities, selectedCharacterIds],
  );

  const filteredMonsters = useMemo(() => {
    const monsters = roster?.monsters ?? [];
    if (selectedMonsterLevels.length === 0) return monsters;
    const allowedLevels = new Set(selectedMonsterLevels);
    return monsters.filter((monster) => allowedLevels.has(monster.level));
  }, [roster?.monsters, selectedMonsterLevels]);

  useEffect(() => {
    if (!roster || selectedMonsterLevels.length === 0) return;
    const visibleMonsterIds = new Set(filteredMonsters.map((monster) => monster.id));
    setSelectedMonsterIds((current) => current.filter((id) => visibleMonsterIds.has(id)));
  }, [filteredMonsters, roster, selectedMonsterLevels.length]);

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
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
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
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Turn order</span>
              <select
                value={turnOrder}
                onChange={(event) => setTurnOrder(event.target.value as CombatTurnOrder)}
                className="w-48 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              >
                <option value="alternatingByRound">Alternating by Round</option>
                <option value="playersFirst">Players First</option>
                <option value="monstersFirst">Monsters First</option>
                <option value="randomSeeded">Seeded Random Side</option>
              </select>
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
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Player Side: Campaign Characters</h2>
              <p className="text-xs text-zinc-500">Selected instances {selectedCharacterInstanceCount}</p>
            </div>
            {!roster || roster.characters.length === 0 ? (
              <p className="text-sm text-zinc-500">No campaign characters loaded.</p>
            ) : (
              <div className="space-y-2">
                {roster.characters.map((character) => {
                  const selected = selectedCharacterIds.includes(character.id);
                  const quantity = clampCombatantQuantity(characterQuantities[character.id] ?? 1);
                  return (
                    <div
                      key={character.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-950 p-3"
                    >
                      <label className="flex min-w-0 flex-1 gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setSelectedCharacterIds((current) => toggleSelection(current, character.id));
                            setCharacterQuantities((current) => ({
                              ...current,
                              [character.id]: clampCombatantQuantity(current[character.id] ?? 1),
                            }));
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {character.name}
                            {selected ? ` x${quantity}` : ""}
                          </span>
                          <span className="text-xs text-zinc-400">
                            Level {character.level} | powers {character.powerCount} | id {character.id}
                          </span>
                        </span>
                      </label>
                      <div className="flex items-center gap-1" aria-label={`${character.name} quantity`}>
                        <button
                          type="button"
                          disabled={!selected}
                          onClick={() =>
                            setCharacterQuantities((current) => ({
                              ...current,
                              [character.id]: clampCombatantQuantity(quantity - 1),
                            }))
                          }
                          className="h-8 w-8 rounded border border-zinc-700 text-sm hover:bg-zinc-800 disabled:opacity-40"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          disabled={!selected}
                          value={quantity}
                          onChange={(event) =>
                            setCharacterQuantities((current) => ({
                              ...current,
                              [character.id]: clampCombatantQuantity(event.target.value),
                            }))
                          }
                          className="h-8 w-16 rounded border border-zinc-700 bg-zinc-950 px-2 text-center text-sm disabled:opacity-40"
                        />
                        <button
                          type="button"
                          disabled={!selected}
                          onClick={() =>
                            setCharacterQuantities((current) => ({
                              ...current,
                              [character.id]: clampCombatantQuantity(quantity + 1),
                            }))
                          }
                          className="h-8 w-8 rounded border border-zinc-700 text-sm hover:bg-zinc-800 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Monster Side: Campaign Monsters</h2>
                <p className="text-xs text-zinc-500">
                  Showing {filteredMonsters.length} of {roster?.monsters.length ?? 0} | selected instances{" "}
                  {selectedMonsterInstanceCount}
                </p>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMonsterLevelFilterOpen((current) => !current)}
                  className={[
                    "rounded border px-3 py-2 text-sm",
                    monsterLevelFilterOpen || selectedMonsterLevels.length > 0
                      ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                      : "border-zinc-700 hover:bg-zinc-800",
                  ].join(" ")}
                >
                  Level Filter{selectedMonsterLevels.length > 0 ? ` (${selectedMonsterLevels.length})` : ""}
                </button>

                {monsterLevelFilterOpen ? (
                  <div className="absolute right-0 z-40 mt-1 w-72 max-w-[90vw] space-y-3 rounded border border-zinc-800 bg-zinc-950/95 p-3 shadow-lg">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-wide text-zinc-500">Monster Level</p>
                      {selectedMonsterLevels.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setSelectedMonsterLevels([])}
                          className="text-xs text-zinc-400 hover:text-zinc-100"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedMonsterLevels([])}
                        className={[
                          "rounded border px-2 py-1 text-xs",
                          selectedMonsterLevels.length === 0
                            ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                            : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800",
                        ].join(" ")}
                      >
                        All
                      </button>
                      {MONSTER_LEVEL_FILTER_OPTIONS.map((level) => {
                        const selected = selectedMonsterLevels.includes(level);
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() =>
                              setSelectedMonsterLevels((current) => toggleNumberSelection(current, level))
                            }
                            className={[
                              "rounded border px-2 py-1 text-xs",
                              selected
                                ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800",
                            ].join(" ")}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {!roster || roster.monsters.length === 0 ? (
              <p className="text-sm text-zinc-500">No campaign monsters loaded.</p>
            ) : filteredMonsters.length === 0 ? (
              <p className="text-sm text-zinc-500">No campaign monsters match the selected level filter.</p>
            ) : (
              <div className="space-y-2">
                {filteredMonsters.map((monster) => {
                  const selected = selectedMonsterIds.includes(monster.id);
                  const quantity = clampCombatantQuantity(monsterQuantities[monster.id] ?? 1);
                  return (
                    <div
                      key={monster.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-950 p-3"
                    >
                      <label className="flex min-w-0 flex-1 gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setSelectedMonsterIds((current) => toggleSelection(current, monster.id));
                            setMonsterQuantities((current) => ({
                              ...current,
                              [monster.id]: clampCombatantQuantity(current[monster.id] ?? 1),
                            }));
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {monster.name}
                            {selected ? ` x${quantity}` : ""}
                          </span>
                          <span className="text-xs text-zinc-400">
                            Level {monster.level} {monster.tier ?? ""} | powers {monster.powerCount} | id {monster.id}
                          </span>
                        </span>
                      </label>
                      <div className="flex items-center gap-1" aria-label={`${monster.name} quantity`}>
                        <button
                          type="button"
                          disabled={!selected}
                          onClick={() =>
                            setMonsterQuantities((current) => ({
                              ...current,
                              [monster.id]: clampCombatantQuantity(quantity - 1),
                            }))
                          }
                          className="h-8 w-8 rounded border border-zinc-700 text-sm hover:bg-zinc-800 disabled:opacity-40"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          disabled={!selected}
                          value={quantity}
                          onChange={(event) =>
                            setMonsterQuantities((current) => ({
                              ...current,
                              [monster.id]: clampCombatantQuantity(event.target.value),
                            }))
                          }
                          className="h-8 w-16 rounded border border-zinc-700 bg-zinc-950 px-2 text-center text-sm disabled:opacity-40"
                        />
                        <button
                          type="button"
                          disabled={!selected}
                          onClick={() =>
                            setMonsterQuantities((current) => ({
                              ...current,
                              [monster.id]: clampCombatantQuantity(quantity + 1),
                            }))
                          }
                          className="h-8 w-8 rounded border border-zinc-700 text-sm hover:bg-zinc-800 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
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

            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Player Win Rate</div>
                <div className="text-xl font-semibold">{pct(result.report.playerWinRate)}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Monster Win Rate</div>
                <div className="text-xl font-semibold">{pct(result.report.monsterWinRate)}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Stalemate Rate</div>
                <div className="text-xl font-semibold">{pct(result.report.stalemateRate)}</div>
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

            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Stopped Reason Breakdown</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  <span className="text-zinc-500">Players defeated:</span>{" "}
                  {pct(result.report.stoppedByBreakdown.playersDefeated)}
                </p>
                <p>
                  <span className="text-zinc-500">Monsters defeated:</span>{" "}
                  {pct(result.report.stoppedByBreakdown.monstersDefeated)}
                </p>
                <p>
                  <span className="text-zinc-500">Max rounds:</span>{" "}
                  {pct(result.report.stoppedByBreakdown.maxRounds)}
                </p>
                <p>
                  <span className="text-zinc-500">Stalemate:</span>{" "}
                  {pct(result.report.stoppedByBreakdown.stalemate)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Real Actors</div>
                <div className="text-sm font-semibold">
                  Characters {result.report.hydrationIntegrity.realCharacterCount} / Monsters{" "}
                  {result.report.hydrationIntegrity.realMonsterCount}
                </div>
                <div className="text-xs text-zinc-400">
                  Monster instances {result.report.hydrationIntegrity.monsterInstanceCount}
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
                <div className="text-xs text-zinc-500">Unsupported Equipment / Combat Traits</div>
                <div className="text-sm font-semibold">
                  {result.report.hydrationIntegrity.unsupportedEquipmentCount} /{" "}
                  {result.report.hydrationIntegrity.unsupportedCombatTraitCount}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
                <h3 className="mb-2 font-semibold">Selected Characters</h3>
                {result.selectedCharacters.map((character) => (
                  <div key={character.id} className="mb-3">
                    <div>
                      {character.name} x{character.quantity} | level {character.level} | actions {character.actionCount} | {character.id}
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                      {character.actions.map((action) => (
                        <li key={action.id}>
                          {actionLabel(action)}
                          {action.secondaryActions && action.secondaryActions.length > 0 ? (
                            <ul className="mt-1 list-disc pl-5">
                              {action.secondaryActions.map((secondaryAction) => (
                                <li key={secondaryAction.id}>
                                  linked: {secondaryAction.name} ({secondaryAction.kind})
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
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
                      {monster.name} x{monster.quantity} | level {monster.level} {monster.tier ?? ""} | actions{" "}
                      {monster.actionCount} | {monster.id}
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                      {monster.actions.map((action) => (
                        <li key={action.id}>
                          {actionLabel(action)}
                          {action.secondaryActions && action.secondaryActions.length > 0 ? (
                            <ul className="mt-1 list-disc pl-5">
                              {action.secondaryActions.map((secondaryAction) => (
                                <li key={secondaryAction.id}>
                                  linked: {secondaryAction.name} ({secondaryAction.kind})
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
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

            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Supported Mechanics</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Main actions", result.report.averageMechanics.mainActionsUsed],
                  ["Power actions", result.report.averageMechanics.powerActionsUsed],
                  ["Second weapon attacks", result.report.averageMechanics.secondWeaponAttacksUsed],
                  ["Skipped power actions", result.report.averageMechanics.skippedPowerActions],
                  ["Control turns", result.report.averageMechanics.controlTurnsApplied],
                  ["Actions denied", result.report.averageMechanics.actionsDenied],
                  ["Forced movement", result.report.averageMechanics.forcedMovementApplied],
                  ["Dodge chosen", result.report.averageMechanics.dodgeChosen],
                  ["Dodge rolls", result.report.averageMechanics.dodgeRolls],
                  ["Dodge degradation", result.report.averageMechanics.dodgeDegradationApplied],
                  ["Physical defence chosen", result.report.averageMechanics.physicalDefenceChosen],
                  ["Physical defence rolls", result.report.averageMechanics.physicalDefenceRolls],
                  ["Physical defence degradation", result.report.averageMechanics.physicalDefenceDegradationApplied],
                  ["Mental defence chosen", result.report.averageMechanics.mentalDefenceChosen],
                  ["Mental defence rolls", result.report.averageMechanics.mentalDefenceRolls],
                  ["Mental defence degradation", result.report.averageMechanics.mentalDefenceDegradationApplied],
                  ["Defence choice EV", result.report.averageMechanics.defenceChoiceExpectedValue],
                  ["Defence string blocked", result.report.averageMechanics.defenceStringBlocked],
                  ["Static protection prevented", result.report.averageMechanics.staticProtectionPrevented],
                  ["Resist rolls", result.report.averageMechanics.resistRolls],
                  ["Resist successes", result.report.averageMechanics.resistSuccesses],
                  ["Resist cancelled successes", result.report.averageMechanics.hostileSuccessesCancelledByResist],
                  ["Buff applications", result.report.averageMechanics.buffApplications],
                  ["Buffed actions", result.report.averageMechanics.buffedActions],
                  ["Buffed defence rolls", result.report.averageMechanics.buffedDefenceRolls],
                  ["Buffed resist rolls", result.report.averageMechanics.buffedResistRolls],
                  ["Debuff applications", result.report.averageMechanics.debuffApplications],
                  ["Debuffed actions", result.report.averageMechanics.debuffedActions],
                  ["Debuffed defence rolls", result.report.averageMechanics.debuffedDefenceRolls],
                  ["Debuffed resist rolls", result.report.averageMechanics.debuffedResistRolls],
                  ["Healing over time", result.report.averageMechanics.healingOverTimeApplied],
                  ["Healing ticks", result.report.averageMechanics.healingTicks],
                  ["Ongoing damage", result.report.averageMechanics.ongoingDamageApplied],
                  ["Ongoing damage units", result.report.averageMechanics.ongoingDamageUnitsApplied],
                  ["Ongoing damage ticks", result.report.averageMechanics.ongoingDamageTicks],
                  ["Ongoing cleansed", result.report.averageMechanics.ongoingDamagePreventedOrCleansed],
                  ["Counter uses", result.report.averageMechanics.counterUses],
                  ["Counter chosen", result.report.averageMechanics.counterChosen],
                  ["Counter damage", result.report.averageMechanics.counterDamage],
                  ["Counter mitigation", result.report.averageMechanics.counterMitigation],
                  ["Responses used", result.report.averageMechanics.responsesUsed],
                  ["Responses unavailable", result.report.averageMechanics.responsesWastedOrUnavailable],
                  ["Passive defence", result.report.averageMechanics.passiveDefenceContribution],
                  ["Stacks applied", result.report.averageMechanics.stacksApplied],
                  ["Stacks expired", result.report.averageMechanics.stacksExpired],
                  ["Stacks cleansed", result.report.averageMechanics.stacksCleansed],
                  ["AOE action uses", result.report.averageMechanics.aoeActionUses],
                  ["AOE potential targets", result.report.averageMechanics.aoePotentialTargets],
                  ["AOE actual targets/action", result.report.averageMechanics.aoeActualTargets],
                  ["Position abstractions", result.report.averageMechanics.positionalAbstractionsUsed],
                ].map(([label, values]) => (
                  <p key={label as string}>
                    <span className="text-zinc-500">{label as string}:</span>{" "}
                    players {num((values as { players: number; monsters: number }).players)}, monsters{" "}
                    {num((values as { players: number; monsters: number }).monsters)}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded border border-amber-700/70 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Ongoing Pressure Diagnostics</h3>
              <p className="mb-3 text-xs text-zinc-400">{result.report.ongoingPressure.convention}</p>
              <div className="grid gap-2 md:grid-cols-2">
                {(["players", "monsters"] as const).map((side) => {
                  const summary = result.report.ongoingPressure.bySourceSide[side];
                  return (
                    <div key={side} className="rounded border border-zinc-800 p-2">
                      <div className="font-semibold capitalize">{side}</div>
                      <p className="text-xs text-zinc-400">
                        statuses {num(summary.statusesCreated)}, avg stored tick{" "}
                        {num(summary.storedTickAverage)}, max stored tick {num(summary.storedTickMax)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        first ticks {num(summary.firstTicksApplied)}, avg first tick{" "}
                        {num(summary.firstTickDamageAverage)}, first-tick lethal{" "}
                        {num(summary.firstTickLethalCount)} ({pct(summary.firstTickLethalRate)})
                      </p>
                      <p className="text-xs text-zinc-400">
                        before cleanup {num(summary.firstTickBeforeCleanup)}, cleanup attempts{" "}
                        {num(summary.cleanupAttempts)}, successes {num(summary.cleanupSuccesses)}, units removed{" "}
                        {num(summary.cleanupUnitsRemoved)}
                        {summary.cleanupPreventedWoundsEstimate === null
                          ? ""
                          : `, prevented estimate ${num(summary.cleanupPreventedWoundsEstimate)}`}
                      </p>
                    </div>
                  );
                })}
              </div>
              {result.report.ongoingPressure.bySourceAction.length === 0 ? (
                <p className="mt-3 text-zinc-500">No ongoing damage pressure was recorded.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {result.report.ongoingPressure.bySourceAction.map((entry) => (
                    <div
                      key={`${entry.sourceActorId}:${entry.sourceActionId}`}
                      className="rounded border border-zinc-800 p-2"
                    >
                      <div className="font-semibold">
                        {entry.sourceActionName} | {entry.sourceActorName} ({entry.sourceSide})
                      </div>
                      <p className="text-xs text-zinc-400">
                        statuses {num(entry.statusesCreated)}, avg stored tick{" "}
                        {num(entry.averageStoredTick)}, max stored tick {num(entry.maxStoredTick)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        first ticks {num(entry.firstTicksApplied)}, avg first tick{" "}
                        {num(entry.averageFirstTickDamage)}, first-tick lethal{" "}
                        {num(entry.firstTickLethalCount)} ({pct(entry.firstTickLethalRate)})
                      </p>
                      <p className="text-xs text-zinc-400">
                        ticks total {num(entry.ticksAppliedTotal)}, total ongoing damage{" "}
                        {num(entry.totalOngoingDamage)}, cleanup attempts {num(entry.cleanupAttempts)}, cleanup successes{" "}
                        {num(entry.cleanupSuccesses)}, units removed {num(entry.cleanupUnitsRemoved)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        avg remaining ticks at cleanup {num(entry.averageRemainingTicksAtCleanup)}, avg stored tick removed{" "}
                        {num(entry.averageStoredTickRemoved)}
                        {entry.cleanupPreventedWoundsEstimate === null
                          ? ""
                          : `, prevented estimate ${num(entry.cleanupPreventedWoundsEstimate)}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded border border-cyan-700/70 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Defensive Pool Diagnostics</h3>
              <p className="mb-2 text-xs text-zinc-400">{result.report.defensivePools.convention}</p>
              {result.report.defensivePools.unsupportedNotes.map((note) => (
                <p key={note} className="mb-2 text-xs text-amber-300">{note}</p>
              ))}
              <div className="grid gap-2 md:grid-cols-2">
                {(["players", "monsters"] as const).map((side) => {
                  const summary = result.report.defensivePools.bySourceSide[side];
                  return (
                    <div key={side} className="rounded border border-zinc-800 p-2">
                      <div className="font-semibold capitalize">{side}</div>
                      <p className="text-xs text-zinc-400">
                        pools {num(summary.poolsCreated)}, avg generated {num(summary.averageGeneratedPoints)}, refreshed{" "}
                        {num(summary.refreshReplaceEvents)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        committed {num(summary.committedPoints)}, spent {num(summary.spentPoints)}, wasted{" "}
                        {num(summary.wastedPoints)}, expired remaining {num(summary.remainingAtExpiry)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        dodge avoids {num(summary.dodgeAvoids)}, block prevented {num(summary.blockWoundsPrevented)}, resist cancelled{" "}
                        {num(summary.resistUnitsCancelled)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        expired empty {num(summary.expiredEmpty)}, duration {num(summary.expiredDuration)}, cleanse{" "}
                        {num(summary.expiredCleanse)}
                      </p>
                    </div>
                  );
                })}
              </div>
              {result.report.defensivePools.bySourceAction.length === 0 ? (
                <p className="mt-3 text-zinc-500">No defensive pools were created.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {result.report.defensivePools.bySourceAction.map((entry) => (
                    <div
                      key={`${entry.sourceActorId}:${entry.sourceActionId}:${entry.poolType}`}
                      className="rounded border border-zinc-800 p-2"
                    >
                      <div className="font-semibold">
                        {entry.sourceActionName} | {entry.sourceActorName} ({entry.sourceSide}) | {entry.poolType}
                      </div>
                      <p className="text-xs text-zinc-400">
                        pools {num(entry.poolsCreated)}, avg generated {num(entry.averageGeneratedPoints)}, refreshed{" "}
                        {num(entry.refreshReplaceEvents)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        committed {num(entry.committedPoints)}, spent {num(entry.spentPoints)}, wasted{" "}
                        {num(entry.wastedPoints)}, expired remaining {num(entry.remainingAtExpiry)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        dodge avoids {num(entry.dodgeAvoids)}, block prevented {num(entry.blockWoundsPrevented)}, resist cancelled{" "}
                        {num(entry.resistUnitsCancelled)}, expired empty {num(entry.expiredEmpty)}, duration{" "}
                        {num(entry.expiredDuration)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Monster Group Contributions</h3>
              {result.report.monsterGroupContributions.length === 0 ? (
                <p className="text-zinc-500">No monster group contribution metrics were recorded.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {result.report.monsterGroupContributions.map((group) => (
                    <div key={group.baseActorId} className="rounded border border-zinc-800 p-2">
                      <div className="font-semibold">
                        {group.displayGroupName} x{group.quantity}
                      </div>
                      <p className="text-xs text-zinc-400">
                        actions {num(group.actionsUsed)}, damage {num(group.damage)}, average damage/instance{" "}
                        {num(group.averageDamagePerInstance)}, healing {num(group.healing)}, support mitigation{" "}
                        {num(group.mitigation)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        control {num(group.controlTurnsApplied)}, ongoing {num(group.ongoingDamageApplied)}, average
                        survivors {num(group.survivors)}, average defeated {num(group.defeated)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Actor Contributions</h3>
              {result.report.actorContributions.length === 0 ? (
                <p className="text-zinc-500">No actor contribution metrics were recorded.</p>
              ) : (
                <div className="space-y-3">
                  {result.report.actorContributions
                    .filter((actor) => actor.side === "players" || result.report.monsterGroupContributions.length === 0)
                    .map((actor) => {
                    const rounds = Math.max(1, result.report.averageRounds);
                    const cooldownByAction = new Map(
                      result.report.cooldownTrace
                        .filter((trace) => trace.actorId === actor.actorId)
                        .map((trace) => [trace.actionId, trace]),
                    );
                    return (
                      <div key={actor.actorId} className="rounded border border-zinc-800 p-2">
                        <div className="font-semibold">
                          {actor.actorName} ({actor.side}) {actor.topActionName ? `| top: ${actor.topActionName}` : ""}
                        </div>
                        <p className="text-xs text-zinc-400">
                          actions {num(actor.actionsUsed)}, damage {num(actor.damage)}, healing {num(actor.healing)},
                          HoT applied {num(actor.healingOverTimeApplied)}, HoT ticks {num(actor.healingTicks)},
                          buffs {num(actor.buffApplications)}, buff uptime {num(actor.buffUptime)}, debuffs{" "}
                          {num(actor.debuffApplications)}, debuff uptime {num(actor.debuffUptime)},
                          support mitigation {num(actor.mitigation)}, control{" "}
                          {num(actor.controlTurnsApplied)}, ongoing {num(actor.ongoingDamageApplied)}, ongoing ticks{" "}
                          {num(actor.ongoingDamageTicks)}
                        </p>
                        <p className="text-xs text-zinc-300">
                          Average per round: actions {num(actor.actionsUsed / rounds)}, damage{" "}
                          {num(actor.damage / rounds)}, healing {num(actor.healing / rounds)}, support mitigation{" "}
                          {num(actor.mitigation / rounds)}, HoT ticks {num(actor.healingTicks / rounds)}, control{" "}
                          {num(actor.controlTurnsApplied / rounds)}, ongoing{" "}
                          {num(actor.ongoingDamageApplied / rounds)}, debuff uptime {num(actor.debuffUptime / rounds)}
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                          {actor.actionContributions.slice(0, 4).map((action, index) => {
                            const cooldown = cooldownByAction.get(action.actionId);
                            return (
                              <li key={`${action.actionId}-${index}`}>
                                {action.actionName}: uses {num(action.uses)}, damage {num(action.damage)}, healing{" "}
                                {num(action.healing)}, support mitigation {num(action.mitigation)}
                                {action.healingOverTimeApplied > 0
                                  ? `, HoT applied ${num(action.healingOverTimeApplied)}`
                                  : ""}
                                {action.healingTicks > 0 ? `, HoT ticks ${num(action.healingTicks)}` : ""}
                                {action.buffApplications > 0 ? `, buffs ${num(action.buffApplications)}` : ""}
                                {action.buffUptime > 0 ? `, buff uptime ${num(action.buffUptime)}` : ""}
                                {action.debuffApplications > 0 ? `, debuffs ${num(action.debuffApplications)}` : ""}
                                {action.debuffUptime > 0 ? `, debuff uptime ${num(action.debuffUptime)}` : ""}
                                {action.ongoingDamageApplied > 0
                                  ? `, ongoing ${num(action.ongoingDamageApplied)}`
                                  : ""}
                                {action.ongoingDamageTicks > 0
                                  ? `, ongoing ticks ${num(action.ongoingDamageTicks)}`
                                  : ""}
                                {cooldown
                                  ? `, cooldown uses ${num(cooldown.uses)}, prevented ${num(cooldown.preventedByCooldown)}, ticks ${num(cooldown.cooldownTicks)}`
                                  : ""}
                                {action.linkedActionCount > 0 ? `, linked ${action.linkedActionCount}` : ""}
                              </li>
                            );
                          })}
                      </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Cooldown Trace</h3>
              {result.report.cooldownTrace.length === 0 ? (
                <p className="text-zinc-500">No cooldown-bearing actions were used or sampled.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {result.report.cooldownTrace.map((trace) => (
                    <div key={`${trace.actorId}-${trace.actionId}`} className="rounded border border-zinc-800 p-2">
                      <div className="font-semibold">
                        {trace.actionName} {trace.isCounter ? "(Counter)" : ""} | {trace.actorName} ({trace.side})
                      </div>
                      <p className="text-xs text-zinc-400">
                        cooldown {trace.cooldownRounds}, uses {num(trace.uses)}, applied{" "}
                        {num(trace.cooldownApplied)}, ticks {num(trace.cooldownTicks)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        prevented by cooldown {num(trace.preventedByCooldown)}, attempted while cooling{" "}
                        {num(trace.attemptedUsesWhileOnCooldown)}, available turns {num(trace.availableTurns)},
                        unavailable turns {num(trace.unavailableTurns)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Counter Candidate Diagnostics</h3>
              {result.report.counterCandidateDiagnostics.length === 0 ? (
                <p className="text-zinc-500">No counter candidates were evaluated.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {result.report.counterCandidateDiagnostics.map((diagnostic) => {
                    const averageCounter =
                      diagnostic.expectedSamples > 0
                        ? diagnostic.totalExpectedCounterPrevention / diagnostic.expectedSamples
                        : 0;
                    const averageNormal =
                      diagnostic.expectedSamples > 0
                        ? diagnostic.totalExpectedNormalPrevention / diagnostic.expectedSamples
                        : 0;
                    return (
                      <div key={`${diagnostic.actorId}-${diagnostic.actionId}`} className="rounded border border-zinc-800 p-2">
                        <div className="font-semibold">
                          {diagnostic.actionName} | {diagnostic.actorName} ({diagnostic.side})
                        </div>
                        <p className="text-xs text-zinc-400">
                          considered {num(diagnostic.considered)}, selected {num(diagnostic.selected)}, skipped normal
                          defence better {num(diagnostic.skippedNormalDefenceBetter)}, no response{" "}
                          {num(diagnostic.skippedNoResponse)}, cooldown {num(diagnostic.skippedCooldown)}
                        </p>
                        <p className="text-xs text-zinc-400">
                          unsupported {num(diagnostic.skippedUnsupported)}, non-avoidable{" "}
                          {num(diagnostic.skippedNonAvoidable)}, non-applicable{" "}
                          {num(diagnostic.skippedNonApplicable)}
                        </p>
                        <p className="text-xs text-zinc-400">
                          average expected counter prevention {num(averageCounter)}, normal prevention{" "}
                          {num(averageNormal)}
                        </p>
                        {diagnostic.lastReason ? (
                          <p className="text-xs text-zinc-500">last reason: {diagnostic.lastReason}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <h3 className="mb-2 font-semibold">Defensive Contributions</h3>
              {result.report.defensiveContributions.length === 0 ? (
                <p className="text-zinc-500">No defensive contribution metrics were recorded.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {result.report.defensiveContributions.map((actor) => (
                    <div key={actor.actorId} className="rounded border border-zinc-800 p-2">
                      <div className="font-semibold">
                        {actor.actorName} ({actor.side})
                      </div>
                      <p className="text-xs text-zinc-400">
                        defended {num(actor.attacksDefended)}, dodged {num(actor.woundsDodged)}, defence string
                        blocked {num(actor.defenceStringBlocked)}, static protection {num(actor.staticProtectionPrevented)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        buffed defence rolls {num(actor.buffedDefenceRolls)}, debuffed defence rolls{" "}
                        {num(actor.debuffedDefenceRolls)}, buffed resist rolls {num(actor.buffedResistRolls)},
                        debuffed resist rolls {num(actor.debuffedResistRolls)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        counters {num(actor.counterUses)}, counter damage {num(actor.counterDamage)}, counter
                        mitigation {num(actor.counterMitigation)}, responses {num(actor.responsesUsed)}, net damage
                        taken {num(actor.netDamageTaken)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded border border-emerald-900 bg-zinc-950 p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Run 1 Combat Transcript</h3>
                <span className="text-xs text-zinc-500">
                  {result.report.firstRunTranscript?.events.length ?? 0} events
                  {result.report.firstRunTranscript?.truncated ? " | truncated" : ""}
                </span>
              </div>
              <CombatTranscriptView transcript={result.report.firstRunTranscript} />
            </div>

            <div className="rounded border border-amber-800 bg-amber-950/20 p-3 text-sm text-amber-100">
              <h3 className="mb-2 font-semibold">Unsupported / Fallbacks / Ignored Traits</h3>
              {result.hydrationWarnings.length === 0 &&
              result.report.unsupported.unsupportedPowerCount === 0 &&
              result.report.hydrationIntegrity.fallbackActionCount === 0 &&
              result.report.hydrationIntegrity.ignoredTraitCount === 0 ? (
                <p>No unsupported campaign fields or powers were reported.</p>
              ) : (
                <div className="space-y-2">
                  {result.report.hydrationIntegrity.fallbackActionCount > 0 ? (
                    <p>
                      Fallback actions used: {result.report.hydrationIntegrity.fallbackActionCount}. Treat this
                      simulation as provisional for those actors.
                    </p>
                  ) : null}
                  {result.report.hydrationIntegrity.ignoredTraitCount > 0 ? (
                    <p>
                      Ignored traits/characteristics: {result.report.hydrationIntegrity.ignoredTraitCount}. These are
                      informational and do not affect the verdict unless marked as unsupported combat traits.
                    </p>
                  ) : null}
                  {result.hydrationWarnings.map((warning, index) => (
                    <p key={`${warning.actorId}-${warning.field}-${warning.message}-${index}`}>
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
