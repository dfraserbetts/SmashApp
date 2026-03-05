// SC_COMBAT_ENGINE_V01_ADAPTERS

import type { MonsterUpsertInput } from "../types";
import { getDodgeValue } from "../attributes";
import type { CombatantModel, Domain, Intent, PowerModel } from "./models";
import type { PlayerLabState } from "./playerLabTypes";

const DEFAULT_ACTIONS_PER_TURN = 1;

function mapIntent(): Intent {
  // v0.1: we don't yet map MonsterPowerIntentions -> engine intent.
  // Keep deterministic default and upgrade later.
  return "attack";
}

function mapDomain(): Domain {
  // v0.1: we don't yet map MonsterPowerIntentions -> domain.
  // Keep deterministic default and upgrade later.
  return "physical";
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * v0.1 adapter: map a MonsterUpsertInput into a CombatantModel.
 * Uses real MonsterUpsertInput fields that exist today.
 */
export function adaptMonsterToCombatant(monster: MonsterUpsertInput): CombatantModel {
  // Searchable anchor: SC_ADAPT_MONSTER_TODO
  // TODO: map MonsterPower.intentions into engine intent/domain instead of deterministic defaults.
  const id = String((monster as MonsterUpsertInput & { id?: string }).id ?? "monster");
  const name = String(monster.name ?? "Monster");
  const level = Number(monster.level ?? 1);

  const hpPhysical = Number(monster.physicalResilienceMax ?? monster.physicalResilienceCurrent ?? 0);
  const hpMental = Number(monster.mentalPerseveranceMax ?? monster.mentalPerseveranceCurrent ?? 0);

  const pp = Number(monster.physicalProtection ?? 0);
  const mp = Number(monster.mentalProtection ?? 0);

  const dodgeScore = getDodgeValue(monster.defenceDie, monster.intellectDie, level, pp);
  const dodge = clamp01(dodgeScore / 100);

  const accuracyDie = monster.attackDie;
  const actionsPerTurn = Math.max(
    1,
    Number((monster as MonsterUpsertInput & { actionsPerTurn?: number }).actionsPerTurn ?? DEFAULT_ACTIONS_PER_TURN),
  );

  const powers: PowerModel[] = monster.powers.map((power, idx) => ({
    id: String(power.id ?? `power-${idx}`),
    name: power.name,
    intent: mapIntent(),
    domain: mapDomain(),
    diceCount: Number(power.diceCount ?? 0),
    potency: Number(power.potency ?? 0),
  }));

  return {
    id,
    name,
    level,
    hp: { physical: hpPhysical, mental: hpMental },
    defence: { pp, mp, dodge },
    offence: { accuracyDie, actionsPerTurn },
    powers,
  };
}

// SC_ADAPT_PLAYER_V01
export function adaptPlayerToCombatant(player: PlayerLabState): CombatantModel {
  const level = player.level;
  const pp = player.physicalProtection;

  // Reuse the same derived dodge approach as monsters
  const dodgeScore = getDodgeValue(player.defenceDie, player.intellectDie, level, pp);
  const dodge = clamp01(dodgeScore / 100);

  return {
    id: player.id,
    name: player.name,
    level,
    hp: { physical: player.physicalHPMax, mental: player.mentalHPMax },
    defence: {
      pp: player.physicalProtection,
      mp: player.mentalProtection,
      dodge,
    },
    offence: {
      accuracyDie: player.attackDie,
      actionsPerTurn: player.actionsPerTurn,
    },
    powers: player.powers.map((p) => ({
      id: p.id,
      name: p.name,
      intent: p.intent,
      domain: p.domain,
      diceCount: p.diceCount,
      potency: p.potency,
    })),
  };
}
