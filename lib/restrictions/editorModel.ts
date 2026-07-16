import {
  RESTRICTION_CONDITION_FAMILIES,
  RESTRICTION_EVALUATION_LABELS,
  RESTRICTION_SUBJECTS,
  RESTRICTION_TEMPLATE_REGISTRY,
  findRestrictionTemplate,
  normalizeRestrictionDefinition,
  renderRestrictionDescriptor,
  validateRestrictionDefinition,
  type AbilityRestrictionDefinitionV1,
  type RestrictionConditionFamily,
  type RestrictionEvaluationCapability,
  type RestrictionIssue,
  type RestrictionParameterSchema,
  type RestrictionParameterValue,
  type RestrictionRenderContext,
  type RestrictionSubject,
  type RestrictionTemplateDefinition,
} from "@/lib/restrictions";

export const FULLY_CUSTOM_RESTRICTION_LABEL =
  "Fully Custom — GD Review and Manual Adjudication Required";

export const RESTRICTION_EDITOR_AUTHORING_CHOICES = [
  { value: "NONE", label: "No Restriction" },
  { value: "STANDARD_STRUCTURED", label: "Standard Structured" },
  { value: "CUSTOM_NARRATIVE", label: FULLY_CUSTOM_RESTRICTION_LABEL },
] as const;

export type RestrictionEditorAuthoringChoice =
  (typeof RESTRICTION_EDITOR_AUTHORING_CHOICES)[number]["value"];

export const RESTRICTION_SUBJECT_LABELS: Readonly<Record<RestrictionSubject, string>> = {
  THE_ACTOR: "The Actor",
  THE_TARGET: "The Target",
  THE_SCENE: "The Scene",
  LOCATION_OR_ZONE: "A Location or Zone",
  ITEM_OR_OBJECT: "An Item or Object",
  ANOTHER_CHARACTER_OR_GROUP: "Another Character or Group",
  OATH_OR_BEHAVIOUR: "An Oath or Behaviour",
};

export const RESTRICTION_CONDITION_FAMILY_LABELS: Readonly<
  Record<RestrictionConditionFamily, string>
> = {
  ACTOR_STATE: "Actor State",
  TARGET_IDENTITY: "Target Identity",
  TARGET_STATE: "Target State",
  EQUIPMENT_OR_ANCHOR_STATE: "Equipment or Anchor State",
  POSITION_OR_ZONE_STATE: "Position or Zone State",
  SCENE_OR_ENVIRONMENT_STATE: "Scene or Environment State",
  RELATED_ENTITY_OR_COUNT_STATE: "Related Entity or Count State",
  OATH_OR_BEHAVIOUR: "Oath or Behaviour",
};

export const RESTRICTION_OPERATOR_LABELS: Readonly<Record<string, string>> = {
  AT_OR_BELOW: "At or below",
  PRESENT: "Present",
  ABSENT: "Absent",
};

export const RESTRICTION_SYSTEM_ENUM_LABELS: Readonly<Record<string, string>> = {
  BLINDED: "Blinded",
  UNDEAD: "Undead",
  DIRECT_SUNLIGHT: "Direct Sunlight",
};

export type RestrictionTemplatePresentation = {
  templateKey: string;
  templateVersion: number;
  label: string;
  parameterLabels: Readonly<Record<string, string>>;
};

export const RESTRICTION_STANDARD_TEMPLATE_PRESENTATION: readonly RestrictionTemplatePresentation[] = [
  {
    templateKey: "ACTOR_PHYSICAL_HEALTH_PERCENTAGE",
    templateVersion: 1,
    label: "Actor Physical Health",
    parameterLabels: { operator: "Operator", percentage: "Physical Health percentage" },
  },
  {
    templateKey: "ACTOR_CONDITION",
    templateVersion: 1,
    label: "Actor Condition",
    parameterLabels: { operator: "Operator", condition: "Condition" },
  },
  {
    templateKey: "TARGET_STANDARD_TAG",
    templateVersion: 1,
    label: "Target Tag",
    parameterLabels: { operator: "Operator", tag: "Tag" },
  },
  {
    templateKey: "TARGET_HEALTH_PERCENTAGE",
    templateVersion: 1,
    label: "Target Physical Health",
    parameterLabels: { operator: "Operator", percentage: "Physical Health percentage" },
  },
  {
    templateKey: "SCENE_ENVIRONMENT_STATE",
    templateVersion: 1,
    label: "Scene Environment",
    parameterLabels: { operator: "Operator", environment: "Environment" },
  },
];

