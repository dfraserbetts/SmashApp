import type { AbilityRestrictionDefinitionV1, RestrictionCampaignReference } from "@/lib/restrictions";
import {
  getRestrictionReadOnlyModel,
  type RestrictionDraftResolution,
} from "@/lib/restrictions/editorModel";

export type RestrictionReadOnlyProps = {
  definition: AbilityRestrictionDefinitionV1 | null;
  consumerNoun: "Power" | "Ability";
  idPrefix?: string;
  disabled?: boolean;
  resolveCampaignReferenceLabel?: (
    reference: RestrictionCampaignReference,
  ) => string | null;
};

function safeIdPrefix(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, "-");
}

export function RestrictionStatusPanels({
  resolution,
  idPrefix,
}: {
  resolution: RestrictionDraftResolution;
  idPrefix: string;
}) {
  const errors = resolution.issues.filter((issue) => issue.severity === "error");
  const warnings = resolution.issues.filter((issue) => issue.severity === "warning");
  const descriptorHeadingId = `${idPrefix}-descriptor-heading`;
  const evaluationHeadingId = `${idPrefix}-evaluation-heading`;
  const validationHeadingId = `${idPrefix}-validation-heading`;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <section
        aria-labelledby={descriptorHeadingId}
        className="rounded-md border border-zinc-700 bg-zinc-950/60 p-3"
        data-restriction-panel="descriptor"
      >
        <h4 id={descriptorHeadingId} className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
          Restriction Descriptor
        </h4>
        <p className="mt-2 text-sm text-zinc-100">
          {resolution.descriptor ?? (resolution.status === "NONE" ? "No Restriction" : "No descriptor is available.")}
        </p>
      </section>

      <section
        aria-labelledby={evaluationHeadingId}
        className="rounded-md border border-zinc-700 bg-zinc-950/60 p-3"
        data-restriction-panel="evaluation"
      >
        <h4 id={evaluationHeadingId} className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
          Evaluation Status
        </h4>
        <p className="mt-2 text-sm text-zinc-100">
          {resolution.evaluationLabel ?? "No evaluation capability applies."}
        </p>
        {resolution.evaluationLabel ? (
          <p className="mt-1 text-xs text-zinc-400">Metadata only; runtime enforcement is not implemented.</p>
        ) : null}
      </section>

      <section
        aria-labelledby={validationHeadingId}
        className="rounded-md border border-zinc-700 bg-zinc-950/60 p-3"
        data-restriction-panel="validation"
      >
        <h4 id={validationHeadingId} className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
          Validation Status
        </h4>
        {errors.length === 0 && warnings.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-200">No validation issues.</p>
        ) : null}
        {errors.length > 0 ? (
          <div className="mt-2 rounded border border-red-500/40 bg-red-950/30 p-2 text-red-200" role="alert">
            <p className="text-xs font-semibold">Errors</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
              {errors.map((issue, index) => (
                <li key={`${issue.code}:${issue.path ?? ""}:${index}`} data-issue-code={issue.code}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="mt-2 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-amber-200" role="status">
            <p className="text-xs font-semibold">Warnings</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
              {warnings.map((issue, index) => (
                <li key={`${issue.code}:${issue.path ?? ""}:${index}`} data-issue-code={issue.code}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function RestrictionReadOnly({
  definition,
  consumerNoun,
  idPrefix = "restriction-read-only",
  disabled = false,
  resolveCampaignReferenceLabel,
}: RestrictionReadOnlyProps) {
  const prefix = safeIdPrefix(idPrefix);
  const headingId = `${prefix}-heading`;
  const resolution = getRestrictionReadOnlyModel(definition, {
    consumerNoun,
    resolveCampaignReferenceLabel,
  });
  const unsupported = resolution.status === "UNSUPPORTED_READ_ONLY";
  const campaignCustom = resolution.status === "CAMPAIGN_CUSTOM_READ_ONLY";

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4"
      data-restriction-read-only="true"
    >
      <div>
        <h3 id={headingId} className="text-sm font-semibold text-zinc-100">Restriction</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Authoring mode: <span className="text-zinc-200">{resolution.authoringModeLabel}</span>
        </p>
        {disabled ? <p className="mt-1 text-xs text-zinc-400">This Restriction is read-only in the current context.</p> : null}
      </div>

      {campaignCustom ? (
        <p className="rounded border border-amber-500/40 bg-amber-950/30 p-2 text-xs text-amber-200">
          Campaign-Custom authoring is not available yet. The existing semantic definition remains intact.
        </p>
      ) : null}
      {unsupported && definition ? (
        <p className="rounded border border-amber-500/40 bg-amber-950/30 p-2 text-xs text-amber-200">
          Unsupported Restriction template: {definition.templateKey ?? "Unknown"}@{definition.templateVersion ?? "Unknown"}.
          The stored semantic definition has not been remapped.
        </p>
      ) : null}

      <RestrictionStatusPanels resolution={resolution} idPrefix={prefix} />
    </section>
  );
}
