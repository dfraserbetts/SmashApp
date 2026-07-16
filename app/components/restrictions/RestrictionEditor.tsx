"use client";

import type {
  AbilityRestrictionDefinitionV1,
  RestrictionCampaignReference,
  RestrictionIssue,
  RestrictionParameterSchema,
  RestrictionParameterValue,
  RestrictionSubject,
} from "@/lib/restrictions";
import {
  RESTRICTION_EDITOR_AUTHORING_CHOICES,
  RESTRICTION_OPERATOR_LABELS,
  RESTRICTION_SYSTEM_ENUM_LABELS,
  getRestrictionIssuesForPath,
  getRestrictionParameterLabel,
  getRestrictionSubjectOptions,
  getSelectedStandardTemplate,
  getStandardParameterSchemas,
  getStandardTemplateOptions,
  replaceLockedRestriction,
  resolveRestrictionEditorDraft,
  selectRestrictionAuthoringChoice,
  selectRestrictionOperator,
  selectRestrictionSubject,
  selectRestrictionTemplate,
  setCustomRestrictionNarrative,
  setRestrictionDraftValue,
  type RestrictionEditorAuthoringChoice,
  type RestrictionEditorDraft,
  type RestrictionStandardDraft,
} from "@/lib/restrictions/editorModel";
import {
  RestrictionReadOnly,
  RestrictionStatusPanels,
} from "@/app/components/restrictions/RestrictionReadOnly";

export type RestrictionEditorProps = {
  draft: RestrictionEditorDraft;
  onDraftChange: (draft: RestrictionEditorDraft) => void;
  consumerNoun: "Power" | "Ability";
  disabled?: boolean;
  idPrefix?: string;
  resolveCampaignReferenceLabel?: (
    reference: RestrictionCampaignReference,
  ) => string | null;
  onConfirmReplace?: (
    currentDefinition: AbilityRestrictionDefinitionV1 | null,
    nextChoice: RestrictionEditorAuthoringChoice,
  ) => boolean;
};

const CONTROL_CLASS =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60";

function safeIdPrefix(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, "-");
}