export type RestrictionStandardDraft = {
  kind: "STANDARD";
  subject: RestrictionSubject | null;
  templateKey: string | null;
  templateVersion: number | null;
  operator: string | null;
  values: Record<string, RestrictionParameterValue>;
};

export type RestrictionEditorDraft =
  | { kind: "NONE" }
  | RestrictionStandardDraft
  | { kind: "CUSTOM_NARRATIVE"; text: string }
  | {
      kind: "CAMPAIGN_CUSTOM_READ_ONLY";
      definition: AbilityRestrictionDefinitionV1;
      issues: RestrictionIssue[];
    }
  | {
      kind: "UNSUPPORTED_READ_ONLY";
      definition: AbilityRestrictionDefinitionV1;
      issues: RestrictionIssue[];
    }
  | { kind: "MALFORMED_READ_ONLY"; issues: RestrictionIssue[] };

export type RestrictionDraftResolutionStatus =
  | "NONE"
  | "INCOMPLETE"
  | "VALID"
  | "INVALID"
  | "UNSUPPORTED_READ_ONLY"
  | "CAMPAIGN_CUSTOM_READ_ONLY";

export type RestrictionDraftResolution = {
  status: RestrictionDraftResolutionStatus;
  definition: AbilityRestrictionDefinitionV1 | null;
  issues: RestrictionIssue[];
  descriptor: string | null;
  evaluationCapability: RestrictionEvaluationCapability | null;
  evaluationLabel: string | null;
  authoringModeLabel: string;
};

export type RestrictionEditorResolutionContext = RestrictionRenderContext;

function editorIssue(
  code: string,
  message: string,
  path: string,
  severity: RestrictionIssue["severity"] = "error",
): RestrictionIssue {
  return { code, message, path, severity };
}

function issueIdentity(issue: RestrictionIssue): string {
  return `${issue.code}:${issue.path ?? ""}:${issue.severity}`;
}

function uniqueIssues(issues: readonly RestrictionIssue[]): RestrictionIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const identity = issueIdentity(issue);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function templateIdentity(key: string, version: number): string {
  return `${key}@${version}`;
}

function presentationFor(
  key: string | null,
  version: number | null,
): RestrictionTemplatePresentation | null {
  if (!key || version == null) return null;
  return RESTRICTION_STANDARD_TEMPLATE_PRESENTATION.find(
    (entry) => entry.templateKey === key && entry.templateVersion === version,
  ) ?? null;
}

