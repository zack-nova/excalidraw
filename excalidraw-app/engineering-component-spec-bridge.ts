import type { ComponentSpec, ComponentSpecParameter } from "./component-spec-store";
import type {
  EngineeringValue,
  ProjectDocument,
  ValueProvider,
  VariableCatalogState,
  VariableValueType,
} from "./engineering-domain";

const SPEC_VARIABLE_PREFIX = "var:spec:";
const SPEC_PROVIDER_PREFIX = "provider:spec:";

const normalizeIdSegment = (value: string) =>
  value
    .trim()
    .replace(/[^A-Za-z0-9:_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "param";

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

const toVariableValueType = (
  valueType: ComponentSpecParameter["valueType"],
): VariableValueType => {
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

const toVariableKey = (parameter: ComponentSpecParameter, index: number) =>
  normalizeIdSegment(
    parameter.key || parameter.tpisKey || parameter.name || parameter.id || `${index}`,
  );

const toVariableName = (parameter: ComponentSpecParameter, fallbackKey: string) =>
  parameter.name || parameter.nameCn || fallbackKey;

const toVariableId = (
  componentId: string,
  section: "input" | "output",
  parameter: ComponentSpecParameter,
  index: number,
) => {
  const segment = normalizeIdSegment(
    parameter.id || parameter.key || parameter.tpisKey || `${index}`,
  );

  return `${SPEC_VARIABLE_PREFIX}${componentId}:${section}:${segment}:${index}`;
};

const toProviderId = (
  variableId: string,
  kind: ValueProvider["kind"],
) => `${SPEC_PROVIDER_PREFIX}${variableId}:${kind}`;

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
    componentName: string | undefined,
    componentTemplateKey: string,
    parameter: ComponentSpecParameter,
    index: number,
  ) => {
    const variableId = toVariableId(componentId, "input", parameter, index);
    const variableKey = toVariableKey(parameter, index);
    const variableName = toVariableName(parameter, variableKey);
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
      enumOptions: Array.isArray(parameter.enumOptions)
        ? parameter.enumOptions
            .filter((option): option is string => typeof option === "string")
            .map((option) => option.trim())
            .filter(Boolean)
        : undefined,
      tags: {
        section: "input",
        componentTemplateKey,
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
      pointName: `${componentName || componentId}.${variableKey}`,
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
  ) => {
    const variableId = toVariableId(componentId, "output", parameter, index);
    const variableKey = toVariableKey(parameter, index);
    const variableName = toVariableName(parameter, variableKey);
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
      enumOptions: Array.isArray(parameter.enumOptions)
        ? parameter.enumOptions
            .filter((option): option is string => typeof option === "string")
            .map((option) => option.trim())
            .filter(Boolean)
        : undefined,
      tags: {
        section: "output",
        componentTemplateKey,
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

      spec.inputParameters.forEach((parameter, index) =>
        registerInputParameter(
          component.id,
          component.name,
          spec.componentType,
          parameter,
          index,
        ),
      );
      spec.outputParameters.forEach((parameter, index) =>
        registerOutputParameter(
          component.id,
          spec.componentType,
          parameter,
          index,
        ),
      );
    });

  return {
    variablesById: nextVariablesById,
    providersById: nextProvidersById,
    providerIdsByVariableId: nextProviderIdsByVariableId,
  };
};
