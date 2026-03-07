import type { ComponentSpec, ComponentSpecParameter } from "../component-spec-store";
import type {
  EngineeringValue,
  ProjectDocument,
  ValueProvider,
  VariableCatalogState,
  VariableValueType,
} from "./engineering-domain";
import {
  normalizeEngineeringIdSegment,
  toComponentParameterStableKey,
  toComponentParameterStableToken,
} from "./engineering-parameter-identity";

const SPEC_VARIABLE_PREFIX = "var:spec:";
const SPEC_PROVIDER_PREFIX = "provider:spec:";

type AnchorParameterTemplate = {
  token: string;
  key: string;
  name: string | null;
  nameCn: string | null;
  valueType: string | null;
  unit: string | null;
  required: boolean | undefined;
  enumOptions: string[] | undefined;
  physicalEntityType: string | null;
  tips: string | null;
  tpisKey: string | null;
  tpisOperationMode: string[] | undefined;
  tpisExtraInfo: string | null;
};

type AnchorTemplate = {
  index: number;
  key: string;
  name: string | null;
  nameCn: string | null;
  materialType: string | null;
  parameters: AnchorParameterTemplate[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const getFirstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    if (isNonEmptyString(value)) {
      return value.trim();
    }
  }
  return null;
};

const toBooleanOrUndefined = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return undefined;
};

const toStringArrayOrUndefined = (value: unknown) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
};

const normalizeMatchKey = (value: string) => value.trim().toLowerCase();

const toEngineeringValue = (value: unknown): EngineeringValue | undefined => {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
};

const toVariableValueType = (valueType: string | null | undefined): VariableValueType => {
  const normalized = (valueType || "").toLowerCase();

  if (
    normalized === "float" ||
    normalized === "double" ||
    normalized === "int" ||
    normalized === "integer" ||
    normalized === "number"
  ) {
    return "float";
  }
  if (normalized === "bool" || normalized === "boolean") {
    return "bool";
  }
  if (normalized === "enum") {
    return "enum";
  }
  if (normalized === "curve") {
    return "curve";
  }

  return "string";
};

const toComponentParameterKey = (
  parameter: ComponentSpecParameter,
  index: number,
) => toComponentParameterStableKey(parameter, index);

const toComponentParameterToken = (
  parameter: ComponentSpecParameter,
  index: number,
) => toComponentParameterStableToken(parameter, index);

const toVariableName = (
  name: string | null | undefined,
  nameCn: string | null | undefined,
  fallbackKey: string,
) => name || nameCn || fallbackKey;

