export const RESTRICTION_AUTHORING_MODES = [
  "STANDARD_STRUCTURED",
  "CAMPAIGN_CUSTOM_STRUCTURED",
  "CUSTOM_NARRATIVE",
] as const;

export type RestrictionAuthoringMode = (typeof RESTRICTION_AUTHORING_MODES)[number];

export const RESTRICTION_SUBJECTS = [
  "THE_ACTOR",
  "THE_TARGET",
  "THE_SCENE",
  "LOCATION_OR_ZONE",
  "ITEM_OR_OBJECT",
  "ANOTHER_CHARACTER_OR_GROUP",
  "OATH_OR_BEHAVIOUR",
] as const;

export type RestrictionSubject = (typeof RESTRICTION_SUBJECTS)[number];

export const RESTRICTION_CONDITION_FAMILIES = [
  "ACTOR_STATE",
  "TARGET_IDENTITY",
  "TARGET_STATE",
  "EQUIPMENT_OR_ANCHOR_STATE",
  "POSITION_OR_ZONE_STATE",
  "SCENE_OR_ENVIRONMENT_STATE",
  "RELATED_ENTITY_OR_COUNT_STATE",
  "OATH_OR_BEHAVIOUR",
] as const;

export type RestrictionConditionFamily =
  (typeof RESTRICTION_CONDITION_FAMILIES)[number];

export const RESTRICTION_EVALUATION_CAPABILITIES = [
  "AUTOMATIC",
  "SCENE_CONTEXT",
  "GD_ADJUDICATION",
] as const;

export type RestrictionEvaluationCapability =
  (typeof RESTRICTION_EVALUATION_CAPABILITIES)[number];

export const RESTRICTION_EVALUATION_LABELS: Readonly<
  Record<RestrictionEvaluationCapability, string>
> = {
  AUTOMATIC: "Automatically checked",
  SCENE_CONTEXT: "Checked through scene context",
  GD_ADJUDICATION: "Requires GD adjudication",
};

export type RestrictionCampaignReference = {
  kind: "CAMPAIGN_REFERENCE";
  campaignId: string;
  valueKind: "ANCHOR" | "ZONE" | "OATH" | "TAG";
  valueId: string;
};

export type RestrictionParameterValue =
  | { kind: "NUMBER"; value: number }
  | { kind: "PERCENTAGE"; value: number }
  | { kind: "SYSTEM_ENUM"; valueKey: string }
  | { kind: "DISTANCE"; value: number; unit: "FEET" }
  | { kind: "COUNT"; value: number }
  | RestrictionCampaignReference;

export type AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1;
  authoringMode: RestrictionAuthoringMode;
  templateKey: string | null;
  templateVersion: number | null;
  parameters: Record<string, RestrictionParameterValue>;
  customNarrativeText: string | null;
};

export type RestrictionIssueSeverity = "error" | "warning";

export type RestrictionIssue = {
  code: string;
  severity: RestrictionIssueSeverity;
  message: string;
  path?: string;
};

export type RestrictionNormalizationResult = {
  definition: AbilityRestrictionDefinitionV1 | null;
  issues: RestrictionIssue[];
};

export type RestrictionValueSource = "SYSTEM" | "CAMPAIGN_REFERENCE";
export type RestrictionParameterKind = RestrictionParameterValue["kind"];

export type RestrictionParameterSchema = {
  key: string;
  kind: RestrictionParameterKind;
  required: boolean;
  allowedValueKeys?: readonly string[];
  allowedReferenceKinds?: readonly RestrictionCampaignReference["valueKind"][];
  minimum?: number;
  maximum?: number;
};

export type RestrictionValidationContext = {
  campaignId?: string;
  claimedSubject?: RestrictionSubject;
  claimedEvaluationCapability?: RestrictionEvaluationCapability;
  intrinsicTargetTags?: readonly string[];
  resolveCampaignReference?: (
    reference: RestrictionCampaignReference,
  ) => { status: "RESOLVED" | "UNRESOLVED" | "STALE"; label?: string };
};

export type RestrictionRenderContext = {
  consumerNoun: "Power" | "Ability";
  resolveCampaignReferenceLabel?: (
    reference: RestrictionCampaignReference,
  ) => string | null;
};