export function getRestrictionPresentationAuditIssues(): RestrictionIssue[] {
  const issues: RestrictionIssue[] = [];
  for (const subject of RESTRICTION_SUBJECTS) {
    if (!RESTRICTION_SUBJECT_LABELS[subject]) {
      issues.push(editorIssue("MISSING_SUBJECT_PRESENTATION", `Missing label for ${subject}.`, `subjects.${subject}`));
    }
  }
  for (const family of RESTRICTION_CONDITION_FAMILIES) {
    if (!RESTRICTION_CONDITION_FAMILY_LABELS[family]) {
      issues.push(editorIssue("MISSING_FAMILY_PRESENTATION", `Missing label for ${family}.`, `families.${family}`));
    }
  }

  const presentationIdentities = new Set<string>();
  for (const [index, entry] of RESTRICTION_STANDARD_TEMPLATE_PRESENTATION.entries()) {
    const identity = templateIdentity(entry.templateKey, entry.templateVersion);
    if (presentationIdentities.has(identity)) {
      issues.push(editorIssue("DUPLICATE_TEMPLATE_PRESENTATION", `Duplicate presentation ${identity}.`, `templates[${index}]`));
    }
    presentationIdentities.add(identity);
    const template = findRestrictionTemplate(entry.templateKey, entry.templateVersion);
    if (!template) {
      issues.push(editorIssue("ORPHAN_TEMPLATE_PRESENTATION", `Presentation ${identity} has no registry template.`, `templates[${index}]`));
      continue;
    }
    if (!template.supportedAuthoringModes.includes("STANDARD_STRUCTURED")) {
      issues.push(editorIssue("NON_STANDARD_TEMPLATE_PRESENTATION", `Presentation ${identity} is not Standard-authorable.`, `templates[${index}]`));
    }
    for (const parameter of template.parameterSchema) {
      if (!entry.parameterLabels[parameter.key]) {
        issues.push(editorIssue("MISSING_PARAMETER_PRESENTATION", `Missing label for ${identity} parameter ${parameter.key}.`, `templates[${index}].parameterLabels.${parameter.key}`));
      }
    }
  }

  for (const template of getStandardRestrictionTemplates()) {
    const identity = templateIdentity(template.key, template.version);
    if (!presentationIdentities.has(identity)) {
      issues.push(editorIssue("MISSING_TEMPLATE_PRESENTATION", `Missing presentation for ${identity}.`, `templates.${identity}`));
    }
    for (const operator of template.supportedOperators) {
      if (!RESTRICTION_OPERATOR_LABELS[operator]) {
        issues.push(editorIssue("MISSING_OPERATOR_PRESENTATION", `Missing label for operator ${operator}.`, `operators.${operator}`));
      }
    }
    for (const parameter of template.parameterSchema) {
      if (parameter.kind !== "SYSTEM_ENUM") continue;
      for (const valueKey of parameter.allowedValueKeys ?? []) {
        const labels = parameter.key === "operator"
          ? RESTRICTION_OPERATOR_LABELS
          : RESTRICTION_SYSTEM_ENUM_LABELS;
        if (!labels[valueKey]) {
          issues.push(editorIssue("MISSING_ENUM_PRESENTATION", `Missing label for ${valueKey}.`, `values.${valueKey}`));
        }
      }
    }
  }
  return uniqueIssues(issues);
}

export function getStandardRestrictionTemplates(): readonly RestrictionTemplateDefinition[] {
  return RESTRICTION_TEMPLATE_REGISTRY.filter((template) =>
    template.supportedAuthoringModes.includes("STANDARD_STRUCTURED"),
  );
}

export function getRestrictionSubjectOptions(): Array<{
  value: RestrictionSubject;
  label: string;
  available: boolean;
}> {
  const available = new Set(getStandardRestrictionTemplates().map((template) => template.subject));
  return RESTRICTION_SUBJECTS.map((subject) => ({
    value: subject,
    label: RESTRICTION_SUBJECT_LABELS[subject],
    available: available.has(subject),
  }));
}

export function getStandardTemplateOptions(subject: RestrictionSubject | null): Array<{
  templateKey: string;
  templateVersion: number;
  label: string;
  conditionFamily: RestrictionConditionFamily;
  conditionFamilyLabel: string;
}> {
  if (!subject) return [];
  return getStandardRestrictionTemplates()
    .filter((template) => template.subject === subject)
    .map((template) => {
      const presentation = presentationFor(template.key, template.version);
      return {
        templateKey: template.key,
        templateVersion: template.version,
        label: presentation?.label ?? "Unavailable condition",
        conditionFamily: template.conditionFamily,
        conditionFamilyLabel: RESTRICTION_CONDITION_FAMILY_LABELS[template.conditionFamily],
      };
    });
}

export function getSelectedStandardTemplate(
  draft: RestrictionStandardDraft,
): RestrictionTemplateDefinition | null {
  const template = findRestrictionTemplate(draft.templateKey, draft.templateVersion);
  return template?.supportedAuthoringModes.includes("STANDARD_STRUCTURED") ? template : null;
}

export function getStandardParameterSchemas(
  draft: RestrictionStandardDraft,
): readonly RestrictionParameterSchema[] {
  return getSelectedStandardTemplate(draft)?.parameterSchema ?? [];
}

export function getRestrictionParameterLabel(
  draft: RestrictionStandardDraft,
  parameterKey: string,
): string {
  return presentationFor(draft.templateKey, draft.templateVersion)?.parameterLabels[parameterKey]
    ?? "Value";
}

