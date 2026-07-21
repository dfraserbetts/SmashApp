import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
function check(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  checks += 1;
}

const printPath = "app/campaign/[id]/characters/[characterId]/print/CharacterPrintMode.tsx";
const sheetPath = "app/campaign/[id]/characters/[characterId]/components/CharacterSheetPreview.tsx";
const builderPath = "app/campaign/[id]/characters/[characterId]/builder/page.tsx";
const projectionPath = "lib/restrictions/printProjection.ts";
const printSource = readFileSync(printPath, "utf8");
const sheetSource = readFileSync(sheetPath, "utf8");
const builderSource = readFileSync(builderPath, "utf8");
const projectionSource = readFileSync(projectionPath, "utf8");

check(
  printSource.includes("/restriction-governance`"),
  "Print Mode loads the existing Character Restriction governance endpoint.",
);
check(
  printSource.indexOf("projectCharacterRestrictionPrintData({") <
    printSource.indexOf("buildCharacterDerivedCombatStats({"),
  "Projection is declared before derived Character stats.",
);
check(
  printSource.indexOf("projectCharacterRestrictionPrintData({") <
    printSource.indexOf("summarizeCharacterPowers({"),
  "Projection is declared before printed Power budgets.",
);
check(
  printSource.indexOf("projectCharacterRestrictionPrintData({") <
    printSource.indexOf("<CharacterSheetPreview"),
  "Projection is declared before print preview props.",
);
check(
  printSource.includes("powers: projectedBuilderData.powers"),
  "Ordinary Power budget uses projected Powers.",
);
check(
  printSource.includes("projectedBuilderData.signatureMove ? [projectedBuilderData.signatureMove] : []"),
  "Signature Move budget uses the projected Signature Move.",
);
check(
  printSource.includes("builderData={projectedBuilderData}"),
  "CharacterSheetPreview receives projected Builder data.",
);
check(
  !printSource.includes("builderData={payload.character.builderData}"),
  "Raw Builder data is not passed as the print preview Builder-data prop.",
);
check(
  printSource.includes("Unapproved restricted content is omitted from the table-ready character sheets."),
  "Print Setup contains the required omission warning.",
);
check(
  printSource.includes('data-testid="restriction-print-projection-warning"'),
  "The warning has a stable integration hook.",
);
check(
  printSource.includes('<section className="character-print-controls'),
  "The warning remains inside the existing non-printing controls section.",
);
check(
  printSource.includes(".character-print-controls") && printSource.includes("display: none !important"),
  "Existing print CSS excludes Print Setup and its warning from paper/PDF.",
);
check(
  printSource.includes("Restriction governance is unavailable. Restricted content was omitted"),
  "Governance failure is prominent without destroying the printable draft.",
);
check(
  printSource.includes("<button") && printSource.includes("Print"),
  "The Print button remains available when content is omitted.",
);
check(
  !/restrictionDiscountPercent|economics|drawback|Net BPV/u.test(printSource),
  "Print integration activates no Restriction economics.",
);
check(
  !/server-only|@prisma\/client|@\/prisma\/client|React|window\.|document\./u.test(projectionSource),
  "The projection module has no server, Prisma, React, or browser dependency.",
);
check(
  !/restrictionDiscountPercent|economics|drawback|Net BPV/u.test(projectionSource),
  "The pure projection has no economic import or calculation.",
);
check(
  projectionSource.includes("powers:") &&
    projectionSource.includes("signatureMove:") &&
    projectionSource.includes("roleplayAbilities:"),
  "Projection changes all three governed Builder collections explicitly.",
);
check(
  sheetSource.includes("!signatureMove && powerBudget.powers.length === 0"),
  "Existing empty Power-sheet rendering remains safe when every Power is omitted.",
);
check(
  sheetSource.includes("powerBudget.powers.map"),
  "Power sheets continue to render the supplied projected budget.",
);
check(
  !builderSource.includes("projectCharacterRestrictionPrintData"),
  "Builder live preview remains outside the table-ready print projection.",
);

console.log(`Restriction print integration static smoke passed (${checks} checks).`);