export type RestrictionTemplateDefinition = {
  key: string;
  version: number;
  subject: RestrictionSubject;
  conditionFamily: RestrictionConditionFamily;
  supportedAuthoringModes: readonly Exclude<
    RestrictionAuthoringMode,
    "CUSTOM_NARRATIVE"
  >[];
  supportedOperators: readonly string[];
  parameterSchema: readonly RestrictionParameterSchema[];
  supportedValueSources: readonly RestrictionValueSource[];
  evaluationCapability: RestrictionEvaluationCapability;
  validate: (
    definition: AbilityRestrictionDefinitionV1,
    context?: RestrictionValidationContext,
  ) => RestrictionIssue[];
  render: (
    definition: AbilityRestrictionDefinitionV1,
    context: RestrictionRenderContext,
  ) => { text: string | null; issues: RestrictionIssue[] };
};

const issue = (
  code: string,
  severity: RestrictionIssueSeverity,
  message: string,
  path?: string,
): RestrictionIssue => ({ code, severity, message, ...(path ? { path } : {}) });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeNarrative(value: string): string {
  return normalizeWhitespace(value).replace(/^(?:restriction\s*:\s*)+/iu, "").trim();
}

function withTerminalPeriod(value: string): string {
  return `${value.trim().replace(/[.!?]+$/u, "")}.`;
}

function enumValue(definition: AbilityRestrictionDefinitionV1, key: string): string | null {
  const value = definition.parameters[key];
  return value?.kind === "SYSTEM_ENUM" ? value.valueKey : null;
}

function numericValue(definition: AbilityRestrictionDefinitionV1, key: string): number | null {
  const value = definition.parameters[key];
  return value && (value.kind === "NUMBER" || value.kind === "PERCENTAGE" || value.kind === "DISTANCE" || value.kind === "COUNT")
    ? value.value
    : null;
}

function referenceValue(
  definition: AbilityRestrictionDefinitionV1,
  key: string,
): RestrictionCampaignReference | null {
  const value = definition.parameters[key];
  return value?.kind === "CAMPAIGN_REFERENCE" ? value : null;
}

function labelFor(
  definition: AbilityRestrictionDefinitionV1,
  key: string,
  context: RestrictionRenderContext,
): { label: string | null; issues: RestrictionIssue[] } {
  const reference = referenceValue(definition, key);
  if (!reference) {
    return {
      label: null,
      issues: [issue("MISSING_CAMPAIGN_REFERENCE", "error", "A campaign reference is required.", `parameters.${key}`)],
    };
  }
  const label = context.resolveCampaignReferenceLabel?.(reference)?.trim() || null;
  return label
    ? { label, issues: [] }
    : {
        label: null,
        issues: [issue("UNRESOLVED_CAMPAIGN_REFERENCE", "error", "The campaign reference label could not be resolved.", `parameters.${key}`)],
      };
}

function rendered(text: string): { text: string; issues: RestrictionIssue[] } {
  return { text: `Restriction: ${withTerminalPeriod(text)}`, issues: [] };
}

function schema(
  key: string,
  kind: RestrictionParameterKind,
  options: Omit<RestrictionParameterSchema, "key" | "kind" | "required"> = {},
): RestrictionParameterSchema {
  return { key, kind, required: true, ...options };
}

function sharedTemplateValidation(
  definition: AbilityRestrictionDefinitionV1,
  context?: RestrictionValidationContext,
): RestrictionIssue[] {
  return validateRestrictionDefinition(definition, context, true);
}

type RegistrySeed = Omit<RestrictionTemplateDefinition, "validate">;