export function createEmptyRestrictionDraft(): RestrictionEditorDraft {
  return { kind: "NONE" };
}

function createEmptyStandardDraft(subject: RestrictionSubject | null = null): RestrictionStandardDraft {
  return {
    kind: "STANDARD",
    subject,
    templateKey: null,
    templateVersion: null,
    operator: null,
    values: {},
  };
}

function createDraftForTemplate(
  subject: RestrictionSubject,
  template: RestrictionTemplateDefinition,
): RestrictionStandardDraft {
  const operator = template.supportedOperators.length === 1
    ? template.supportedOperators[0]
    : null;
  const values: Record<string, RestrictionParameterValue> = {};
  for (const parameter of template.parameterSchema) {
    if (parameter.key === "operator" || parameter.kind !== "SYSTEM_ENUM") continue;
    if (parameter.allowedValueKeys?.length === 1) {
      values[parameter.key] = {
        kind: "SYSTEM_ENUM",
        valueKey: parameter.allowedValueKeys[0],
      };
    }
  }
  return {
    kind: "STANDARD",
    subject,
    templateKey: template.key,
    templateVersion: template.version,
    operator,
    values,
  };
}

export function createRestrictionDraftFromDefinition(input: unknown): RestrictionEditorDraft {
  if (input == null) return createEmptyRestrictionDraft();
  const normalized = normalizeRestrictionDefinition(input);
  if (!normalized.definition) {
    return {
      kind: "MALFORMED_READ_ONLY",
      issues: normalized.issues.length > 0
        ? normalized.issues
        : [editorIssue("INVALID_DEFINITION", "The Restriction definition is malformed.", "restriction")],
    };
  }
  const definition = normalized.definition;
  const validation = uniqueIssues([
    ...normalized.issues,
    ...validateRestrictionDefinition(definition),
  ]);
  if (definition.authoringMode === "CAMPAIGN_CUSTOM_STRUCTURED") {
    return { kind: "CAMPAIGN_CUSTOM_READ_ONLY", definition, issues: validation };
  }
  const errors = validation.filter((issue) => issue.severity === "error");
  if (errors.length > 0 && errors.every((issue) => issue.code === "UNKNOWN_TEMPLATE")) {
    return { kind: "UNSUPPORTED_READ_ONLY", definition, issues: validation };
  }
  if (errors.length > 0) {
    return { kind: "MALFORMED_READ_ONLY", issues: validation };
  }
  if (definition.authoringMode === "CUSTOM_NARRATIVE") {
    return { kind: "CUSTOM_NARRATIVE", text: definition.customNarrativeText ?? "" };
  }
  const template = findRestrictionTemplate(definition.templateKey, definition.templateVersion);
  if (!template || !template.supportedAuthoringModes.includes("STANDARD_STRUCTURED")) {
    return {
      kind: "UNSUPPORTED_READ_ONLY",
      definition,
      issues: validation.length > 0
        ? validation
        : [editorIssue("UNKNOWN_TEMPLATE", "This Restriction template is unsupported.", "templateKey")],
    };
  }
  const values = Object.fromEntries(
    Object.entries(definition.parameters).filter(([key]) => key !== "operator"),
  );
  const operatorValue = definition.parameters.operator;
  return {
    kind: "STANDARD",
    subject: template.subject,
    templateKey: template.key,
    templateVersion: template.version,
    operator: operatorValue?.kind === "SYSTEM_ENUM" ? operatorValue.valueKey : null,
    values,
  };
}

function isLockedDraft(draft: RestrictionEditorDraft): boolean {
  return draft.kind === "CAMPAIGN_CUSTOM_READ_ONLY"
    || draft.kind === "UNSUPPORTED_READ_ONLY"
    || draft.kind === "MALFORMED_READ_ONLY";
}

function draftForChoice(choice: RestrictionEditorAuthoringChoice): RestrictionEditorDraft {
  if (choice === "NONE") return createEmptyRestrictionDraft();
  if (choice === "CUSTOM_NARRATIVE") return { kind: "CUSTOM_NARRATIVE", text: "" };
  return createEmptyStandardDraft();
}