function describedBy(...ids: Array<string | null | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

function FieldIssues({ issues, id }: { issues: RestrictionIssue[]; id: string }) {
  if (issues.length === 0) return null;
  return (
    <ul id={id} className="mt-1 space-y-1 text-xs">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}:${index}`}
          className={issue.severity === "error" ? "text-red-300" : "text-amber-200"}
          data-issue-code={issue.code}
        >
          {issue.severity === "error" ? "Error: " : "Warning: "}{issue.message}
        </li>
      ))}
    </ul>
  );
}

function authoringChoiceForDraft(draft: RestrictionEditorDraft): RestrictionEditorAuthoringChoice | null {
  if (draft.kind === "NONE") return "NONE";
  if (draft.kind === "STANDARD") return "STANDARD_STRUCTURED";
  if (draft.kind === "CUSTOM_NARRATIVE") return "CUSTOM_NARRATIVE";
  return null;
}

function numericDraftValue(value: RestrictionParameterValue | undefined): number | "" {
  return value && (
    value.kind === "NUMBER"
    || value.kind === "PERCENTAGE"
    || value.kind === "COUNT"
    || value.kind === "DISTANCE"
  ) ? value.value : "";
}

function numericParameterValue(
  schema: RestrictionParameterSchema,
  value: number,
): RestrictionParameterValue {
  if (schema.kind === "PERCENTAGE") return { kind: "PERCENTAGE", value };
  if (schema.kind === "COUNT") return { kind: "COUNT", value };
  if (schema.kind === "DISTANCE") return { kind: "DISTANCE", value, unit: "FEET" };
  return { kind: "NUMBER", value };
}

function StandardParameterControl({
  draft,
  schema,
  issues,
  idPrefix,
  disabled,
  onDraftChange,
}: {
  draft: RestrictionStandardDraft;
  schema: RestrictionParameterSchema;
  issues: RestrictionIssue[];
  idPrefix: string;
  disabled: boolean;
  onDraftChange: (draft: RestrictionEditorDraft) => void;
}) {
  const inputId = `${idPrefix}-value-${schema.key}`;
  const helpId = `${inputId}-help`;
  const issuesId = `${inputId}-issues`;
  const label = getRestrictionParameterLabel(draft, schema.key);
  const value = draft.values[schema.key];
  const hasError = issues.some((issue) => issue.severity === "error");

  if (schema.kind === "SYSTEM_ENUM") {
    const currentValue = value?.kind === "SYSTEM_ENUM" ? value.valueKey : "";
    return (
      <div>
        <label htmlFor={inputId} className="block text-xs font-medium text-zinc-300">{label}</label>
        <select
          id={inputId}
          value={currentValue}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={issues.length > 0 ? issuesId : undefined}
          className={CONTROL_CLASS}
          onChange={(event) => {
            const next = event.target.value;
            onDraftChange(setRestrictionDraftValue(
              draft,
              schema.key,
              next ? { kind: "SYSTEM_ENUM", valueKey: next } : null,
            ));
          }}
        >
          <option value="">Choose {label}</option>
          {(schema.allowedValueKeys ?? []).map((valueKey) => (
            <option key={valueKey} value={valueKey}>
              {RESTRICTION_SYSTEM_ENUM_LABELS[valueKey] ?? "Unavailable value"}
            </option>
          ))}
        </select>
        <FieldIssues issues={issues} id={issuesId} />
      </div>
    );
  }

  const unitText = schema.kind === "DISTANCE" ? "Distance is measured in feet." : null;
  const bounds = schema.minimum != null || schema.maximum != null
    ? `Allowed range: ${schema.minimum ?? "unbounded"} to ${schema.maximum ?? "unbounded"}.`
    : null;
  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-medium text-zinc-300">{label}</label>
      <div className={schema.kind === "DISTANCE" ? "flex items-center gap-2" : undefined}>
        <input
          id={inputId}
          type="number"
          value={numericDraftValue(value)}
          min={schema.minimum}
          max={schema.maximum}
          step={schema.kind === "NUMBER" || schema.kind === "PERCENTAGE" ? "any" : 1}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy(bounds || unitText ? helpId : null, issues.length > 0 ? issuesId : null)}
          className={CONTROL_CLASS}
          onChange={(event) => {
            if (event.target.value === "") {
              onDraftChange(setRestrictionDraftValue(draft, schema.key, null));
              return;
            }
            onDraftChange(setRestrictionDraftValue(
              draft,
              schema.key,
              numericParameterValue(schema, Number(event.target.value)),
            ));
          }}
        />
        {schema.kind === "DISTANCE" ? <span className="text-sm text-zinc-300">feet</span> : null}
      </div>
      {bounds || unitText ? <p id={helpId} className="mt-1 text-xs text-zinc-400">{[bounds, unitText].filter(Boolean).join(" ")}</p> : null}
      <FieldIssues issues={issues} id={issuesId} />
    </div>
  );
}

function LockedDraft({
  draft,
  consumerNoun,
  idPrefix,
  disabled,
  resolveCampaignReferenceLabel,
  onDraftChange,
  onConfirmReplace,
}: Required<Pick<RestrictionEditorProps, "draft" | "consumerNoun" | "disabled" | "onDraftChange">>
  & Pick<RestrictionEditorProps, "resolveCampaignReferenceLabel" | "onConfirmReplace">
  & { idPrefix: string }) {
  const definition = draft.kind === "CAMPAIGN_CUSTOM_READ_ONLY" || draft.kind === "UNSUPPORTED_READ_ONLY"
    ? draft.definition
    : null;
  const resolution = resolveRestrictionEditorDraft(draft, {
    consumerNoun,
    resolveCampaignReferenceLabel,
  });
  const explanation = draft.kind === "CAMPAIGN_CUSTOM_READ_ONLY"
    ? "Campaign-Custom authoring is not available yet. Replace or clear this definition deliberately to begin editable authoring."
    : draft.kind === "UNSUPPORTED_READ_ONLY"
      ? "This template is unsupported by the current editor. It remains intact until you deliberately replace or clear it."
      : "This malformed external definition cannot be edited safely. Replace or clear it deliberately.";

  const replace = (choice: RestrictionEditorAuthoringChoice) => {
    if (disabled) return;
    if (onConfirmReplace && !onConfirmReplace(definition, choice)) return;
    onDraftChange(replaceLockedRestriction(draft, choice));
  };

  return (
    <div className="space-y-3" data-restriction-locked-state={draft.kind}>
      {definition ? (
        <RestrictionReadOnly
          definition={definition}
          consumerNoun={consumerNoun}
          idPrefix={`${idPrefix}-locked-summary`}
          disabled
          resolveCampaignReferenceLabel={resolveCampaignReferenceLabel}
        />
      ) : (
        <RestrictionStatusPanels resolution={resolution} idPrefix={`${idPrefix}-malformed`} />
      )}
      <p className="rounded border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
        {explanation}
      </p>
      {!disabled ? (
        <fieldset className="space-y-2 rounded-md border border-zinc-700 p-3">
          <legend className="px-1 text-xs font-semibold text-zinc-200">Deliberate replacement</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {RESTRICTION_EDITOR_AUTHORING_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className="rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-left text-xs text-zinc-100 outline-none hover:border-zinc-400 focus-visible:ring-2 focus-visible:ring-emerald-500"
                onClick={() => replace(choice.value)}
              >
                Replace with {choice.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

export function RestrictionEditor({
  draft,
  onDraftChange,
  consumerNoun,
  disabled = false,
  idPrefix = "restriction-editor",
  resolveCampaignReferenceLabel,
  onConfirmReplace,
}: RestrictionEditorProps) {
  const prefix = safeIdPrefix(idPrefix);
  const headingId = `${prefix}-heading`;
  const resolution = resolveRestrictionEditorDraft(draft, {
    consumerNoun,
    resolveCampaignReferenceLabel,
  });

  if (
    draft.kind === "CAMPAIGN_CUSTOM_READ_ONLY"
    || draft.kind === "UNSUPPORTED_READ_ONLY"
    || draft.kind === "MALFORMED_READ_ONLY"
  ) {
    return (
      <section aria-labelledby={headingId} className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
        <h3 id={headingId} className="text-sm font-semibold text-zinc-100">Restriction Editor</h3>
        <LockedDraft
          draft={draft}
          consumerNoun={consumerNoun}
          idPrefix={prefix}
          disabled={disabled}
          resolveCampaignReferenceLabel={resolveCampaignReferenceLabel}
          onDraftChange={onDraftChange}
          onConfirmReplace={onConfirmReplace}
        />
      </section>
    );
  }

  const currentChoice = authoringChoiceForDraft(draft);
  const subjectIssues = getRestrictionIssuesForPath(resolution.issues, "subject");
  const templateIssues = getRestrictionIssuesForPath(resolution.issues, "templateKey");
  const operatorIssues = getRestrictionIssuesForPath(resolution.issues, "parameters.operator");

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4"
      data-restriction-editor="true"
    >
      <div>
        <h3 id={headingId} className="text-sm font-semibold text-zinc-100">Restriction Editor</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Author one whole-{consumerNoun} eligibility condition. This foundation does not enforce runtime eligibility or approval.
        </p>
      </div>

      <fieldset disabled={disabled} className="space-y-2 rounded-md border border-zinc-700 p-3">
        <legend className="px-1 text-xs font-semibold text-zinc-200">Restriction authoring</legend>
        {RESTRICTION_EDITOR_AUTHORING_CHOICES.map((choice) => {
          const inputId = `${prefix}-choice-${choice.value.toLowerCase()}`;
          return (
            <label key={choice.value} htmlFor={inputId} className="flex items-start gap-2 text-sm text-zinc-200">
              <input
                id={inputId}
                type="radio"
                name={`${prefix}-authoring-choice`}
                value={choice.value}
                checked={currentChoice === choice.value}
                disabled={disabled}
                className="mt-1 focus-visible:ring-2 focus-visible:ring-emerald-500"
                onChange={() => onDraftChange(selectRestrictionAuthoringChoice(draft, choice.value))}
              />
              <span>{choice.label}</span>
            </label>
          );
        })}
      </fieldset>

      {disabled ? (
        <p className="rounded border border-zinc-700 bg-zinc-950/60 p-2 text-xs text-zinc-400">
          The Restriction editor is disabled in the current context.
        </p>
      ) : null}

      {draft.kind === "STANDARD" ? (
        <div className="space-y-4" data-restriction-flow="Subject-Condition-Operator-Value">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${prefix}-subject`} className="block text-xs font-medium text-zinc-300">Subject</label>
              <select
                id={`${prefix}-subject`}
                value={draft.subject ?? ""}
                disabled={disabled}
                aria-invalid={subjectIssues.some((issue) => issue.severity === "error") || undefined}
                aria-describedby={subjectIssues.length > 0 ? `${prefix}-subject-issues` : undefined}
                className={CONTROL_CLASS}
                onChange={(event) => onDraftChange(selectRestrictionSubject(
                  draft,
                  (event.target.value || null) as RestrictionSubject | null,
                ))}
              >
                <option value="">Choose a Subject</option>
                {getRestrictionSubjectOptions().map((option) => (
                  <option key={option.value} value={option.value} disabled={!option.available}>
                    {option.label}{option.available ? "" : " — not available yet"}
                  </option>
                ))}
              </select>
              <FieldIssues issues={subjectIssues} id={`${prefix}-subject-issues`} />
            </div>

            <div>
              <label htmlFor={`${prefix}-condition`} className="block text-xs font-medium text-zinc-300">Condition</label>
              <select
                id={`${prefix}-condition`}
                value={draft.templateKey && draft.templateVersion != null
                  ? `${draft.templateKey}@${draft.templateVersion}`
                  : ""}
                disabled={disabled || !draft.subject}
                aria-invalid={templateIssues.some((issue) => issue.severity === "error") || undefined}
                aria-describedby={templateIssues.length > 0 ? `${prefix}-condition-issues` : undefined}
                className={CONTROL_CLASS}
                onChange={(event) => {
                  const option = getStandardTemplateOptions(draft.subject).find(
                    (entry) => `${entry.templateKey}@${entry.templateVersion}` === event.target.value,
                  );
                  onDraftChange(selectRestrictionTemplate(
                    draft,
                    option?.templateKey ?? null,
                    option?.templateVersion ?? null,
                  ));
                }}
              >
                <option value="">Choose a Condition</option>
                {getStandardTemplateOptions(draft.subject).map((option) => (
                  <option key={`${option.templateKey}@${option.templateVersion}`} value={`${option.templateKey}@${option.templateVersion}`}>
                    {option.label} — {option.conditionFamilyLabel}
                  </option>
                ))}
              </select>
              <FieldIssues issues={templateIssues} id={`${prefix}-condition-issues`} />
            </div>
          </div>

          {getSelectedStandardTemplate(draft) ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${prefix}-operator`} className="block text-xs font-medium text-zinc-300">Operator</label>
                <select
                  id={`${prefix}-operator`}
                  value={draft.operator ?? ""}
                  disabled={disabled}
                  aria-invalid={operatorIssues.some((issue) => issue.severity === "error") || undefined}
                  aria-describedby={operatorIssues.length > 0 ? `${prefix}-operator-issues` : undefined}
                  className={CONTROL_CLASS}
                  onChange={(event) => onDraftChange(selectRestrictionOperator(draft, event.target.value || null))}
                >
                  <option value="">Choose an Operator</option>
                  {getSelectedStandardTemplate(draft)?.supportedOperators.map((operator) => (
                    <option key={operator} value={operator}>{RESTRICTION_OPERATOR_LABELS[operator] ?? "Unavailable operator"}</option>
                  ))}
                </select>
                <FieldIssues issues={operatorIssues} id={`${prefix}-operator-issues`} />
              </div>

              {getStandardParameterSchemas(draft)
                .filter((schema) => schema.key !== "operator" && schema.kind !== "CAMPAIGN_REFERENCE")
                .map((schema) => (
                  <StandardParameterControl
                    key={schema.key}
                    draft={draft}
                    schema={schema}
                    issues={getRestrictionIssuesForPath(resolution.issues, `parameters.${schema.key}`)}
                    idPrefix={prefix}
                    disabled={disabled}
                    onDraftChange={onDraftChange}
                  />
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {draft.kind === "CUSTOM_NARRATIVE" ? (
        <div>
          <label htmlFor={`${prefix}-custom-narrative`} className="block text-xs font-medium text-zinc-300">
            Custom Restriction condition
          </label>
          <textarea
            id={`${prefix}-custom-narrative`}
            value={draft.text}
            rows={4}
            disabled={disabled}
            aria-invalid={getRestrictionIssuesForPath(resolution.issues, "customNarrativeText").some((issue) => issue.severity === "error") || undefined}
            aria-describedby={`${prefix}-custom-help${getRestrictionIssuesForPath(resolution.issues, "customNarrativeText").length > 0 ? ` ${prefix}-custom-issues` : ""}`}
            className={CONTROL_CLASS}
            onChange={(event) => onDraftChange(setCustomRestrictionNarrative(draft, event.target.value))}
          />
          <p id={`${prefix}-custom-help`} className="mt-1 text-xs text-zinc-400">
            Enter one eligibility condition. GD review and manual adjudication are required; prose is not parsed into executable logic.
          </p>
          <FieldIssues
            issues={getRestrictionIssuesForPath(resolution.issues, "customNarrativeText")}
            id={`${prefix}-custom-issues`}
          />
        </div>
      ) : null}

      <RestrictionStatusPanels resolution={resolution} idPrefix={prefix} />
    </section>
  );
}