const proofRegistrySeeds: RegistrySeed[] = [
  {
    key: "ACTOR_PHYSICAL_HEALTH_PERCENTAGE",
    version: 1,
    subject: "THE_ACTOR",
    conditionFamily: "ACTOR_STATE",
    supportedAuthoringModes: ["STANDARD_STRUCTURED"],
    supportedOperators: ["AT_OR_BELOW"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["AT_OR_BELOW"] }),
      schema("percentage", "PERCENTAGE", { minimum: 0, maximum: 100 }),
    ],
    supportedValueSources: ["SYSTEM"],
    evaluationCapability: "AUTOMATIC",
    render: (definition, context) => rendered(`This ${context.consumerNoun} may only be used while the actor is at or below ${numericValue(definition, "percentage")}% of maximum Physical Health`),
  },
  {
    key: "ACTOR_CONDITION",
    version: 1,
    subject: "THE_ACTOR",
    conditionFamily: "ACTOR_STATE",
    supportedAuthoringModes: ["STANDARD_STRUCTURED"],
    supportedOperators: ["PRESENT", "ABSENT"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["PRESENT", "ABSENT"] }),
      schema("condition", "SYSTEM_ENUM", { allowedValueKeys: ["BLINDED"] }),
    ],
    supportedValueSources: ["SYSTEM"],
    evaluationCapability: "AUTOMATIC",
    render: (definition, context) => rendered(`This ${context.consumerNoun} may only be used while the actor is ${enumValue(definition, "operator") === "ABSENT" ? "not " : ""}${enumValue(definition, "condition") === "BLINDED" ? "Blinded" : enumValue(definition, "condition")}`),
  },
  {
    key: "TARGET_STANDARD_TAG",
    version: 1,
    subject: "THE_TARGET",
    conditionFamily: "TARGET_IDENTITY",
    supportedAuthoringModes: ["STANDARD_STRUCTURED"],
    supportedOperators: ["PRESENT", "ABSENT"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["PRESENT", "ABSENT"] }),
      schema("tag", "SYSTEM_ENUM", { allowedValueKeys: ["UNDEAD"] }),
    ],
    supportedValueSources: ["SYSTEM"],
    evaluationCapability: "AUTOMATIC",
    render: (definition, context) => rendered(`This ${context.consumerNoun} may only target a character ${enumValue(definition, "operator") === "ABSENT" ? "without" : "with"} the ${enumValue(definition, "tag") === "UNDEAD" ? "Undead" : enumValue(definition, "tag")} tag`),
  },
  {
    key: "TARGET_HEALTH_PERCENTAGE",
    version: 1,
    subject: "THE_TARGET",
    conditionFamily: "TARGET_STATE",
    supportedAuthoringModes: ["STANDARD_STRUCTURED"],
    supportedOperators: ["AT_OR_BELOW"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["AT_OR_BELOW"] }),
      schema("percentage", "PERCENTAGE", { minimum: 0, maximum: 100 }),
    ],
    supportedValueSources: ["SYSTEM"],
    evaluationCapability: "AUTOMATIC",
    render: (definition, context) => rendered(`This ${context.consumerNoun} may only target a character at or below ${numericValue(definition, "percentage")}% of maximum Physical Health`),
  },
  {
    key: "ACTOR_ANCHOR_PROXIMITY",
    version: 1,
    subject: "ITEM_OR_OBJECT",
    conditionFamily: "EQUIPMENT_OR_ANCHOR_STATE",
    supportedAuthoringModes: ["CAMPAIGN_CUSTOM_STRUCTURED"],
    supportedOperators: ["WITHIN_DISTANCE"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["WITHIN_DISTANCE"] }),
      schema("distance", "DISTANCE", { minimum: 0, maximum: 1000 }),
      schema("anchor", "CAMPAIGN_REFERENCE", { allowedReferenceKinds: ["ANCHOR"] }),
    ],
    supportedValueSources: ["SYSTEM", "CAMPAIGN_REFERENCE"],
    evaluationCapability: "SCENE_CONTEXT",
    render: (definition, context) => {
      const resolved = labelFor(definition, "anchor", context);
      return resolved.label ? rendered(`This ${context.consumerNoun} may only be used while the actor remains within ${numericValue(definition, "distance")} feet of ${resolved.label}`) : { text: null, issues: resolved.issues };
    },
  },
  {
    key: "ACTOR_ZONE_MEMBERSHIP",
    version: 1,
    subject: "LOCATION_OR_ZONE",
    conditionFamily: "POSITION_OR_ZONE_STATE",
    supportedAuthoringModes: ["CAMPAIGN_CUSTOM_STRUCTURED"],
    supportedOperators: ["INSIDE", "OUTSIDE"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["INSIDE", "OUTSIDE"] }),
      schema("zone", "CAMPAIGN_REFERENCE", { allowedReferenceKinds: ["ZONE"] }),
    ],
    supportedValueSources: ["SYSTEM", "CAMPAIGN_REFERENCE"],
    evaluationCapability: "SCENE_CONTEXT",
    render: (definition, context) => {
      const resolved = labelFor(definition, "zone", context);
      return resolved.label ? rendered(`This ${context.consumerNoun} may only be used while the actor remains ${enumValue(definition, "operator") === "OUTSIDE" ? "outside" : "inside"} the ${resolved.label}`) : { text: null, issues: resolved.issues };
    },
  },
  {
    key: "SCENE_ENVIRONMENT_STATE",
    version: 1,
    subject: "THE_SCENE",
    conditionFamily: "SCENE_OR_ENVIRONMENT_STATE",
    supportedAuthoringModes: ["STANDARD_STRUCTURED"],
    supportedOperators: ["PRESENT", "ABSENT"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["PRESENT", "ABSENT"] }),
      schema("environment", "SYSTEM_ENUM", { allowedValueKeys: ["DIRECT_SUNLIGHT"] }),
    ],
    supportedValueSources: ["SYSTEM"],
    evaluationCapability: "SCENE_CONTEXT",
    render: (definition, context) => rendered(`This ${context.consumerNoun} may only be used while the scene is ${enumValue(definition, "operator") === "ABSENT" ? "not in" : "in"} Direct Sunlight`),
  },
  {
    key: "RELATED_ALLIED_TAGGED_ENTITY_COUNT",
    version: 1,
    subject: "ANOTHER_CHARACTER_OR_GROUP",
    conditionFamily: "RELATED_ENTITY_OR_COUNT_STATE",
    supportedAuthoringModes: ["CAMPAIGN_CUSTOM_STRUCTURED"],
    supportedOperators: ["AT_LEAST"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["AT_LEAST"] }),
      schema("count", "COUNT", { minimum: 1, maximum: 100 }),
      schema("tag", "CAMPAIGN_REFERENCE", { allowedReferenceKinds: ["TAG"] }),
    ],
    supportedValueSources: ["SYSTEM", "CAMPAIGN_REFERENCE"],
    evaluationCapability: "AUTOMATIC",
    render: (definition, context) => {
      const resolved = labelFor(definition, "tag", context);
      const count = numericValue(definition, "count");
      return resolved.label ? rendered(`This ${context.consumerNoun} may only be used while at least ${count === 1 ? "one" : count} allied ${resolved.label}${count === 1 ? " remains" : " entities remain"} active`) : { text: null, issues: resolved.issues };
    },
  },
  {
    key: "OATH_REMAINS_UNBROKEN",
    version: 1,
    subject: "OATH_OR_BEHAVIOUR",
    conditionFamily: "OATH_OR_BEHAVIOUR",
    supportedAuthoringModes: ["CAMPAIGN_CUSTOM_STRUCTURED"],
    supportedOperators: ["REMAINS_UNBROKEN"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["REMAINS_UNBROKEN"] }),
      schema("oath", "CAMPAIGN_REFERENCE", { allowedReferenceKinds: ["OATH"] }),
    ],
    supportedValueSources: ["SYSTEM", "CAMPAIGN_REFERENCE"],
    evaluationCapability: "GD_ADJUDICATION",
    render: (definition, context) => {
      const resolved = labelFor(definition, "oath", context);
      return resolved.label ? rendered(`This ${context.consumerNoun} may only be used while ${resolved.label} remains unbroken`) : { text: null, issues: resolved.issues };
    },
  },
  {
    key: "TARGET_CAMPAIGN_TAG",
    version: 1,
    subject: "THE_TARGET",
    conditionFamily: "TARGET_IDENTITY",
    supportedAuthoringModes: ["CAMPAIGN_CUSTOM_STRUCTURED"],
    supportedOperators: ["PRESENT", "ABSENT"],
    parameterSchema: [
      schema("operator", "SYSTEM_ENUM", { allowedValueKeys: ["PRESENT", "ABSENT"] }),
      schema("tag", "CAMPAIGN_REFERENCE", { allowedReferenceKinds: ["TAG"] }),
    ],
    supportedValueSources: ["SYSTEM", "CAMPAIGN_REFERENCE"],
    evaluationCapability: "AUTOMATIC",
    render: (definition, context) => {
      const resolved = labelFor(definition, "tag", context);
      return resolved.label ? rendered(`This ${context.consumerNoun} may only target a character ${enumValue(definition, "operator") === "ABSENT" ? "without" : "with"} the ${resolved.label} tag`) : { text: null, issues: resolved.issues };
    },
  },
];