export function selectRestrictionAuthoringChoice(
  draft: RestrictionEditorDraft,
  choice: RestrictionEditorAuthoringChoice,
): RestrictionEditorDraft {
  if (isLockedDraft(draft)) return draft;
  return draftForChoice(choice);
}

export function replaceLockedRestriction(
  draft: RestrictionEditorDraft,
  choice: RestrictionEditorAuthoringChoice,
): RestrictionEditorDraft {
  return isLockedDraft(draft) ? draftForChoice(choice) : draft;
}

export function selectRestrictionSubject(
  draft: RestrictionEditorDraft,
  subject: RestrictionSubject | null,
): RestrictionEditorDraft {
  if (draft.kind !== "STANDARD") return draft;
  if (draft.subject === subject) return draft;
  const next = createEmptyStandardDraft(subject);
  const options = getStandardTemplateOptions(subject);
  if (subject && options.length === 1) {
    const template = findRestrictionTemplate(options[0].templateKey, options[0].templateVersion);
    if (template) return createDraftForTemplate(subject, template);
  }
  return next;
}

export function selectRestrictionTemplate(
  draft: RestrictionEditorDraft,
  templateKey: string | null,
  templateVersion: number | null,
): RestrictionEditorDraft {
  if (draft.kind !== "STANDARD") return draft;
  if (!templateKey || templateVersion == null) return createEmptyStandardDraft(draft.subject);
  const template = findRestrictionTemplate(templateKey, templateVersion);
  if (
    !draft.subject
    || !template
    || template.subject !== draft.subject
    || !template.supportedAuthoringModes.includes("STANDARD_STRUCTURED")
  ) {
    return draft;
  }
  return createDraftForTemplate(draft.subject, template);
}

function valueMatchesSchema(
  value: RestrictionParameterValue,
  schema: RestrictionParameterSchema,
): boolean {
  if (value.kind !== schema.kind) return false;
  if (value.kind === "SYSTEM_ENUM") {
    return !schema.allowedValueKeys || schema.allowedValueKeys.includes(value.valueKey);
  }
  return value.kind !== "CAMPAIGN_REFERENCE";
}

export function selectRestrictionOperator(
  draft: RestrictionEditorDraft,
  operator: string | null,
): RestrictionEditorDraft {
  if (draft.kind !== "STANDARD") return draft;
  const template = getSelectedStandardTemplate(draft);
  if (!template || (operator != null && !template.supportedOperators.includes(operator))) return draft;
  if (draft.operator === operator) return draft;
  const schemaByKey = new Map(template.parameterSchema.map((schema) => [schema.key, schema]));
  const values = Object.fromEntries(
    Object.entries(draft.values).filter(([key, value]) => {
      const schema = schemaByKey.get(key);
      return Boolean(schema && key !== "operator" && valueMatchesSchema(value, schema));
    }),
  );
  return { ...draft, operator, values };
}

export function setRestrictionDraftValue(
  draft: RestrictionEditorDraft,
  parameterKey: string,
  value: RestrictionParameterValue | null,
): RestrictionEditorDraft {
  if (draft.kind !== "STANDARD") return draft;
  const schema = getStandardParameterSchemas(draft).find((entry) => entry.key === parameterKey);
  if (!schema || schema.key === "operator" || schema.kind === "CAMPAIGN_REFERENCE") return draft;
  if (value && !valueMatchesSchema(value, schema)) return draft;
  const values = { ...draft.values };
  if (value) values[parameterKey] = value;
  else delete values[parameterKey];
  return { ...draft, values };
}

export function setCustomRestrictionNarrative(
  draft: RestrictionEditorDraft,
  text: string,
): RestrictionEditorDraft {
  return draft.kind === "CUSTOM_NARRATIVE" ? { ...draft, text } : draft;
}

function incompleteResolution(
  issues: RestrictionIssue[],
  authoringModeLabel: string,
  evaluationCapability: RestrictionEvaluationCapability | null = null,
): RestrictionDraftResolution {
  return {
    status: "INCOMPLETE",
    definition: null,
    issues,
    descriptor: null,
    evaluationCapability,
    evaluationLabel: evaluationCapability
      ? RESTRICTION_EVALUATION_LABELS[evaluationCapability]
      : null,
    authoringModeLabel,
  };
}

