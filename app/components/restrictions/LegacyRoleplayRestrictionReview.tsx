"use client";

import type { LegacyRoleplayRestrictionSource } from "@/lib/restrictions/persistence";
import type { RestrictionIssue } from "@/lib/restrictions";
import type { RestrictionEditorAuthoringChoice } from "@/lib/restrictions/editorModel";

export type LegacyRoleplayRestrictionReviewProps = {
  legacySource: LegacyRoleplayRestrictionSource;
  issues: RestrictionIssue[];
  editable: boolean;
  disabled?: boolean;
  onReplace: (choice: RestrictionEditorAuthoringChoice) => void;
};

const REPLACEMENTS: Array<{
  choice: RestrictionEditorAuthoringChoice;
  label: string;
}> = [
  { choice: "NONE", label: "Replace with No Restriction" },
  { choice: "STANDARD_STRUCTURED", label: "Replace with Standard Structured" },
  {
    choice: "CUSTOM_NARRATIVE",
    label: "Replace with Fully Custom — GD Review and Manual Adjudication Required",
  },
];

function detail(label: string, value: string) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">{value}</dd>
    </div>
  );
}

export function LegacyRoleplayRestrictionReview({
  legacySource,
  issues,
  editable,
  disabled = false,
  onReplace,
}: LegacyRoleplayRestrictionReviewProps) {
  const confirmReplacement = (choice: RestrictionEditorAuthoringChoice, label: string) => {
    if (!window.confirm(
      `${label}? This will permanently replace the stored legacy Roleplay Restriction representation.`,
    )) return;
    onReplace(choice);
  };

  return (
    <section
      className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-950/20 p-4"
      data-roleplay-legacy-restriction-review="true"
    >
      <div>
        <h3 className="text-sm font-semibold text-amber-100">Legacy Restriction Review Required</h3>
        <p className="mt-1 text-xs text-amber-200">
          This old value could not be migrated safely. Saving is blocked until it is deliberately replaced or cleared.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {detail("Legacy Restriction Type", legacySource.restrictionType)}
        {detail("Legacy Restriction Band", legacySource.restrictionBand)}
        {detail("Legacy Target Phrase", legacySource.restrictionTag)}
        {detail("Legacy Restriction Text", legacySource.restrictionText)}
      </dl>

      {issues.length > 0 ? (
        <div className="rounded border border-amber-500/40 bg-zinc-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Migration diagnostics</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100">
            {issues.map((issue, index) => (
              <li key={`${issue.code}:${issue.path ?? ""}:${index}`} data-issue-code={issue.code}>
                <span className="font-mono">[{issue.code}]</span> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editable ? (
        <div className="flex flex-wrap gap-2">
          {REPLACEMENTS.map(({ choice, label }) => (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              onClick={() => confirmReplacement(choice, label)}
              className="rounded-md border border-amber-500/50 bg-zinc-950 px-3 py-2 text-xs text-amber-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