export const RESTRICTION_TEMPLATE_REGISTRY: readonly RestrictionTemplateDefinition[] =
  proofRegistrySeeds.map((template) => ({ ...template, validate: sharedTemplateValidation }));

export function findRestrictionTemplate(
  key: string | null,
  version: number | null,
): RestrictionTemplateDefinition | null {
  return RESTRICTION_TEMPLATE_REGISTRY.find(
    (template) => template.key === key && template.version === version,
  ) ?? null;
}

const COMPOUND_KEYS = new Set([
  "and", "or", "conditions", "clauses", "predicates", "children",
]);
const PROHIBITED_SOURCE_KEYS = new Set([
  "ability_effect", "ability_result", "activation_cost", "backlash", "governed_ability",
]);

function inspectIllegalShape(
  value: unknown,
  path: string,
  issues: RestrictionIssue[],
  seen = new WeakSet<object>(),
): void {
  if (value !== null && typeof value === "object") {
    if (seen.has(value)) {
      issues.push(issue("CYCLIC_STRUCTURE", "error", "Restriction input must be serializable and cannot contain cycles.", path));
      return;
    }
    seen.add(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) inspectIllegalShape(value[index], `${path}[${index}]`, issues, seen);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.trim().toLowerCase();
    if (COMPOUND_KEYS.has(normalizedKey)) {
      issues.push(issue("COMPOUND_STRUCTURE", "error", "Restriction definitions cannot contain compound predicates.", `${path}.${key}`));
    }
    if (PROHIBITED_SOURCE_KEYS.has(normalizedKey) || (typeof nested === "string" && PROHIBITED_SOURCE_KEYS.has(nested.trim().toLowerCase()))) {
      issues.push(issue("PROHIBITED_ABILITY_SOURCE", "error", "A Restriction cannot reference the governed Ability's effect, result, Activation Cost, or Backlash.", `${path}.${key}`));
    }
    inspectIllegalShape(nested, `${path}.${key}`, issues, seen);
  }
}