function readOnlyResolution(
  draft: Extract<RestrictionEditorDraft, { definition: AbilityRestrictionDefinitionV1 }>,
  context: RestrictionEditorResolutionContext,
): RestrictionDraftResolution {
  const template = findRestrictionTemplate(
    draft.definition.templateKey,
    draft.definition.templateVersion,
  );
  const rendered = renderRestrictionDescriptor(draft.definition, context);
  const issues = uniqueIssues([...draft.issues, ...rendered.issues]);
  const campaignCustom = draft.kind === "CAMPAIGN_CUSTOM_READ_ONLY";
  return {
    status: campaignCustom ? "CAMPAIGN_CUSTOM_READ_ONLY" : "UNSUPPORTED_READ_ONLY",
    definition: draft.definition,
    issues,
    descriptor: rendered.descriptor,
    evaluationCapability: template?.evaluationCapability ?? null,
    evaluationLabel: template
      ? RESTRICTION_EVALUATION_LABELS[template.evaluationCapability]
      : null,
    authoringModeLabel: campaignCustom
      ? "Campaign-Custom Structured"
      : "Unsupported Structured Restriction",
  };
}

export function resolveRestrictionEditorDraft(
  draft: RestrictionEditorDraft,
  context: RestrictionEditorResolutionContext,
): RestrictionDraftResolution {
  if (draft.kind === "NONE") {
    return {
      status: "NONE",
      definition: null,
      issues: [],
      descriptor: null,
      evaluationCapability: null,
      evaluationLabel: null,
      authoringModeLabel: "No Restriction",
    };
  }
  if (draft.kind === "CAMPAIGN_CUSTOM_READ_ONLY" || draft.kind === "UNSUPPORTED_READ_ONLY") {
    return readOnlyResolution(draft, context);
  }
  if (draft.kind === "MALFORMED_READ_ONLY") {
    return {
      status: "INVALID",
      definition: null,
      issues: draft.issues,
      descriptor: null,
      evaluationCapability: null,
      evaluationLabel: null,
      authoringModeLabel: "Malformed Restriction",
    };
  }
  if (draft.kind === "CUSTOM_NARRATIVE") {
    const normalized = normalizeRestrictionDefinition({
      schemaVersion: 1,
      authoringMode: "CUSTOM_NARRATIVE",
      templateKey: null,
      templateVersion: null,
      parameters: {},
      customNarrativeText: draft.text,
    });
    const definition = normalized.definition;
    const validation = definition ? validateRestrictionDefinition(definition) : [];
    const issues = uniqueIssues([...normalized.issues, ...validation]);
    if (!definition || issues.some((issue) => issue.severity === "error")) {
      const incomplete = issues.some((issue) => issue.code === "BLANK_CUSTOM_NARRATIVE");
      return {
        ...(incompleteResolution(issues, FULLY_CUSTOM_RESTRICTION_LABEL, "GD_ADJUDICATION")),
        status: incomplete ? "INCOMPLETE" : "INVALID",
      };
    }
    const rendered = renderRestrictionDescriptor(definition, context);
    return {
      status: "VALID",
      definition,
      issues: uniqueIssues([...issues, ...rendered.issues]),
      descriptor: rendered.descriptor,
      evaluationCapability: "GD_ADJUDICATION",
      evaluationLabel: RESTRICTION_EVALUATION_LABELS.GD_ADJUDICATION,
      authoringModeLabel: FULLY_CUSTOM_RESTRICTION_LABEL,
    };
  }

  const incomplete: RestrictionIssue[] = [];
  if (!draft.subject) {
    incomplete.push(editorIssue("EDITOR_SUBJECT_REQUIRED", "Choose a Subject.", "subject"));
  }
  const template = getSelectedStandardTemplate(draft);
  if (!draft.templateKey || draft.templateVersion == null) {
    incomplete.push(editorIssue("EDITOR_TEMPLATE_REQUIRED", "Choose a Condition.", "templateKey"));
  } else if (!template) {
    return {
      status: "INVALID",
      definition: null,
      issues: [editorIssue("EDITOR_TEMPLATE_INVALID", "The selected Condition is unavailable.", "templateKey")],
      descriptor: null,
      evaluationCapability: null,
      evaluationLabel: null,
      authoringModeLabel: "Standard Structured",
    };
  }
  if (template && !draft.operator) {
    incomplete.push(editorIssue("EDITOR_OPERATOR_REQUIRED", "Choose an Operator.", "parameters.operator"));
  }
  if (template) {
    for (const parameter of template.parameterSchema) {
      if (parameter.key === "operator") continue;
      if (parameter.required && !draft.values[parameter.key]) {
        incomplete.push(editorIssue("EDITOR_VALUE_REQUIRED", `Choose ${getRestrictionParameterLabel(draft, parameter.key)}.`, `parameters.${parameter.key}`));
      }
    }
  }
  if (incomplete.length > 0) {
    return incompleteResolution(
      incomplete,
      "Standard Structured",
      template?.evaluationCapability ?? null,
    );
  }
  if (!template || !draft.subject || !draft.operator) {
    return incompleteResolution(incomplete, "Standard Structured");
  }

  const allowedKeys = new Set(template.parameterSchema.map((parameter) => parameter.key));
  const unknownKeys = Object.keys(draft.values).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return {
      status: "INVALID",
      definition: null,
      issues: unknownKeys.map((key) => editorIssue("EDITOR_UNKNOWN_PARAMETER", `Unknown parameter ${key}.`, `parameters.${key}`)),
      descriptor: null,
      evaluationCapability: template.evaluationCapability,
      evaluationLabel: RESTRICTION_EVALUATION_LABELS[template.evaluationCapability],
      authoringModeLabel: "Standard Structured",
    };
  }

  const parameters: Record<string, RestrictionParameterValue> = {
    operator: { kind: "SYSTEM_ENUM", valueKey: draft.operator },
  };
  for (const parameter of template.parameterSchema) {
    if (parameter.key === "operator") continue;
    const value = draft.values[parameter.key];
    if (value) parameters[parameter.key] = value;
  }
  const normalized = normalizeRestrictionDefinition({
    schemaVersion: 1,
    authoringMode: "STANDARD_STRUCTURED",
    templateKey: template.key,
    templateVersion: template.version,
    parameters,
    customNarrativeText: null,
  });
  const definition = normalized.definition;
  const validation = definition
    ? validateRestrictionDefinition(definition, { claimedSubject: draft.subject })
    : [];
  const issues = uniqueIssues([...normalized.issues, ...validation]);
  if (!definition || issues.some((issue) => issue.severity === "error")) {
    return {
      status: "INVALID",
      definition: null,
      issues,
      descriptor: null,
      evaluationCapability: template.evaluationCapability,
      evaluationLabel: RESTRICTION_EVALUATION_LABELS[template.evaluationCapability],
      authoringModeLabel: "Standard Structured",
    };
  }
  const rendered = renderRestrictionDescriptor(definition, context);
  const combinedIssues = uniqueIssues([...issues, ...rendered.issues]);
  if (combinedIssues.some((issue) => issue.severity === "error")) {
    return {
      status: "INVALID",
      definition: null,
      issues: combinedIssues,
      descriptor: null,
      evaluationCapability: template.evaluationCapability,
      evaluationLabel: RESTRICTION_EVALUATION_LABELS[template.evaluationCapability],
      authoringModeLabel: "Standard Structured",
    };
  }
  return {
    status: "VALID",
    definition,
    issues: combinedIssues,
    descriptor: rendered.descriptor,
    evaluationCapability: template.evaluationCapability,
    evaluationLabel: RESTRICTION_EVALUATION_LABELS[template.evaluationCapability],
    authoringModeLabel: "Standard Structured",
  };
}

export function getRestrictionIssuesForPath(
  issues: readonly RestrictionIssue[],
  path: string,
): RestrictionIssue[] {
  return issues.filter((issue) => issue.path === path);
}

export function getRestrictionReadOnlyModel(
  definition: unknown,
  context: RestrictionEditorResolutionContext,
): RestrictionDraftResolution {
  return resolveRestrictionEditorDraft(createRestrictionDraftFromDefinition(definition), context);
}