const toEnumOptions = (enumOptions: unknown[] | null) => {
  if (!Array.isArray(enumOptions)) {
    return undefined;
  }

  const normalized = enumOptions
    .filter((option): option is string => typeof option === "string")
    .map((option) => option.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
};

const createScopedVariableIdAllocator = () => {
  const seenCountByBaseId = new Map<string, number>();

  return (baseId: string) => {
    const nextCount = (seenCountByBaseId.get(baseId) || 0) + 1;
    seenCountByBaseId.set(baseId, nextCount);

    return nextCount === 1 ? baseId : `${baseId}:dup${nextCount}`;
  };
};

const toVariableBaseId = (segments: string[]) =>
  `${SPEC_VARIABLE_PREFIX}${segments.map(normalizeEngineeringIdSegment).join(":")}`;

const toProviderId = (
  variableId: string,
  kind: ValueProvider["kind"],
) => `${SPEC_PROVIDER_PREFIX}${variableId}:${kind}`;

const toAnchorParameterTemplate = (
  raw: unknown,
  index: number,
): AnchorParameterTemplate | null => {
  if (!isRecord(raw)) {
    return null;
  }

  const token = normalizeEngineeringIdSegment(
    getFirstNonEmptyString(raw.uuid, raw.tpis_key, raw.name, raw.name_cn, `${index}`) ||
      `${index}`,
  );
  const key = normalizeEngineeringIdSegment(
    getFirstNonEmptyString(raw.tpis_key, raw.name, raw.name_cn, token) || token,
  );

  return {
    token,
    key,
    name: getFirstNonEmptyString(raw.name),
    nameCn: getFirstNonEmptyString(raw.name_cn),
    valueType: getFirstNonEmptyString(raw.value_type),
    unit: getFirstNonEmptyString(raw.unit),
    required: toBooleanOrUndefined(raw.require),
    enumOptions: toStringArrayOrUndefined(raw.enum_options),
    physicalEntityType: getFirstNonEmptyString(raw.physical_entity_type),
    tips: getFirstNonEmptyString(raw.tips),
    tpisKey: getFirstNonEmptyString(raw.tpis_key),
    tpisOperationMode: toStringArrayOrUndefined(raw.tpis_operation_mode),
    tpisExtraInfo: getFirstNonEmptyString(raw.tpis_extra_info),
  };
};

const getAnchorTemplatesFromSpec = (spec: ComponentSpec): AnchorTemplate[] => {
  if (!isRecord(spec.data) || !Array.isArray(spec.data.anchors)) {
    return [];
  }

  return spec.data.anchors.flatMap((anchor, index) => {
    if (!isRecord(anchor)) {
      return [];
    }

    const anchorData = isRecord(anchor.data) ? anchor.data : {};
    const key = getFirstNonEmptyString(
      anchorData.interface_type,
      anchorData.name,
      anchorData.name_cn,
      anchor.id,
      anchor.uuid,
      `${index}`,
    );

    if (!key) {
      return [];
    }

    const parametersRaw = Array.isArray(anchor.parameters) ? anchor.parameters : [];
    const parameters = parametersRaw
      .map((parameter, parameterIndex) =>
        toAnchorParameterTemplate(parameter, parameterIndex),
      )
      .filter((parameter): parameter is AnchorParameterTemplate => !!parameter);

    return [
      {
        index,
        key,
        name: getFirstNonEmptyString(anchorData.name),
        nameCn: getFirstNonEmptyString(anchorData.name_cn),
        materialType: getFirstNonEmptyString(anchorData.material_type),
        parameters,
      },
    ];
  });
};

const filterOutSpecManagedCatalogEntries = (
  existingCatalog: VariableCatalogState,
): VariableCatalogState => {
  const variablesById = Object.fromEntries(
    Object.entries(existingCatalog.variablesById).filter(
      ([variableId]) => !variableId.startsWith(SPEC_VARIABLE_PREFIX),
    ),
  );
  const providersById = Object.fromEntries(
    Object.entries(existingCatalog.providersById).filter(
      ([providerId]) => !providerId.startsWith(SPEC_PROVIDER_PREFIX),
    ),
  );
  const providerIdsByVariableId = Object.fromEntries(
    Object.entries(existingCatalog.providerIdsByVariableId)
      .filter(([variableId]) => variableId in variablesById)
      .map(([variableId, providerIds]) => [
        variableId,
        providerIds.filter((providerId) => providerId in providersById),
      ]),
  );

  return {
    variablesById,
    providersById,
    providerIdsByVariableId,
  };
};

export const isSpecManagedVariableId = (variableId: string) =>
  variableId.startsWith(SPEC_VARIABLE_PREFIX);

export const buildVariableCatalogFromLoadedComponentSpecs = (
  project: ProjectDocument,
  specsByType: Record<string, ComponentSpec>,
): VariableCatalogState => {
  const baseCatalog = filterOutSpecManagedCatalogEntries(project.variableCatalog);
  const nextVariablesById = {
    ...baseCatalog.variablesById,
  };
  const nextProvidersById = {
    ...baseCatalog.providersById,
  };
  const nextProviderIdsByVariableId = {
    ...baseCatalog.providerIdsByVariableId,
  };

  const registerInputParameter = (
    componentId: string,
    componentTemplateKey: string,
    parameter: ComponentSpecParameter,
    index: number,
    allocateVariableId: (baseId: string) => string,
  ) => {
    const variableToken = toComponentParameterToken(parameter, index);
    const variableId = allocateVariableId(
      toVariableBaseId([componentId, "input", variableToken]),
    );
    const variableKey = toComponentParameterKey(parameter, index);
    const variableName = toVariableName(parameter.name, parameter.nameCn, variableKey);
    const manualProviderId = toProviderId(variableId, "manual");
    const sensorProviderId = toProviderId(variableId, "sensor");

    nextVariablesById[variableId] = {
      id: variableId,
      owner: {
        kind: "component",
        id: componentId,
      },
      key: variableKey,
      name: variableName,
      nameCn: parameter.nameCn || undefined,
      valueType: toVariableValueType(parameter.valueType),
      role: "input",
      stage: "raw",
      canonicalUnit: parameter.unit || undefined,
      displayUnit: parameter.unit || undefined,
      required: parameter.required ?? undefined,
      enumOptions: toEnumOptions(parameter.enumOptions),
      tags: {
        section: "input",
        componentTemplateKey,
        specParameterToken: variableToken,
        physicalEntityType: parameter.physicalEntityType || "component",
      },
      tips: parameter.tips || undefined,
      backend: {
        tpisKey: parameter.tpisKey || parameter.key || undefined,
        extraInfo:
          typeof parameter.tpisExtraInfo === "string"
            ? parameter.tpisExtraInfo
            : undefined,
        operationModes: parameter.tpisOperationMode || undefined,
      },
    };

    nextProvidersById[manualProviderId] = {
      id: manualProviderId,
      variableId,
      kind: "manual",
      defaultValue: toEngineeringValue(parameter.defaultValue),
    };
    nextProvidersById[sensorProviderId] = {
      id: sensorProviderId,
      variableId,
      kind: "sensor",
      measurement: parameter.tpisKey || variableKey,
      pointName: `${componentId}.${variableKey}`,
      field: "value",
    };
    nextProviderIdsByVariableId[variableId] = [
      manualProviderId,
      sensorProviderId,
    ];
  };

  const registerOutputParameter = (
    componentId: string,
    componentTemplateKey: string,
    parameter: ComponentSpecParameter,
    index: number,
    allocateVariableId: (baseId: string) => string,
  ) => {
    const variableToken = toComponentParameterToken(parameter, index);
    const variableId = allocateVariableId(
      toVariableBaseId([componentId, "output", variableToken]),
    );
    const variableKey = toComponentParameterKey(parameter, index);
    const variableName = toVariableName(parameter.name, parameter.nameCn, variableKey);
    const backendProviderId = toProviderId(variableId, "backend");

    nextVariablesById[variableId] = {
      id: variableId,
      owner: {
        kind: "component",
        id: componentId,
      },
      key: variableKey,
      name: variableName,
      nameCn: parameter.nameCn || undefined,
      valueType: toVariableValueType(parameter.valueType),
      role: "result",
      stage: "backend",
      canonicalUnit: parameter.unit || undefined,
      displayUnit: parameter.unit || undefined,
      enumOptions: toEnumOptions(parameter.enumOptions),
      tags: {
        section: "output",
        componentTemplateKey,
        specParameterToken: variableToken,
        physicalEntityType: parameter.physicalEntityType || "component",
      },
      tips: parameter.tips || undefined,
      backend: {
        tpisKey: parameter.tpisKey || parameter.key || undefined,
        extraInfo:
          typeof parameter.tpisExtraInfo === "string"
            ? parameter.tpisExtraInfo
            : undefined,
        operationModes: parameter.tpisOperationMode || undefined,
      },
    };

    nextProvidersById[backendProviderId] = {
      id: backendProviderId,
      variableId,
      kind: "backend",
    };
    nextProviderIdsByVariableId[variableId] = [backendProviderId];
  };

  const registerAnchorOutputParameter = (
    componentId: string,
    componentTemplateKey: string,
    anchorId: string,
    anchorKey: string,
    materialType: string | undefined,
    parameter: AnchorParameterTemplate,
    allocateVariableId: (baseId: string) => string,
  ) => {
    const variableId = allocateVariableId(
      toVariableBaseId([componentId, "anchor", anchorId, parameter.token]),
    );
    const variableKey = parameter.key;
    const variableName = toVariableName(parameter.name, parameter.nameCn, variableKey);
    const backendProviderId = toProviderId(variableId, "backend");

    nextVariablesById[variableId] = {
      id: variableId,
      owner: {
        kind: "anchor",
        id: anchorId,
      },
      key: variableKey,
      name: variableName,
      nameCn: parameter.nameCn || undefined,
      valueType: toVariableValueType(parameter.valueType),
      role: "result",
      stage: "backend",
      canonicalUnit: parameter.unit || undefined,
      displayUnit: parameter.unit || undefined,
      required: parameter.required,
      enumOptions: parameter.enumOptions,
      tags: {
        section: "anchor_output",
        componentTemplateKey,
        anchorKey,
        ...(materialType
          ? {
              materialType,
            }
          : {}),
        physicalEntityType: parameter.physicalEntityType || "anchor",
      },
      tips: parameter.tips || undefined,
      backend: {
        tpisKey: parameter.tpisKey || parameter.key,
        extraInfo: parameter.tpisExtraInfo || undefined,
        operationModes: parameter.tpisOperationMode,
      },
    };

    nextProvidersById[backendProviderId] = {
      id: backendProviderId,
      variableId,
      kind: "backend",
    };
    nextProviderIdsByVariableId[variableId] = [backendProviderId];
  };

  Object.values(project.topology.componentsById)
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((component) => {
      if (!component.templateKey) {
        return;
      }

      const spec = specsByType[component.templateKey];

      if (!spec) {
        return;
      }

      const allocateVariableId = createScopedVariableIdAllocator();

      spec.inputParameters.forEach((parameter, index) =>
        registerInputParameter(
          component.id,
          spec.componentType,
          parameter,
          index,
          allocateVariableId,
        ),
      );

      spec.outputParameters.forEach((parameter, index) =>
        registerOutputParameter(
          component.id,
          spec.componentType,
          parameter,
          index,
          allocateVariableId,
        ),
      );

      const componentAnchorIds = component.anchorIds.filter(
        (anchorId) => !!project.topology.anchorsById[anchorId],
      );

      if (componentAnchorIds.length === 0) {
        return;
      }

      const availableAnchorIdsByKey = new Map<string, string[]>();
      componentAnchorIds.forEach((anchorId) => {
        const anchorEntity = project.topology.anchorsById[anchorId];
        const anchorMatchKey = getFirstNonEmptyString(anchorEntity.key, anchorEntity.name);

        if (!anchorMatchKey) {
          return;
        }

        const normalizedKey = normalizeMatchKey(anchorMatchKey);
        const current = availableAnchorIdsByKey.get(normalizedKey) || [];
        current.push(anchorId);
        availableAnchorIdsByKey.set(normalizedKey, current);
      });

      const usedAnchorIds = new Set<string>();
      const anchorTemplates = getAnchorTemplatesFromSpec(spec);

      anchorTemplates.forEach((anchorTemplate) => {
        const queue = availableAnchorIdsByKey.get(
          normalizeMatchKey(anchorTemplate.key),
        );
        let resolvedAnchorId =
          queue?.find((anchorId) => !usedAnchorIds.has(anchorId)) || null;

        if (!resolvedAnchorId) {
          const fallbackByIndex = componentAnchorIds[anchorTemplate.index];
          if (fallbackByIndex && !usedAnchorIds.has(fallbackByIndex)) {
            resolvedAnchorId = fallbackByIndex;
          }
        }

        if (!resolvedAnchorId) {
          resolvedAnchorId =
            componentAnchorIds.find((anchorId) => !usedAnchorIds.has(anchorId)) ||
            null;
        }

        if (!resolvedAnchorId) {
          return;
        }

        usedAnchorIds.add(resolvedAnchorId);

        const anchorEntity = project.topology.anchorsById[resolvedAnchorId];
        const anchorKey =
          getFirstNonEmptyString(anchorEntity.key, anchorTemplate.key) ||
          resolvedAnchorId;
        const materialType =
          getFirstNonEmptyString(anchorEntity.medium, anchorTemplate.materialType) ||
          undefined;

        anchorTemplate.parameters.forEach((parameter) =>
          registerAnchorOutputParameter(
            component.id,
            spec.componentType,
            resolvedAnchorId!,
            anchorKey,
            materialType,
            parameter,
            allocateVariableId,
          ),
        );
      });
    });

  return {
    variablesById: nextVariablesById,
    providersById: nextProvidersById,
    providerIdsByVariableId: nextProviderIdsByVariableId,
  };
};