function normalizeParameter(value: unknown, path: string, issues: RestrictionIssue[]): RestrictionParameterValue | null {
  if (!isRecord(value) || typeof value.kind !== "string") {
    issues.push(issue("INVALID_PARAMETER_KIND", "error", "A typed parameter discriminant is required.", path));
    return null;
  }
  switch (value.kind) {
    case "NUMBER":
    case "PERCENTAGE":
    case "COUNT":
      if (typeof value.value !== "number" || !Number.isFinite(value.value)) break;
      return { kind: value.kind, value: value.value };
    case "DISTANCE":
      if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.unit !== "FEET") break;
      return { kind: "DISTANCE", value: value.value, unit: "FEET" };
    case "SYSTEM_ENUM":
      if (typeof value.valueKey !== "string" || !normalizeWhitespace(value.valueKey)) break;
      return { kind: "SYSTEM_ENUM", valueKey: normalizeWhitespace(value.valueKey) };
    case "CAMPAIGN_REFERENCE":
      if (
        typeof value.campaignId === "string" && normalizeWhitespace(value.campaignId) &&
        typeof value.valueId === "string" && normalizeWhitespace(value.valueId) &&
        ["ANCHOR", "ZONE", "OATH", "TAG"].includes(String(value.valueKind))
      ) {
        return {
          kind: "CAMPAIGN_REFERENCE",
          campaignId: normalizeWhitespace(value.campaignId),
          valueKind: value.valueKind as RestrictionCampaignReference["valueKind"],
          valueId: normalizeWhitespace(value.valueId),
        };
      }
      break;
    default:
      issues.push(issue("INVALID_PARAMETER_KIND", "error", `Unsupported parameter kind ${String(value.kind)}.`, path));
      return null;
  }
  issues.push(issue("INVALID_VALUE_TYPE", "error", `Invalid value for ${String(value.kind)} parameter.`, path));
  return null;
}

export function normalizeRestrictionDefinition(input: unknown): RestrictionNormalizationResult {
  if (input == null) return { definition: null, issues: [] };
  if (Array.isArray(input)) {
    return { definition: null, issues: [issue("MULTIPLE_RESTRICTIONS_NOT_SUPPORTED", "error", "A consumer may have zero or one Restriction, never an array.", "restriction")] };
  }
  if (!isRecord(input)) {
    return { definition: null, issues: [issue("INVALID_DEFINITION", "error", "Restriction input must be an object or null.", "restriction")] };
  }

  const issues: RestrictionIssue[] = [];
  inspectIllegalShape(input, "restriction", issues);
  if (input.schemaVersion !== 1) {
    issues.push(issue("UNSUPPORTED_SCHEMA_VERSION", "error", "Restriction schemaVersion must be 1.", "schemaVersion"));
    return { definition: null, issues };
  }
  if (!RESTRICTION_AUTHORING_MODES.includes(input.authoringMode as RestrictionAuthoringMode)) {
    issues.push(issue("INVALID_AUTHORING_MODE", "error", "Restriction authoringMode is unsupported.", "authoringMode"));
    return { definition: null, issues };
  }

  const authoringMode = input.authoringMode as RestrictionAuthoringMode;
  if (authoringMode === "CUSTOM_NARRATIVE") {
    const incompatible = input.templateKey != null || input.templateVersion != null || (isRecord(input.parameters) && Object.keys(input.parameters).length > 0);
    if (incompatible) issues.push(issue("INCOMPATIBLE_MODE_FIELDS_REMOVED", "warning", "Structured fields were removed from Custom Narrative authoring."));
    return {
      definition: {
        schemaVersion: 1,
        authoringMode,
        templateKey: null,
        templateVersion: null,
        parameters: {},
        customNarrativeText: typeof input.customNarrativeText === "string" ? normalizeNarrative(input.customNarrativeText) : null,
      },
      issues,
    };
  }

  if (input.customNarrativeText != null && String(input.customNarrativeText).trim()) {
    issues.push(issue("INCOMPATIBLE_MODE_FIELDS_REMOVED", "warning", "Custom Narrative text was removed from structured authoring.", "customNarrativeText"));
  }
  const parameters: Record<string, RestrictionParameterValue> = {};
  if (input.parameters != null && !isRecord(input.parameters)) {
    issues.push(issue("INVALID_PARAMETERS", "error", "Structured parameters must be an object.", "parameters"));
  } else if (isRecord(input.parameters)) {
    for (const [key, value] of Object.entries(input.parameters)) {
      const normalizedKey = normalizeWhitespace(key);
      if (!normalizedKey) {
        issues.push(issue("EMPTY_PARAMETER_KEY", "error", "Parameter keys cannot be blank.", "parameters"));
        continue;
      }
      const normalized = normalizeParameter(value, `parameters.${normalizedKey}`, issues);
      if (normalized) parameters[normalizedKey] = normalized;
    }
  }
  const definition: AbilityRestrictionDefinitionV1 = {
    schemaVersion: 1,
    authoringMode,
    templateKey: typeof input.templateKey === "string" && normalizeWhitespace(input.templateKey) ? normalizeWhitespace(input.templateKey) : null,
    templateVersion: typeof input.templateVersion === "number" && Number.isInteger(input.templateVersion) ? input.templateVersion : null,
    parameters,
    customNarrativeText: null,
  };
  return { definition: issues.some((entry) => ["COMPOUND_STRUCTURE", "PROHIBITED_ABILITY_SOURCE", "CYCLIC_STRUCTURE"].includes(entry.code)) ? null : definition, issues };
}

