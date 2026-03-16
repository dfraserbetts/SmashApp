"use client";

import { useEffect, useState } from "react";

type TuningRow = {
  id: string;
  protectionK: number;
  protectionS: number;
  attackWeight: number;
  defenceWeight: number;
  fortitudeWeight: number;
  intellectWeight: number;
  supportWeight: number;
  braveryWeight: number;
  minionTierMultiplier: number;
  soldierTierMultiplier: number;
  eliteTierMultiplier: number;
  bossTierMultiplier: number;
  expectedPhysicalResilienceAt1: number;
  expectedPhysicalResiliencePerLevel: number;
  expectedMentalPerseveranceAt1: number;
  expectedMentalPerseverancePerLevel: number;
  expectedPoolMinionMultiplier: number;
  expectedPoolSoldierMultiplier: number;
  expectedPoolEliteMultiplier: number;
  expectedPoolBossMultiplier: number;
  poolWeakerSideWeight: number;
  poolAverageWeight: number;
  poolBelowExpectedMaxPenaltyShare: number;
  poolBelowExpectedScale: number;
  poolAboveExpectedMaxBonusShare: number;
  poolAboveExpectedScale: number;
  updatedAt: string;
};

// ADMIN_COMBAT_TUNING_PAGE
export default function AdminCombatTuningPage() {
  const [row, setRow] = useState<TuningRow | null>(null);
  const [protectionK, setProtectionK] = useState("");
  const [protectionS, setProtectionS] = useState("");
  const [attackWeight, setAttackWeight] = useState("");
  const [defenceWeight, setDefenceWeight] = useState("");
  const [fortitudeWeight, setFortitudeWeight] = useState("");
  const [intellectWeight, setIntellectWeight] = useState("");
  const [supportWeight, setSupportWeight] = useState("");
  const [braveryWeight, setBraveryWeight] = useState("");
  const [minionTierMultiplier, setMinionTierMultiplier] = useState("");
  const [soldierTierMultiplier, setSoldierTierMultiplier] = useState("");
  const [eliteTierMultiplier, setEliteTierMultiplier] = useState("");
  const [bossTierMultiplier, setBossTierMultiplier] = useState("");
  const [expectedPhysicalResilienceAt1, setExpectedPhysicalResilienceAt1] = useState("");
  const [expectedPhysicalResiliencePerLevel, setExpectedPhysicalResiliencePerLevel] =
    useState("");
  const [expectedMentalPerseveranceAt1, setExpectedMentalPerseveranceAt1] = useState("");
  const [expectedMentalPerseverancePerLevel, setExpectedMentalPerseverancePerLevel] =
    useState("");
  const [expectedPoolMinionMultiplier, setExpectedPoolMinionMultiplier] = useState("");
  const [expectedPoolSoldierMultiplier, setExpectedPoolSoldierMultiplier] = useState("");
  const [expectedPoolEliteMultiplier, setExpectedPoolEliteMultiplier] = useState("");
  const [expectedPoolBossMultiplier, setExpectedPoolBossMultiplier] = useState("");
  const [poolWeakerSideWeight, setPoolWeakerSideWeight] = useState("");
  const [poolAverageWeight, setPoolAverageWeight] = useState("");
  const [poolBelowExpectedMaxPenaltyShare, setPoolBelowExpectedMaxPenaltyShare] = useState("");
  const [poolBelowExpectedScale, setPoolBelowExpectedScale] = useState("");
  const [poolAboveExpectedMaxBonusShare, setPoolAboveExpectedMaxBonusShare] = useState("");
  const [poolAboveExpectedScale, setPoolAboveExpectedScale] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const physicalResilienceWeightFields = [
    { label: "Attack Weight", value: attackWeight, setter: setAttackWeight },
    { label: "Defence Weight", value: defenceWeight, setter: setDefenceWeight },
    { label: "Fortitude Weight", value: fortitudeWeight, setter: setFortitudeWeight },
  ] as const;
  const mentalPerseveranceWeightFields = [
    { label: "Intellect Weight", value: intellectWeight, setter: setIntellectWeight },
    { label: "Support Weight", value: supportWeight, setter: setSupportWeight },
    { label: "Bravery Weight", value: braveryWeight, setter: setBraveryWeight },
  ] as const;
  const tierMultiplierFields = [
    { label: "Minion Multiplier", value: minionTierMultiplier, setter: setMinionTierMultiplier },
    { label: "Soldier Multiplier", value: soldierTierMultiplier, setter: setSoldierTierMultiplier },
    { label: "Elite Multiplier", value: eliteTierMultiplier, setter: setEliteTierMultiplier },
    { label: "Boss Multiplier", value: bossTierMultiplier, setter: setBossTierMultiplier },
  ] as const;
  const expectedPhysicalPoolCurveFields = [
    {
      label: "Expected Physical Resilience @ Level 1",
      value: expectedPhysicalResilienceAt1,
      setter: setExpectedPhysicalResilienceAt1,
    },
    {
      label: "Expected Physical Resilience Per Level",
      value: expectedPhysicalResiliencePerLevel,
      setter: setExpectedPhysicalResiliencePerLevel,
    },
  ] as const;
  const expectedMentalPoolCurveFields = [
    {
      label: "Expected Mental Perseverance @ Level 1",
      value: expectedMentalPerseveranceAt1,
      setter: setExpectedMentalPerseveranceAt1,
    },
    {
      label: "Expected Mental Perseverance Per Level",
      value: expectedMentalPerseverancePerLevel,
      setter: setExpectedMentalPerseverancePerLevel,
    },
  ] as const;
  const expectedPoolTierMultiplierFields = [
    {
      label: "Expected Pool Minion Multiplier",
      value: expectedPoolMinionMultiplier,
      setter: setExpectedPoolMinionMultiplier,
    },
    {
      label: "Expected Pool Soldier Multiplier",
      value: expectedPoolSoldierMultiplier,
      setter: setExpectedPoolSoldierMultiplier,
    },
    {
      label: "Expected Pool Elite Multiplier",
      value: expectedPoolEliteMultiplier,
      setter: setExpectedPoolEliteMultiplier,
    },
    {
      label: "Expected Pool Boss Multiplier",
      value: expectedPoolBossMultiplier,
      setter: setExpectedPoolBossMultiplier,
    },
  ] as const;
  const poolBlendFields = [
    {
      label: "Weaker Side Weight",
      value: poolWeakerSideWeight,
      setter: setPoolWeakerSideWeight,
    },
    {
      label: "Average Weight",
      value: poolAverageWeight,
      setter: setPoolAverageWeight,
    },
  ] as const;
  const poolDeltaFields = [
    {
      label: "Below Expected Max Penalty Share",
      value: poolBelowExpectedMaxPenaltyShare,
      setter: setPoolBelowExpectedMaxPenaltyShare,
    },
    {
      label: "Below Expected Scale",
      value: poolBelowExpectedScale,
      setter: setPoolBelowExpectedScale,
    },
    {
      label: "Above Expected Max Bonus Share",
      value: poolAboveExpectedMaxBonusShare,
      setter: setPoolAboveExpectedMaxBonusShare,
    },
    {
      label: "Above Expected Scale",
      value: poolAboveExpectedScale,
      setter: setPoolAboveExpectedScale,
    },
  ] as const;

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/combat-tuning", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        row?: TuningRow;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load combat tuning");
      if (!data.row) throw new Error("Missing combat tuning row");
      setRow(data.row);
      setProtectionK(String(data.row.protectionK));
      setProtectionS(String(data.row.protectionS));
      setAttackWeight(String(data.row.attackWeight));
      setDefenceWeight(String(data.row.defenceWeight));
      setFortitudeWeight(String(data.row.fortitudeWeight));
      setIntellectWeight(String(data.row.intellectWeight));
      setSupportWeight(String(data.row.supportWeight));
      setBraveryWeight(String(data.row.braveryWeight));
      setMinionTierMultiplier(String(data.row.minionTierMultiplier));
      setSoldierTierMultiplier(String(data.row.soldierTierMultiplier));
      setEliteTierMultiplier(String(data.row.eliteTierMultiplier));
      setBossTierMultiplier(String(data.row.bossTierMultiplier));
      setExpectedPhysicalResilienceAt1(String(data.row.expectedPhysicalResilienceAt1));
      setExpectedPhysicalResiliencePerLevel(String(data.row.expectedPhysicalResiliencePerLevel));
      setExpectedMentalPerseveranceAt1(String(data.row.expectedMentalPerseveranceAt1));
      setExpectedMentalPerseverancePerLevel(String(data.row.expectedMentalPerseverancePerLevel));
      setExpectedPoolMinionMultiplier(String(data.row.expectedPoolMinionMultiplier));
      setExpectedPoolSoldierMultiplier(String(data.row.expectedPoolSoldierMultiplier));
      setExpectedPoolEliteMultiplier(String(data.row.expectedPoolEliteMultiplier));
      setExpectedPoolBossMultiplier(String(data.row.expectedPoolBossMultiplier));
      setPoolWeakerSideWeight(String(data.row.poolWeakerSideWeight));
      setPoolAverageWeight(String(data.row.poolAverageWeight));
      setPoolBelowExpectedMaxPenaltyShare(String(data.row.poolBelowExpectedMaxPenaltyShare));
      setPoolBelowExpectedScale(String(data.row.poolBelowExpectedScale));
      setPoolAboveExpectedMaxBonusShare(String(data.row.poolAboveExpectedMaxBonusShare));
      setPoolAboveExpectedScale(String(data.row.poolAboveExpectedScale));
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Failed to load combat tuning"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    const k = Number.parseInt(protectionK, 10);
    const s = Number.parseInt(protectionS, 10);
    const parsedAttackWeight = Number(attackWeight);
    const parsedDefenceWeight = Number(defenceWeight);
    const parsedFortitudeWeight = Number(fortitudeWeight);
    const parsedIntellectWeight = Number(intellectWeight);
    const parsedSupportWeight = Number(supportWeight);
    const parsedBraveryWeight = Number(braveryWeight);
    const parsedMinionTierMultiplier = Number(minionTierMultiplier);
    const parsedSoldierTierMultiplier = Number(soldierTierMultiplier);
    const parsedEliteTierMultiplier = Number(eliteTierMultiplier);
    const parsedBossTierMultiplier = Number(bossTierMultiplier);
    const parsedExpectedPhysicalResilienceAt1 = Number(expectedPhysicalResilienceAt1);
    const parsedExpectedPhysicalResiliencePerLevel = Number(expectedPhysicalResiliencePerLevel);
    const parsedExpectedMentalPerseveranceAt1 = Number(expectedMentalPerseveranceAt1);
    const parsedExpectedMentalPerseverancePerLevel = Number(expectedMentalPerseverancePerLevel);
    const parsedExpectedPoolMinionMultiplier = Number(expectedPoolMinionMultiplier);
    const parsedExpectedPoolSoldierMultiplier = Number(expectedPoolSoldierMultiplier);
    const parsedExpectedPoolEliteMultiplier = Number(expectedPoolEliteMultiplier);
    const parsedExpectedPoolBossMultiplier = Number(expectedPoolBossMultiplier);
    const parsedPoolWeakerSideWeight = Number(poolWeakerSideWeight);
    const parsedPoolAverageWeight = Number(poolAverageWeight);
    const parsedPoolBelowExpectedMaxPenaltyShare = Number(poolBelowExpectedMaxPenaltyShare);
    const parsedPoolBelowExpectedScale = Number(poolBelowExpectedScale);
    const parsedPoolAboveExpectedMaxBonusShare = Number(poolAboveExpectedMaxBonusShare);
    const parsedPoolAboveExpectedScale = Number(poolAboveExpectedScale);
    if (!Number.isFinite(k) || k < 1) {
      setErr("Protection K must be >= 1.");
      return;
    }
    if (!Number.isFinite(s) || s < 1) {
      setErr("Protection S must be >= 1.");
      return;
    }
    if (
      !Number.isFinite(parsedAttackWeight) ||
      parsedAttackWeight <= 0 ||
      !Number.isFinite(parsedDefenceWeight) ||
      parsedDefenceWeight <= 0 ||
      !Number.isFinite(parsedFortitudeWeight) ||
      parsedFortitudeWeight <= 0 ||
      !Number.isFinite(parsedIntellectWeight) ||
      parsedIntellectWeight <= 0 ||
      !Number.isFinite(parsedSupportWeight) ||
      parsedSupportWeight <= 0 ||
      !Number.isFinite(parsedBraveryWeight) ||
      parsedBraveryWeight <= 0
    ) {
      setErr("All attribute weights must be > 0.");
      return;
    }
    if (
      !Number.isFinite(parsedMinionTierMultiplier) ||
      parsedMinionTierMultiplier <= 0 ||
      !Number.isFinite(parsedSoldierTierMultiplier) ||
      parsedSoldierTierMultiplier <= 0 ||
      !Number.isFinite(parsedEliteTierMultiplier) ||
      parsedEliteTierMultiplier <= 0 ||
      !Number.isFinite(parsedBossTierMultiplier) ||
      parsedBossTierMultiplier <= 0
    ) {
      setErr("All tier multipliers must be > 0.");
      return;
    }
    if (
      !Number.isFinite(parsedExpectedPhysicalResilienceAt1) ||
      parsedExpectedPhysicalResilienceAt1 <= 0 ||
      !Number.isFinite(parsedExpectedPhysicalResiliencePerLevel) ||
      parsedExpectedPhysicalResiliencePerLevel <= 0 ||
      !Number.isFinite(parsedExpectedMentalPerseveranceAt1) ||
      parsedExpectedMentalPerseveranceAt1 <= 0 ||
      !Number.isFinite(parsedExpectedMentalPerseverancePerLevel) ||
      parsedExpectedMentalPerseverancePerLevel <= 0
    ) {
      setErr("Expected pool curve values must be > 0.");
      return;
    }
    if (
      !Number.isFinite(parsedExpectedPoolMinionMultiplier) ||
      parsedExpectedPoolMinionMultiplier <= 0 ||
      !Number.isFinite(parsedExpectedPoolSoldierMultiplier) ||
      parsedExpectedPoolSoldierMultiplier <= 0 ||
      !Number.isFinite(parsedExpectedPoolEliteMultiplier) ||
      parsedExpectedPoolEliteMultiplier <= 0 ||
      !Number.isFinite(parsedExpectedPoolBossMultiplier) ||
      parsedExpectedPoolBossMultiplier <= 0
    ) {
      setErr("Expected pool tier multipliers must be > 0.");
      return;
    }
    if (
      !Number.isFinite(parsedPoolWeakerSideWeight) ||
      parsedPoolWeakerSideWeight <= 0 ||
      !Number.isFinite(parsedPoolAverageWeight) ||
      parsedPoolAverageWeight <= 0
    ) {
      setErr("Pool blend weights must be > 0.");
      return;
    }
    if (
      !Number.isFinite(parsedPoolBelowExpectedMaxPenaltyShare) ||
      parsedPoolBelowExpectedMaxPenaltyShare <= 0 ||
      !Number.isFinite(parsedPoolBelowExpectedScale) ||
      parsedPoolBelowExpectedScale <= 0 ||
      !Number.isFinite(parsedPoolAboveExpectedMaxBonusShare) ||
      parsedPoolAboveExpectedMaxBonusShare <= 0 ||
      !Number.isFinite(parsedPoolAboveExpectedScale) ||
      parsedPoolAboveExpectedScale <= 0
    ) {
      setErr("Pool delta tuning values must be > 0.");
      return;
    }

    setSaving(true);
    setErr(null);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/combat-tuning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protectionK: k,
          protectionS: s,
          attackWeight: parsedAttackWeight,
          defenceWeight: parsedDefenceWeight,
          fortitudeWeight: parsedFortitudeWeight,
          intellectWeight: parsedIntellectWeight,
          supportWeight: parsedSupportWeight,
          braveryWeight: parsedBraveryWeight,
          minionTierMultiplier: parsedMinionTierMultiplier,
          soldierTierMultiplier: parsedSoldierTierMultiplier,
          eliteTierMultiplier: parsedEliteTierMultiplier,
          bossTierMultiplier: parsedBossTierMultiplier,
          expectedPhysicalResilienceAt1: parsedExpectedPhysicalResilienceAt1,
          expectedPhysicalResiliencePerLevel: parsedExpectedPhysicalResiliencePerLevel,
          expectedMentalPerseveranceAt1: parsedExpectedMentalPerseveranceAt1,
          expectedMentalPerseverancePerLevel: parsedExpectedMentalPerseverancePerLevel,
          expectedPoolMinionMultiplier: parsedExpectedPoolMinionMultiplier,
          expectedPoolSoldierMultiplier: parsedExpectedPoolSoldierMultiplier,
          expectedPoolEliteMultiplier: parsedExpectedPoolEliteMultiplier,
          expectedPoolBossMultiplier: parsedExpectedPoolBossMultiplier,
          poolWeakerSideWeight: parsedPoolWeakerSideWeight,
          poolAverageWeight: parsedPoolAverageWeight,
          poolBelowExpectedMaxPenaltyShare: parsedPoolBelowExpectedMaxPenaltyShare,
          poolBelowExpectedScale: parsedPoolBelowExpectedScale,
          poolAboveExpectedMaxBonusShare: parsedPoolAboveExpectedMaxBonusShare,
          poolAboveExpectedScale: parsedPoolAboveExpectedScale,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        row?: TuningRow;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to save combat tuning");
      if (data.row) {
        setRow(data.row);
        setProtectionK(String(data.row.protectionK));
        setProtectionS(String(data.row.protectionS));
        setAttackWeight(String(data.row.attackWeight));
        setDefenceWeight(String(data.row.defenceWeight));
        setFortitudeWeight(String(data.row.fortitudeWeight));
        setIntellectWeight(String(data.row.intellectWeight));
        setSupportWeight(String(data.row.supportWeight));
        setBraveryWeight(String(data.row.braveryWeight));
        setMinionTierMultiplier(String(data.row.minionTierMultiplier));
        setSoldierTierMultiplier(String(data.row.soldierTierMultiplier));
        setEliteTierMultiplier(String(data.row.eliteTierMultiplier));
        setBossTierMultiplier(String(data.row.bossTierMultiplier));
        setExpectedPhysicalResilienceAt1(String(data.row.expectedPhysicalResilienceAt1));
        setExpectedPhysicalResiliencePerLevel(
          String(data.row.expectedPhysicalResiliencePerLevel),
        );
        setExpectedMentalPerseveranceAt1(String(data.row.expectedMentalPerseveranceAt1));
        setExpectedMentalPerseverancePerLevel(
          String(data.row.expectedMentalPerseverancePerLevel),
        );
        setExpectedPoolMinionMultiplier(String(data.row.expectedPoolMinionMultiplier));
        setExpectedPoolSoldierMultiplier(String(data.row.expectedPoolSoldierMultiplier));
        setExpectedPoolEliteMultiplier(String(data.row.expectedPoolEliteMultiplier));
        setExpectedPoolBossMultiplier(String(data.row.expectedPoolBossMultiplier));
        setPoolWeakerSideWeight(String(data.row.poolWeakerSideWeight));
        setPoolAverageWeight(String(data.row.poolAverageWeight));
        setPoolBelowExpectedMaxPenaltyShare(String(data.row.poolBelowExpectedMaxPenaltyShare));
        setPoolBelowExpectedScale(String(data.row.poolBelowExpectedScale));
        setPoolAboveExpectedMaxBonusShare(String(data.row.poolAboveExpectedMaxBonusShare));
        setPoolAboveExpectedScale(String(data.row.poolAboveExpectedScale));
      }
      setFlash("Saved combat tuning.");
      window.setTimeout(() => setFlash(null), 2000);
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Failed to save combat tuning"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <a className="text-sm underline" href="/admin">
        Back to Admin Dashboard
      </a>

      <div className="rounded-lg border">
        <div className="border-b p-3">
          <h2 className="text-lg font-medium">Combat Tuning</h2>
          <p className="mt-1 text-sm opacity-80">Protection Block Tuning</p>
        </div>

        <div className="space-y-4 p-3">
          <p className="text-sm opacity-80">
            block = ceil((PPV / K) * (1 + skill / S))
          </p>
          <p className="text-xs opacity-70">
            Adjusting K and S: because even spreadsheets deserve a GM screen.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm">Protection K</label>
              <input
                type="number"
                min={1}
                step={1}
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={protectionK}
                onChange={(e) => setProtectionK(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm">Protection S</label>
              <input
                type="number"
                min={1}
                step={1}
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={protectionS}
                onChange={(e) => setProtectionS(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Physical Resilience Attribute Weights</h3>
            <p className="text-xs opacity-70">
              Physical Resilience uses Attack, Defence, and Fortitude.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {physicalResilienceWeightFields.map((field) => (
                <div key={field.label}>
                  <label className="text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Mental Perseverance Attribute Weights</h3>
            <p className="text-xs opacity-70">
              Mental Perseverance uses Intellect, Support, and Bravery.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {mentalPerseveranceWeightFields.map((field) => (
                <div key={field.label}>
                  <label className="text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Tier Multipliers</h3>
            <p className="text-xs opacity-70">
              These multipliers are shared by both Physical Resilience and Mental Perseverance.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {tierMultiplierFields.map((field) => (
                <div key={field.label}>
                  <label className="text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Expected Physical Resilience Curve</h3>
            <p className="text-xs opacity-70">
              Defines the neutral expected Physical Resilience curve before tier multipliers.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {expectedPhysicalPoolCurveFields.map((field) => (
                <div key={field.label}>
                  <label className="text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Expected Mental Perseverance Curve</h3>
            <p className="text-xs opacity-70">
              Defines the neutral expected Mental Perseverance curve before tier multipliers.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {expectedMentalPoolCurveFields.map((field) => (
                <div key={field.label}>
                  <label className="text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Expected Pool Tier Multipliers</h3>
            <p className="text-xs opacity-70">
              Applies Level+Tier expectation to expected pool curves only. These do not change
              actual pool generation.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {expectedPoolTierMultiplierFields.map((field) => (
                <div key={field.label}>
                  <label className="text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Pool Blend Weights</h3>
            <p className="text-xs opacity-70">
              The weaker side matters more than the overall average. Use these to control that
              blend.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {poolBlendFields.map((field) => (
                <div key={field.label}>
                  <label className="text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Pool Delta Tuning</h3>
            <p className="text-xs opacity-70">
              Below expected pools penalize survivability harder. Above expected pools reward
              survivability more gently.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {poolDeltaFields.map((field) => (
                <div key={field.label}>
                  <label className="text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {row?.updatedAt ? (
            <p className="text-xs opacity-70">Last updated: {new Date(row.updatedAt).toLocaleString()}</p>
          ) : null}

          {err ? <div className="rounded border p-3 text-sm">{err}</div> : null}
          {flash ? <div className="rounded border p-3 text-sm">{flash}</div> : null}

          <div className="flex gap-2">
            <button
              className="rounded border px-3 py-2 text-sm"
              type="button"
              onClick={save}
              disabled={loading || saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className="rounded border px-3 py-2 text-sm"
              type="button"
              onClick={() => void load()}
              disabled={loading || saving}
            >
              Refresh
            </button>
          </div>

          {loading ? <p className="text-sm opacity-80">Loading...</p> : null}
        </div>
      </div>
    </div>
  );
}

