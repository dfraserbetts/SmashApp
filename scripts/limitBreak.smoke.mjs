import "dotenv/config";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { computeThreshold, canUseLimitBreak, recordLimitBreakUse } from "../lib/rules/limitBreak.ts";
import { prisma } from "../prisma/client.ts";

async function run() {
  assert.equal(computeThreshold(8, 60), 5);
  assert.equal(computeThreshold(8, 85), 7);
  assert.equal(computeThreshold(8, 125), 10);

  let abilityId = null;

  try {
    const createdAbility = await prisma.ability.create({
      data: {
        name: `LB Smoke ${Date.now()}`,
        sourceType: "CHARACTER_POWER",
        intention: "ATTACK",
        diceCount: 6,
        potency: 2,
      },
      select: { id: true },
    });

    abilityId = createdAbility.id;

    const usage = {
      actorType: "CHARACTER",
      actorId: `smoke-actor-${Date.now()}`,
      abilityId,
      usedAtLevel: 10,
      client: prisma,
    };

    const allowedBefore = await canUseLimitBreak(usage);
    assert.equal(allowedBefore, true);

    await recordLimitBreakUse(usage);

    const allowedAfter = await canUseLimitBreak(usage);
    assert.equal(allowedAfter, false);

    let blockedByUnique = false;
    try {
      await recordLimitBreakUse(usage);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        blockedByUnique = true;
      } else {
        throw error;
      }
    }

    assert.equal(blockedByUnique, true);
  } finally {
    if (abilityId) {
      await prisma.abilityLimitBreakUsage.deleteMany({ where: { abilityId } });
      await prisma.limitBreakProfile.deleteMany({ where: { abilityId } });
      await prisma.ability.deleteMany({ where: { id: abilityId } });
    }
  }
}

run()
  .then(() => {
    console.log("limitBreak.smoke.mjs passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