function validateParameter(
  value: RestrictionParameterValue,
  parameter: RestrictionParameterSchema,
  context?: RestrictionValidationContext,
): RestrictionIssue[] {
  const path = `parameters.${parameter.key}`;
  if (value.kind !== parameter.kind) return [issue("INVALID_PARAMETER_KIND", "error", `Parameter ${parameter.key} must use kind ${parameter.kind}.`, path)];
  if (value.kind === "SYSTEM_ENUM") {
    if (parameter.allowedValueKeys && !parameter.allowedValueKeys.includes(value.valueKey)) {
      return [issue(parameter.key === "operator" ? "INVALID_OPERATOR" : "INVALID_VALUE_TYPE", "error", `${value.valueKey} is not supported for ${parameter.key}.`, path)];
    }
  }
  if (value.kind === "PERCENTAGE" || value.kind === "COUNT" || value.kind === "DISTANCE" || value.kind === "NUMBER") {
    const invalidInteger = (value.kind === "COUNT" || value.kind === "DISTANCE") && !Number.isInteger(value.value);
    if (invalidInteger || (parameter.minimum != null && value.value < parameter.minimum) || (parameter.maximum != null && value.value > parameter.maximum)) {
      const code = value.kind === "PERCENTAGE" ? "PERCENTAGE_OUT_OF_BOUNDS" : value.kind === "COUNT" ? "COUNT_OUT_OF_BOUNDS" : value.kind === "DISTANCE" ? "DISTANCE_OUT_OF_BOUNDS" : "NUMBER_OUT_OF_BOUNDS";
      return [issue(code, "error", `${parameter.key} is outside its supported bounds.`, path)];
    }
  }
  if (value.kind === "CAMPAIGN_REFERENCE") {
    const issues: RestrictionIssue[] = [];
    if (!value.campaignId || !value.valueId) issues.push(issue("MISSING_CAMPAIGN_REFERENCE", "error", "Campaign references require campaign and value identity.", path));
    if (parameter.allowedReferenceKinds && !parameter.allowedReferenceKinds.includes(value.valueKind)) issues.push(issue("INVALID_CAMPAIGN_REFERENCE_KIND", "error", `${value.valueKind} is not supported here.`, path));
    if (context?.campaignId && value.campaignId !== context.campaignId) issues.push(issue("CROSS_CAMPAIGN_REFERENCE", "error", "Campaign references must belong to the active campaign.", path));
    const resolution = context?.resolveCampaignReference?.(value);
    if (resolution?.status === "UNRESOLVED") issues.push(issue("UNRESOLVED_CAMPAIGN_REFERENCE", "error", "The campaign reference could not be resolved.", path));
    if (resolution?.status === "STALE") issues.push(issue("STALE_CAMPAIGN_REFERENCE", "error", "The campaign reference is stale.", path));
    return issues;
  }
  return [];
}

