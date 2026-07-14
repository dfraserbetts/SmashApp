import {
  ROLEPLAY_METHODS,
  ROLEPLAY_OUTCOME_CONTRACTS,
  auditRoleplayStandardLibrary,
  type RoleplayStandardOutcomeContractId,
} from "../lib/characterBuilder/roleplayAbilities";

const EXPECTED_METHOD_ORDER = [
  "APPEAL",
  "RALLY",
  "MISDIRECT",
  "DISTRACT",
  "RESCUE",
  "INTERRUPT",
  "CHALLENGE",
  "OVERAWE",
  "DISCERN_TRUTH",
] as const;

const EXPECTED_CONTRACT_ORDER = [
  "HIDE_FROM_IMMEDIATE_DANGER",
  "SECURE_IMMEDIATE_SAFETY",
  "DENY_IMMINENT_HOSTILE_ACT",
  "DRAW_HOSTILE_ATTENTION",
  "BREAK_SHARED_RESOLVE",
  "UNCOVER_CONCEALED_TRUTH",
  "REVEAL_EXPLOITABLE_WEAKNESS",
  "SECURE_WILLING_COOPERATION",
  "ESTABLISH_SHARED_RESOLVE",
  "ESTABLISH_FALSE_BELIEF",
  "DIVERT_IMMEDIATE_ATTENTION",
] as const;

const EXPECTED_MISSING_COUNTS: Record<RoleplayStandardOutcomeContractId, number> = {
  HIDE_FROM_IMMEDIATE_DANGER: 6,
  SECURE_IMMEDIATE_SAFETY: 6,
  DENY_IMMINENT_HOSTILE_ACT: 3,
  DRAW_HOSTILE_ATTENTION: 0,
  BREAK_SHARED_RESOLVE: 0,
  UNCOVER_CONCEALED_TRUTH: 0,
  REVEAL_EXPLOITABLE_WEAKNESS: 0,
  SECURE_WILLING_COOPERATION: 4,
  ESTABLISH_SHARED_RESOLVE: 0,
  ESTABLISH_FALSE_BELIEF: 0,
  DIVERT_IMMEDIATE_ATTENTION: 6,
};

function sameOrder(actual: readonly string[], expected: readonly string[]) {
  return actual.join(",") === expected.join(",");
}

function formatCells(cells: Array<{ scope: string; sceneImpact: string }>) {
  return cells.length === 0
    ? "none"
    : cells.map((cell) => `${cell.scope}/${cell.sceneImpact}`).join(", ");
}

const audit = auditRoleplayStandardLibrary();
const errors = [...audit.structuralErrors];

if (!sameOrder(audit.methodIds, EXPECTED_METHOD_ORDER)) {
  errors.push(`method-order:${audit.methodIds.join(",")}`);
}
if (!sameOrder(audit.contractIds, EXPECTED_CONTRACT_ORDER)) {
  errors.push(`contract-order:${audit.contractIds.join(",")}`);
}
if (audit.privilegeKeys.length !== 11) {
  errors.push(`privilege-key-count:${audit.privilegeKeys.length}`);
}
if (audit.plannedCellCount !== 68) {
  errors.push(`planned-cell-count:${audit.plannedCellCount}`);
}
if (audit.completedCellCount !== 43) {
  errors.push(`completed-cell-count:${audit.completedCellCount}`);
}
if (audit.missingCellCount !== 25) {
  errors.push(`missing-cell-count:${audit.missingCellCount}`);
}

for (const contractId of EXPECTED_CONTRACT_ORDER) {
  const actual = audit.missingCellsByContract[contractId].length;
  if (actual !== EXPECTED_MISSING_COUNTS[contractId]) {
    errors.push(`missing-breakdown:${contractId}:${actual}`);
  }
}

console.log(`Methods (${ROLEPLAY_METHODS.length}): ${audit.methodIds.join(",")}`);
console.log(
  `Contracts (${ROLEPLAY_OUTCOME_CONTRACTS.length}): ${audit.contractIds.join(",")}`,
);
console.log(`Family privilege keys (${audit.privilegeKeys.length}): ${audit.privilegeKeys.join(",")}`);
console.log(
  `Coverage: ${audit.plannedCellCount} planned / ${audit.completedCellCount} completed / ${audit.missingCellCount} missing`,
);

console.log("Missing cells by contract:");
for (const contractId of EXPECTED_CONTRACT_ORDER) {
  console.log(`- ${contractId}: ${formatCells(audit.missingCellsByContract[contractId])}`);
}

console.log("Supported scopes and completed impacts:");
for (const contractId of EXPECTED_CONTRACT_ORDER) {
  const scopes = audit.supportedScopesByContract[contractId];
  console.log(`- ${contractId}: ${scopes.join(",")}`);
  for (const scope of scopes) {
    const impacts = audit.completedImpactsByContractScope[`${contractId}:${scope}`] ?? [];
    console.log(`  - ${scope}: ${impacts.length > 0 ? impacts.join(",") : "none"}`);
  }
}

console.log(
  `Missing Scope token fragments: ${audit.missingScopeTokenFragments.length > 0 ? audit.missingScopeTokenFragments.join(",") : "none"}`,
);
console.log(
  `Unresolved template tokens: ${audit.unresolvedTemplateTokens.length > 0 ? audit.unresolvedTemplateTokens.join(",") : "none"}`,
);
console.log(`Duplicate IDs: ${audit.duplicateIds.length > 0 ? audit.duplicateIds.join(",") : "none"}`);
console.log(
  `Duplicate privilege keys: ${audit.duplicatePrivilegeKeys.length > 0 ? audit.duplicatePrivilegeKeys.join(",") : "none"}`,
);
console.log(
  `Invalid Method ownership: ${audit.invalidMethodOwnership.length > 0 ? audit.invalidMethodOwnership.join(",") : "none"}`,
);
console.log(
  `Blank generated outcomes: ${audit.blankGeneratedOutcomes.length > 0 ? audit.blankGeneratedOutcomes.join(",") : "none"}`,
);
console.log(
  `Duplicate completed cells: ${audit.duplicateCompletedCells.length > 0 ? audit.duplicateCompletedCells.join(",") : "none"}`,
);
console.log(
  `Counter-resolution errors: ${audit.counterResolutionErrors.length > 0 ? audit.counterResolutionErrors.join(",") : "none"}`,
);

if (errors.length > 0) {
  console.error(`Structural errors: ${errors.join(",")}`);
  process.exitCode = 1;
} else if (process.argv.includes("--require-complete") && audit.missingCellCount > 0) {
  console.error(
    `Incomplete standard library: ${audit.missingCellCount} planned cells remain missing.`,
  );
  process.exitCode = 1;
} else {
  console.log("PASS roleplay compositional standard library audit");
}