export function validateRestrictionDefinition(
  definition: AbilityRestrictionDefinitionV1 | null,
  context?: RestrictionValidationContext,
  fromTemplate = false,
): RestrictionIssue[] {
  if (definition === null) return [];
  if (definition.schemaVersion !== 1) return [issue("UNSUPPORTED_SCHEMA_VERSION", "error", "Restriction schemaVersion must be 1.", "schemaVersion")];
  if (definition.authoringMode === "CUSTOM_NARRATIVE") {
    const issues: RestrictionIssue[] = [];
    if (definition.templateKey != null || definition.templateVersion != null || Object.keys(definition.parameters).length > 0) issues.push(issue("INCOMPATIBLE_MODE_FIELDS", "error", "Custom Narrative cannot contain structured fields."));
    const text = definition.customNarrativeText?.trim() ?? "";
    if (!text) issues.push(issue("BLANK_CUSTOM_NARRATIVE", "error", "Custom Narrative requires one nonblank condition.", "customNarrativeText"));
    const heuristics = [/(?:^|\s)(?:and|or|unless)(?:\s|$)/iu, /;/u, /\b\d+(?:\.\d+)?%[^.]+\b\d+(?:\.\d+)?%/u];
    if (text && heuristics.some((pattern) => pattern.test(text))) issues.push(issue("LIKELY_COMPOUND_NARRATIVE", "warning", "Custom Narrative may contain more than one condition; GD review is required.", "customNarrativeText"));
    return issues;
  }
  if (!definition.templateKey || definition.templateVersion == null) return [issue("MISSING_TEMPLATE", "error", "Structured authoring requires a template key and version.", "templateKey")];
  const template = findRestrictionTemplate(definition.templateKey, definition.templateVersion);
  if (!template) return [issue("UNKNOWN_TEMPLATE", "error", `Unknown Restriction template ${definition.templateKey}@${definition.templateVersion}.`, "templateKey")];
  if (!template.supportedAuthoringModes.includes(definition.authoringMode)) return [issue("UNSUPPORTED_MODE", "error", `${definition.authoringMode} is not supported by ${template.key}.`, "authoringMode")];
  if (fromTemplate) {
    const issues: RestrictionIssue[] = [];
    if (context?.claimedSubject && context.claimedSubject !== template.subject) issues.push(issue("IMPOSSIBLE_SUBJECT_TEMPLATE", "error", "The claimed subject does not match the template subject.", "subject"));
    if (context?.claimedEvaluationCapability === "AUTOMATIC" && template.evaluationCapability !== "AUTOMATIC") issues.push(issue("UNSUPPORTED_AUTOMATIC_EVALUATION", "error", "This template cannot claim automatic evaluation.", "evaluationCapability"));
    for (const parameter of template.parameterSchema) {
      const value = definition.parameters[parameter.key];
      if (!value && parameter.required) issues.push(issue("MISSING_REQUIRED_PARAMETER", "error", `Missing required parameter ${parameter.key}.`, `parameters.${parameter.key}`));
      else if (value) issues.push(...validateParameter(value, parameter, context));
    }
    const known = new Set(template.parameterSchema.map((parameter) => parameter.key));
    for (const key of Object.keys(definition.parameters)) if (!known.has(key)) issues.push(issue("UNKNOWN_PARAMETER", "error", `Unknown parameter ${key}.`, `parameters.${key}`));
    const operator = enumValue(definition, "operator");
    if (operator && !template.supportedOperators.includes(operator) && !issues.some((entry) => entry.code === "INVALID_OPERATOR")) issues.push(issue("INVALID_OPERATOR", "error", `${operator} is not supported by ${template.key}.`, "parameters.operator"));
    const targetTag = definition.parameters.tag;
    if (template.conditionFamily === "TARGET_IDENTITY" && targetTag) {
      const identity = targetTag.kind === "SYSTEM_ENUM" ? targetTag.valueKey : targetTag.kind === "CAMPAIGN_REFERENCE" ? targetTag.valueId : null;
      if (identity && context?.intrinsicTargetTags?.includes(identity)) issues.push(issue("DUPLICATED_INTRINSIC_TARGET_TAG", "warning", "This Restriction duplicates an intrinsic target-tag requirement.", "parameters.tag"));
    }
    return issues;
  }
  return template.validate(definition, context);
}

export function renderRestrictionDescriptor(
  definition: AbilityRestrictionDefinitionV1 | null,
  context: RestrictionRenderContext,
): { descriptor: string | null; issues: RestrictionIssue[] } {
  if (definition === null) return { descriptor: null, issues: [] };
  const validation = validateRestrictionDefinition(definition);
  if (validation.some((entry) => entry.severity === "error")) return { descriptor: null, issues: validation };
  if (definition.authoringMode === "CUSTOM_NARRATIVE") {
    return { descriptor: `Restriction: ${withTerminalPeriod(normalizeNarrative(definition.customNarrativeText ?? ""))}`, issues: validation };
  }
  const template = findRestrictionTemplate(definition.templateKey, definition.templateVersion);
  if (!template) return { descriptor: null, issues: validation };
  const result = template.render(definition, context);
  return { descriptor: result.text, issues: [...validation, ...result.issues] };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalValue(value[key]);
  return result;
}

export function canonicalizeRestrictionDefinition(
  definition: AbilityRestrictionDefinitionV1 | null,
): string {
  if (definition === null) return "null";
  const semantic: AbilityRestrictionDefinitionV1 = {
    schemaVersion: 1,
    authoringMode: definition.authoringMode,
    templateKey: definition.templateKey ?? null,
    templateVersion: definition.templateVersion ?? null,
    parameters: definition.parameters ?? {},
    customNarrativeText: definition.customNarrativeText == null ? null : normalizeNarrative(definition.customNarrativeText),
  };
  return JSON.stringify(canonicalValue(semantic));
}

export function createRestrictionFingerprint(
  definition: AbilityRestrictionDefinitionV1 | null,
): string {
  return `restriction:v1:${canonicalizeRestrictionDefinition(definition)}`;
}

export function auditRestrictionTemplateRegistry(
  registry: readonly RestrictionTemplateDefinition[] = RESTRICTION_TEMPLATE_REGISTRY,
): RestrictionIssue[] {
  const issues: RestrictionIssue[] = [];
  const identities = new Set<string>();
  for (const [index, template] of registry.entries()) {
    const path = `registry[${index}]`;
    const identity = `${template.key}@${template.version}`;
    if (identities.has(identity)) issues.push(issue("DUPLICATE_TEMPLATE_IDENTITY", "error", `Duplicate template ${identity}.`, path));
    identities.add(identity);
    if (!RESTRICTION_SUBJECTS.includes(template.subject)) issues.push(issue("UNSUPPORTED_SUBJECT", "error", "Template subject is unsupported.", `${path}.subject`));
    if (!RESTRICTION_CONDITION_FAMILIES.includes(template.conditionFamily)) issues.push(issue("UNSUPPORTED_FAMILY", "error", "Template condition family is unsupported.", `${path}.conditionFamily`));
    if (!RESTRICTION_EVALUATION_CAPABILITIES.includes(template.evaluationCapability)) issues.push(issue("MISSING_EVALUATION_CAPABILITY", "error", "Template evaluation capability is missing or unsupported.", `${path}.evaluationCapability`));
    if (typeof template.render !== "function") issues.push(issue("MISSING_RENDERER", "error", "Template renderer is required.", `${path}.render`));
    if (typeof template.validate !== "function") issues.push(issue("MISSING_VALIDATOR", "error", "Template validator is required.", `${path}.validate`));
    if (template.supportedOperators.length === 0 || template.supportedOperators.some((operator) => !operator.trim())) issues.push(issue("EMPTY_OPERATOR", "error", "Templates require nonblank operators.", `${path}.supportedOperators`));
    if (new Set(template.supportedOperators).size !== template.supportedOperators.length) issues.push(issue("DUPLICATE_OPERATOR", "error", "Template operators must be unique.", `${path}.supportedOperators`));
    const parameterKeys = template.parameterSchema.map((parameter) => parameter.key);
    if (new Set(parameterKeys).size !== parameterKeys.length) issues.push(issue("DUPLICATE_PARAMETER_KEY", "error", "Template parameter keys must be unique.", `${path}.parameterSchema`));
    if (template.supportedAuthoringModes.some((mode) => !RESTRICTION_AUTHORING_MODES.includes(mode) || String(mode) === "CUSTOM_NARRATIVE")) issues.push(issue("ILLEGAL_TEMPLATE_MODE", "error", "Structured templates cannot support this mode.", `${path}.supportedAuthoringModes`));
    const requiresCampaignReference = template.parameterSchema.some((parameter) => parameter.kind === "CAMPAIGN_REFERENCE");
    if (requiresCampaignReference !== template.supportedValueSources.includes("CAMPAIGN_REFERENCE")) issues.push(issue("IMPOSSIBLE_MODE_VALUE_SOURCE", "error", "Template campaign-reference schema and value sources disagree.", `${path}.supportedValueSources`));
  }
  return issues;
}
