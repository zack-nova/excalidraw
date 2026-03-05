import { getSelectedElements } from "@excalidraw/element";
import {
  useExcalidrawAppState,
  useExcalidrawElements,
} from "@excalidraw/excalidraw/components/App";
import { useEffect, useState } from "react";

import { useAtomValue, useSetAtom } from "../app-jotai";
import {
  componentCurveCatalogAtom,
  componentSpecCatalogAtom,
  ensureComponentCurveDataLoadedAtom,
  ensureInterfaceSpecLoadedAtom,
  ensureComponentSpecLoadedAtom,
  getInterfaceMaterialTypeKey,
  interfaceSpecCatalogAtom,
  type ComponentSpecParameter,
} from "../component-spec-store";
import {
  createValueSnapshot,
  type EngineeringValue,
  type ProjectDocument,
  type ScenarioDocument,
} from "../engineering-domain";
import { syncEngineeringComponentSpecBridgeAtom } from "../engineering-component-spec-bridge-state";
import {
  applyEngineeringScenarioMutationAtom,
  engineeringProjectDocumentAtom,
  engineeringScenarioDocumentAtom,
  upsertEngineeringPointBindingAtom,
} from "../engineering-domain-state";
import {
  toComponentParameterLookupKey,
  toComponentParameterStableToken,
} from "../engineering-parameter-identity";
import "./EngineeringComponentParameterPanel.scss";

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

type SelectedComponentAnchor = {
  id: string;
  name: string;
  materialType: string | null;
};

type SelectedComponentContext = {
  elementId: string;
  componentType: string;
  anchors: SelectedComponentAnchor[];
};

type IndexedParameter = {
  parameter: ComponentSpecParameter;
  index: number;
};

type ParameterGroup = {
  name: string;
  items: IndexedParameter[];
};

const getAnchorFromRecord = (
  anchorValue: unknown,
  index: number,
): SelectedComponentAnchor | null => {
  if (!isRecord(anchorValue)) {
    return null;
  }

  const anchorData = isRecord(anchorValue.data) ? anchorValue.data : {};
  const anchorId =
    getFirstNonEmptyString(anchorValue.id, anchorValue.uuid) ||
    `anchor:${index + 1}`;
  const anchorName =
    getFirstNonEmptyString(
      anchorData.name_cn,
      anchorData.name,
      anchorValue.name_cn,
      anchorValue.name,
      anchorId,
    ) || `Anchor ${index + 1}`;
  const materialType = getFirstNonEmptyString(anchorData.material_type);

  return {
    id: anchorId,
    name: anchorName,
    materialType,
  };
};

const getSelectedComponentContext = (
  elements: readonly ReturnType<typeof useExcalidrawElements>[number][],
  appState: ReturnType<typeof useExcalidrawAppState>,
): SelectedComponentContext | null => {
  const selectedElements = getSelectedElements(elements, appState, {
    includeBoundTextElement: false,
    includeElementsInFrames: false,
  });

  if (selectedElements.length !== 1) {
    return null;
  }

  const component = selectedElements[0].customData?.component;

  if (!isRecord(component)) {
    return null;
  }

  const data = component.data;

  if (!isRecord(data)) {
    return null;
  }

  const componentType = getFirstNonEmptyString(data.component_type);

  if (!componentType) {
    return null;
  }

  const anchors = Array.isArray(data.anchors)
    ? data.anchors
        .map((anchor, index) => getAnchorFromRecord(anchor, index))
        .filter((anchor): anchor is SelectedComponentAnchor => !!anchor)
    : [];

  return {
    elementId: selectedElements[0].id,
    componentType,
    anchors,
  };
};

const DEFAULT_PARAMETER_GROUP_NAME = "未分组";

const getParameterGroupName = (parameter: ComponentSpecParameter) =>
  getFirstNonEmptyString(parameter.group) || DEFAULT_PARAMETER_GROUP_NAME;

const groupParametersByGroup = (
  parameters: ComponentSpecParameter[],
): ParameterGroup[] => {
  const groupedParameters: ParameterGroup[] = [];
  const groupIndexesByName = new Map<string, number>();

  parameters.forEach((parameter, index) => {
    const groupName = getParameterGroupName(parameter);
    const currentGroupIndex = groupIndexesByName.get(groupName);

    if (currentGroupIndex === undefined) {
      groupedParameters.push({
        name: groupName,
        items: [{ parameter, index }],
      });
      groupIndexesByName.set(groupName, groupedParameters.length - 1);
      return;
    }

    groupedParameters[currentGroupIndex].items.push({ parameter, index });
  });

  return groupedParameters;
};

const getParameterIdentity = (
  parameter: ComponentSpecParameter,
  index: number,
) => parameter.id || parameter.uuid || parameter.key || `parameter:${index}`;

const getParameterDescription = (_parameter: ComponentSpecParameter) => [];

const normalizeParameterDisplayName = (value: string) =>
  value
    .split("•")[0]
    .split("·")[0]
    .trim();

const getParameterTitle = (parameter: ComponentSpecParameter) => {
  const nameCn = getFirstNonEmptyString(parameter.nameCn);
  if (nameCn) {
    return normalizeParameterDisplayName(nameCn);
  }

  const name = getFirstNonEmptyString(parameter.name, parameter.key);
  if (name) {
    return normalizeParameterDisplayName(name);
  }

  return "Unnamed parameter";
};

const getEnumOptions = (parameter: ComponentSpecParameter) =>
  (Array.isArray(parameter.enumOptions) ? parameter.enumOptions : []).filter(
    (option): option is string => typeof option === "string" && option.length > 0,
  );

const getInputType = (parameter: ComponentSpecParameter) => {
  const normalized = (parameter.valueType || "").toLowerCase();
  const enumOptions = getEnumOptions(parameter);

  if (
    normalized === "float" ||
    normalized === "double" ||
    normalized === "number" ||
    normalized === "int" ||
    normalized === "integer"
  ) {
    return "number" as const;
  }
  if (normalized === "bool" || normalized === "boolean") {
    return "boolean" as const;
  }
  if (normalized === "curve" || parameter.hasCurveData) {
    return "curve" as const;
  }
  if (normalized === "enum") {
    return enumOptions.length > 0 ? "enum" : "text";
  }
  if (enumOptions.length > 0) {
    return "enum" as const;
  }
  return "text" as const;
};

const toStringValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

type InputType = ReturnType<typeof getInputType>;

type ResolvedInputParameterBinding = {
  variableId: string;
  providerId: string | undefined;
  snapshotValue: EngineeringValue | undefined;
};

const normalizeLookupKey = (value: string) => value.trim().toLowerCase();

const getComponentEntityIdForElement = (
  project: ProjectDocument,
  elementId: string | null,
) => {
  if (!elementId) {
    return null;
  }

  for (const component of Object.values(project.topology.componentsById)) {
    const directElementId =
      typeof component.props.elementId === "string"
        ? component.props.elementId
        : null;
    const elementIds = Array.isArray(component.props.elementIds)
      ? component.props.elementIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];

    if (
      directElementId === elementId ||
      elementIds.includes(elementId)
    ) {
      return component.id;
    }
  }

  return null;
};

const resolveManualProviderId = (
  project: ProjectDocument,
  variableId: string,
): string | undefined => {
  const explicitProviderIds =
    project.variableCatalog.providerIdsByVariableId[variableId] ?? [];
  const fallbackProviderIds = Object.values(project.variableCatalog.providersById)
    .filter((provider) => provider.variableId === variableId)
    .map((provider) => provider.id);
  const providerIds =
    explicitProviderIds.length > 0 ? explicitProviderIds : fallbackProviderIds;

  return providerIds.find((providerId) => {
    const provider = project.variableCatalog.providersById[providerId];
    return provider?.kind === "manual";
  });
};

const resolveInputParameterBinding = ({
  project,
  scenario,
  componentEntityId,
  parameter,
  index,
}: {
  project: ProjectDocument;
  scenario: ScenarioDocument;
  componentEntityId: string | null;
  parameter: ComponentSpecParameter;
  index: number;
}): ResolvedInputParameterBinding | null => {
  if (!componentEntityId) {
    return null;
  }

  const stableToken = toComponentParameterStableToken(parameter, index);
  const lookupKeyRaw = toComponentParameterLookupKey(parameter);
  const lookupKey = lookupKeyRaw ? normalizeLookupKey(lookupKeyRaw) : null;

  const componentInputVariables = Object.values(project.variableCatalog.variablesById)
    .filter(
      (variable) =>
        variable.owner.kind === "component" &&
        variable.owner.id === componentEntityId &&
        variable.role === "input",
    );

  const byTagToken =
    componentInputVariables.find(
      (variable) => variable.tags?.specParameterToken === stableToken,
    ) || null;
  const byTpisKey =
    !byTagToken && lookupKey
      ? componentInputVariables.find(
          (variable) => normalizeLookupKey(variable.backend?.tpisKey || "") === lookupKey,
        ) || null
      : null;
  const byVariableKey =
    !byTagToken && !byTpisKey && lookupKey
      ? componentInputVariables.find(
          (variable) => normalizeLookupKey(variable.key) === lookupKey,
        ) || null
      : null;
  const resolvedVariable = byTagToken || byTpisKey || byVariableKey;

  if (!resolvedVariable) {
    return null;
  }

  const providerId =
    resolveManualProviderId(project, resolvedVariable.id) ||
    scenario.manualInputs[resolvedVariable.id]?.providerId;
  const snapshot = scenario.manualInputs[resolvedVariable.id];

  return {
    variableId: resolvedVariable.id,
    providerId,
    snapshotValue: snapshot?.value,
  };
};

const toManualInputValue = (
  inputType: InputType,
  rawValue: string | boolean,
): EngineeringValue | undefined => {
  if (inputType === "boolean") {
    return Boolean(rawValue);
  }

  if (inputType === "number") {
    if (typeof rawValue !== "string") {
      return undefined;
    }
    const normalized = rawValue.trim();

    if (!normalized) {
      return undefined;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (typeof rawValue === "string") {
    return rawValue;
  }

  return undefined;
};

const toInputFieldValue = (
  inputType: InputType,
  value: EngineeringValue | undefined,
) => {
  if (inputType === "boolean") {
    return typeof value === "boolean" ? value : Boolean(value);
  }

  if (typeof value === "undefined") {
    return "";
  }

  return toStringValue(value);
};

const SensorBindingIcon = () => (
  <svg
    aria-hidden="true"
    className="engineering-parameter-panel__buttonIcon"
    viewBox="0 0 16 16"
  >
    <path d="M4.6 5.1a2.3 2.3 0 0 1 3.3 0l.9.9-.9.9-.9-.9a1 1 0 0 0-1.4 1.4l.9.9-.9.9-.9-.9a2.3 2.3 0 0 1 0-3.2Z" />
    <path d="M11.4 10.9a2.3 2.3 0 0 1-3.3 0l-.9-.9.9-.9.9.9a1 1 0 1 0 1.4-1.4l-.9-.9.9-.9.9.9a2.3 2.3 0 0 1 0 3.2Z" />
    <path d="m6.6 9.4 2.8-2.8.9.9-2.8 2.8-.9-.9Z" />
  </svg>
);

const InputParameterRows = ({
  componentEntityId,
  componentType,
  parameters,
  onOpenBindingPanel,
  onOpenCurvePanel,
  resolveStoredBinding,
  onPersistValue,
}: {
  componentEntityId: string | null;
  componentType: string;
  parameters: ComponentSpecParameter[];
  onOpenBindingPanel: (parameter: ComponentSpecParameter, index: number) => void;
  onOpenCurvePanel: (parameter: ComponentSpecParameter, index: number) => void;
  resolveStoredBinding: (
    parameter: ComponentSpecParameter,
    index: number,
  ) => ResolvedInputParameterBinding | null;
  onPersistValue: (
    parameter: ComponentSpecParameter,
    index: number,
    inputValue: EngineeringValue | undefined,
    inputType: InputType,
  ) => void;
}) => {
  const [draftValuesByParameterId, setDraftValuesByParameterId] = useState<
    Record<string, string | boolean>
  >({});

  if (parameters.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">
        No input parameters defined.
      </div>
    );
  }

  const groups = groupParametersByGroup(parameters);

  return (
    <div className="engineering-parameter-panel__table engineering-parameter-panel__table--input">
      <div className="engineering-parameter-panel__tableHeader">
        <div>属性名</div>
        <div>值</div>
        <div>单位</div>
        <div>测点</div>
      </div>
      {groups.map((group) => (
        <div className="engineering-parameter-panel__group" key={group.name}>
          <div className="engineering-parameter-panel__groupRow">{group.name}</div>
          {group.items.map(({ parameter, index }) => {
            const parameterId = getParameterIdentity(parameter, index);
            const parameterDraftKey = `${
              componentEntityId || componentType
            }:${parameterId}`;
            const parameterTitle = getParameterTitle(parameter);
            const description = getParameterDescription(parameter);
            const inputType = getInputType(parameter);
            const draftValue = draftValuesByParameterId[parameterDraftKey];
            const persistedBinding = resolveStoredBinding(parameter, index);
            const persistedValue =
              typeof persistedBinding?.snapshotValue !== "undefined"
                ? persistedBinding.snapshotValue
                : (parameter.defaultValue as EngineeringValue | undefined);

            const persistInputValue = (nextRawValue: string | boolean) => {
              const nextValue = toManualInputValue(inputType, nextRawValue);
              onPersistValue(parameter, index, nextValue, inputType);
            };

            return (
              <div className="engineering-parameter-panel__tableRow" key={parameterId}>
                <div className="engineering-parameter-panel__nameCell">
                  <div className="engineering-parameter-panel__name">
                    {parameterTitle}
                  </div>
                  {description.length > 0 ? (
                    <div className="engineering-parameter-panel__meta">
                      {description.join(" · ")}
                    </div>
                  ) : null}
                </div>
                <div className="engineering-parameter-panel__valueCell">
                  {inputType === "enum" ? (
                    <select
                      className="engineering-parameter-panel__field"
                      aria-label={`参数输入-${componentType}-${parameterId}`}
                      onChange={(event) => {
                        setDraftValuesByParameterId((current) => ({
                          ...current,
                          [parameterDraftKey]: event.target.value,
                        }));
                        persistInputValue(event.target.value);
                      }}
                      value={
                        typeof draftValue === "string"
                          ? draftValue
                          : toStringValue(toInputFieldValue(inputType, persistedValue))
                      }
                    >
                      {getEnumOptions(parameter).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : inputType === "boolean" ? (
                    <input
                      className="engineering-parameter-panel__checkbox"
                      aria-label={`参数输入-${componentType}-${parameterId}`}
                      checked={
                        typeof draftValue === "boolean"
                          ? draftValue
                          : Boolean(toInputFieldValue(inputType, persistedValue))
                      }
                      onChange={(event) => {
                        setDraftValuesByParameterId((current) => ({
                          ...current,
                          [parameterDraftKey]: event.target.checked,
                        }));
                        persistInputValue(event.target.checked);
                      }}
                      type="checkbox"
                    />
                  ) : inputType === "curve" ? (
                    <button
                      aria-label={`打开曲线面板-${parameterTitle}`}
                      className="engineering-parameter-panel__button engineering-parameter-panel__button--ghost"
                      onClick={() => onOpenCurvePanel(parameter, index)}
                      type="button"
                    >
                      打开曲线面板
                    </button>
                  ) : (
                    <input
                      className="engineering-parameter-panel__field"
                      aria-label={`参数输入-${componentType}-${parameterId}`}
                      onChange={(event) => {
                        setDraftValuesByParameterId((current) => ({
                          ...current,
                          [parameterDraftKey]: event.target.value,
                        }));
                        persistInputValue(event.target.value);
                      }}
                      type={inputType === "number" ? "number" : "text"}
                      value={
                        typeof draftValue === "string"
                          ? draftValue
                          : toStringValue(toInputFieldValue(inputType, persistedValue))
                      }
                    />
                  )}
                </div>
                <div className="engineering-parameter-panel__unitCell">
                  {parameter.unit || "--"}
                </div>
                <div className="engineering-parameter-panel__measureCell">
                  <button
                    aria-label={`绑定测点-${parameterTitle}`}
                    className="engineering-parameter-panel__button engineering-parameter-panel__button--binding"
                    onClick={() => onOpenBindingPanel(parameter, index)}
                    type="button"
                  >
                    <SensorBindingIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

type OutputAnchorSection = {
  anchorId: string;
  anchorName: string;
  materialType: string;
  status: "loading" | "ready" | "error";
  parameters: ComponentSpecParameter[];
};

const OutputParameterTable = ({
  parameters,
}: {
  parameters: ComponentSpecParameter[];
}) => {
  const groups = groupParametersByGroup(parameters);

  return (
    <div className="engineering-parameter-panel__table engineering-parameter-panel__table--output">
      <div className="engineering-parameter-panel__tableHeader">
        <div>属性名</div>
        <div>值</div>
        <div>单位</div>
      </div>
      {groups.map((group) => (
        <div className="engineering-parameter-panel__group" key={group.name}>
          <div className="engineering-parameter-panel__groupRow">{group.name}</div>
          {group.items.map(({ parameter, index }) => (
            <div
              className="engineering-parameter-panel__tableRow"
              key={getParameterIdentity(parameter, index)}
            >
              <div className="engineering-parameter-panel__nameCell">
                <div className="engineering-parameter-panel__name">
                  {getParameterTitle(parameter)}
                </div>
                {getParameterDescription(parameter).length > 0 ? (
                  <div className="engineering-parameter-panel__meta">
                    {getParameterDescription(parameter).join(" · ")}
                  </div>
                ) : null}
              </div>
              <div className="engineering-parameter-panel__outputValue">
                {toStringValue(parameter.defaultValue) || "--"}
              </div>
              <div className="engineering-parameter-panel__unitCell">
                {parameter.unit || "--"}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const OutputParameterRows = ({
  parameters,
}: {
  parameters: ComponentSpecParameter[];
}) => {
  if (parameters.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">
        No output parameters defined.
      </div>
    );
  }

  return <OutputParameterTable parameters={parameters} />;
};

const AnchorParameterRows = ({
  anchorSections,
}: {
  anchorSections: OutputAnchorSection[];
}) => {
  if (anchorSections.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">
        No anchor output parameters defined.
      </div>
    );
  }

  return (
    <div className="engineering-parameter-panel__outputSections">
      {anchorSections.map((anchorSection) => (
        <div
          className="engineering-parameter-panel__anchorSection"
          key={anchorSection.anchorId}
        >
          <div className="engineering-parameter-panel__anchorHeader">
            <div className="engineering-parameter-panel__anchorTitle">
              {anchorSection.anchorName}
            </div>
            <div className="engineering-parameter-panel__anchorMaterial">
              {anchorSection.materialType}
            </div>
          </div>
          {anchorSection.status === "loading" ? (
            <div className="selected-shape-actions-placeholder">
              Loading anchor output parameters...
            </div>
          ) : anchorSection.status === "error" ? (
            <div className="selected-shape-actions-placeholder">
              Failed to load anchor output parameters.
            </div>
          ) : anchorSection.parameters.length > 0 ? (
            <OutputParameterTable parameters={anchorSection.parameters} />
          ) : (
            <div className="selected-shape-actions-placeholder">
              No anchor output parameters defined.
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const EngineeringComponentParameterPanel = ({
  section,
}: {
  section: "input" | "output" | "anchors";
}) => {
  const elements = useExcalidrawElements();
  const appState = useExcalidrawAppState();
  const ensureComponentSpecLoaded = useSetAtom(ensureComponentSpecLoadedAtom);
  const ensureComponentCurveDataLoaded = useSetAtom(
    ensureComponentCurveDataLoadedAtom,
  );
  const ensureInterfaceSpecLoaded = useSetAtom(ensureInterfaceSpecLoadedAtom);
  const syncEngineeringComponentSpecBridge = useSetAtom(
    syncEngineeringComponentSpecBridgeAtom,
  );
  const applyEngineeringScenarioMutation = useSetAtom(
    applyEngineeringScenarioMutationAtom,
  );
  const upsertEngineeringPointBinding = useSetAtom(
    upsertEngineeringPointBindingAtom,
  );
  const project = useAtomValue(engineeringProjectDocumentAtom);
  const scenario = useAtomValue(engineeringScenarioDocumentAtom);
  const specCatalog = useAtomValue(componentSpecCatalogAtom);
  const curveCatalog = useAtomValue(componentCurveCatalogAtom);
  const interfaceCatalog = useAtomValue(interfaceSpecCatalogAtom);
  const selectedComponent = getSelectedComponentContext(elements, appState);
  const componentType = selectedComponent?.componentType || null;
  const selectedComponentElementId = selectedComponent?.elementId || null;
  const selectedComponentEntityId = getComponentEntityIdForElement(
    project,
    selectedComponentElementId,
  );
  const selectedComponentAnchors = selectedComponent?.anchors || [];
  const status = componentType
    ? specCatalog.loadStatusByType[componentType]
    : undefined;
  const componentSpec = componentType
    ? specCatalog.specsByType[componentType]
    : undefined;
  const [bindingTarget, setBindingTarget] = useState<{
    id: string;
    name: string;
    variableId: string | null;
  } | null>(null);
  const [bindingDraft, setBindingDraft] = useState({
    measurement: "",
    pointName: "",
    field: "",
  });
  const [curveTarget, setCurveTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const curveStatus = componentType
    ? curveCatalog.loadStatusByType[componentType]
    : undefined;

  useEffect(() => {
    if (!componentType) {
      return;
    }

    void ensureComponentSpecLoaded(componentType);
  }, [componentType, ensureComponentSpecLoaded]);

  useEffect(() => {
    if (section !== "anchors") {
      return;
    }

    const materialTypeKeys = new Set<string>();

    selectedComponentAnchors.forEach((anchor) => {
      if (!anchor.materialType) {
        return;
      }
      materialTypeKeys.add(getInterfaceMaterialTypeKey(anchor.materialType));
    });

    materialTypeKeys.forEach((materialTypeKey) => {
      if (!materialTypeKey) {
        return;
      }
      void ensureInterfaceSpecLoaded(materialTypeKey);
    });
  }, [ensureInterfaceSpecLoaded, section, selectedComponentAnchors]);

  useEffect(() => {
    if (!componentType || status !== "ready" || !componentSpec) {
      return;
    }

    syncEngineeringComponentSpecBridge();
  }, [
    componentSpec,
    componentType,
    status,
    syncEngineeringComponentSpecBridge,
  ]);

  if (!componentType) {
    return (
      <div className="selected-shape-actions-placeholder">
        Select a component to inspect its parameters.
      </div>
    );
  }

  if (status === "loading" || !componentSpec) {
    return (
      <div className="selected-shape-actions-placeholder">
        Loading component parameters...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="selected-shape-actions-placeholder">
        Failed to load component parameters.
      </div>
    );
  }

  const anchorOutputSections = selectedComponentAnchors.reduce<
    OutputAnchorSection[]
  >((sections, anchor) => {
      const materialType = getFirstNonEmptyString(anchor.materialType);
      if (!materialType) {
        return sections;
      }

      const materialTypeKey = getInterfaceMaterialTypeKey(materialType);
      sections.push({
        anchorId: anchor.id,
        anchorName: anchor.name,
        materialType,
        status: interfaceCatalog.loadStatusByMaterialType[materialTypeKey] || "loading",
        parameters:
          interfaceCatalog.specsByMaterialType[materialTypeKey]?.parameters || [],
      });
      return sections;
    }, []);

  let curveSummary: string | null = null;
  if (componentType && curveTarget) {
    const curveData = curveCatalog.curvesByType[componentType];
    const currentCurve = curveData?.curvesByParameterId[curveTarget.id];

    if (Array.isArray(currentCurve)) {
      curveSummary = `${currentCurve.length} points`;
    } else if (typeof currentCurve === "object" && currentCurve) {
      curveSummary = `${Object.keys(currentCurve as Record<string, unknown>).length} fields`;
    } else if (currentCurve) {
      curveSummary = "ready";
    }
  }

  const openCurvePanel = (
    parameter: ComponentSpecParameter,
    index: number,
  ) => {
    if (componentType) {
      void ensureComponentCurveDataLoaded(componentType);
    }

    setCurveTarget({
      id: getParameterIdentity(parameter, index),
      name: getParameterTitle(parameter),
    });
  };

  const openBindingPanel = (
    parameter: ComponentSpecParameter,
    index: number,
  ) => {
    const resolvedBinding = resolveStoredBinding(parameter, index);
    const variableId = resolvedBinding?.variableId || null;
    const storedPointBinding = variableId
      ? scenario.pointBindings[variableId]
      : undefined;

    setBindingTarget({
      id: getParameterIdentity(parameter, index),
      name: getParameterTitle(parameter),
      variableId,
    });
    setBindingDraft({
      measurement: storedPointBinding?.measurement || "",
      pointName: storedPointBinding?.pointName || "",
      field: storedPointBinding?.field || "value",
    });
  };

  const resolveStoredBinding = (
    parameter: ComponentSpecParameter,
    index: number,
  ) =>
    resolveInputParameterBinding({
      project,
      scenario,
      componentEntityId: selectedComponentEntityId,
      parameter,
      index,
    });

  const persistInputValue = (
    parameter: ComponentSpecParameter,
    index: number,
    inputValue: EngineeringValue | undefined,
    _inputType: InputType,
  ) => {
    const binding = resolveStoredBinding(parameter, index);

    if (!binding) {
      return;
    }

    const currentSnapshot = scenario.manualInputs[binding.variableId];
    const shouldUnset = typeof inputValue === "undefined";
    const hasCurrentSnapshot = !!currentSnapshot;
    const isSameValue =
      !shouldUnset &&
      hasCurrentSnapshot &&
      Object.is(currentSnapshot.value, inputValue) &&
      currentSnapshot.providerId === binding.providerId &&
      currentSnapshot.source === "frontend_manual_input" &&
      currentSnapshot.status === "ok";

    if ((shouldUnset && !hasCurrentSnapshot) || isSameValue) {
      return;
    }

    applyEngineeringScenarioMutation({
      updater: (current) => {
        if (shouldUnset) {
          if (!(binding.variableId in current.manualInputs)) {
            return current;
          }

          const nextManualInputs = {
            ...current.manualInputs,
          };
          delete nextManualInputs[binding.variableId];

          return {
            ...current,
            manualInputs: nextManualInputs,
          };
        }

        return {
          ...current,
          manualInputs: {
            ...current.manualInputs,
            [binding.variableId]: createValueSnapshot({
              variableId: binding.variableId,
              value: inputValue as EngineeringValue,
              source: "frontend_manual_input",
              status: "ok",
              providerId: binding.providerId,
            }),
          },
        };
      },
    });
  };

  return (
    <div className="selected-shape-actions__stack engineering-parameter-panel">
      {section === "input" ? (
        <InputParameterRows
          componentEntityId={selectedComponentEntityId}
          componentType={componentType}
          onOpenBindingPanel={openBindingPanel}
          onOpenCurvePanel={openCurvePanel}
          onPersistValue={persistInputValue}
          parameters={componentSpec.inputParameters}
          resolveStoredBinding={resolveStoredBinding}
        />
      ) : section === "output" ? (
        <OutputParameterRows parameters={componentSpec.outputParameters} />
      ) : (
        <AnchorParameterRows anchorSections={anchorOutputSections} />
      )}
      {section === "input" && bindingTarget ? (
        <div className="selected-shape-actions-card engineering-parameter-panel__drawer">
          <div className="selected-shape-actions-card__title">
            测点绑定（占位）
          </div>
          <div className="selected-shape-actions-card__meta">
            当前参数：{bindingTarget.name}
          </div>
          <div className="selected-shape-actions-data-list engineering-parameter-panel__grid">
            <label className="selected-shape-actions-data-row engineering-parameter-panel__row">
              <span>measurement</span>
              <input
                aria-label="measurement-input"
                className="engineering-parameter-panel__field"
                onChange={(event) =>
                  setBindingDraft((current) => ({
                    ...current,
                    measurement: event.target.value,
                  }))
                }
                placeholder="measurement"
                type="text"
                value={bindingDraft.measurement}
              />
            </label>
            <label className="selected-shape-actions-data-row engineering-parameter-panel__row">
              <span>point_name</span>
              <input
                aria-label="point-name-input"
                className="engineering-parameter-panel__field"
                onChange={(event) =>
                  setBindingDraft((current) => ({
                    ...current,
                    pointName: event.target.value,
                  }))
                }
                placeholder="point_name"
                type="text"
                value={bindingDraft.pointName}
              />
            </label>
            <label className="selected-shape-actions-data-row engineering-parameter-panel__row">
              <span>field</span>
              <input
                aria-label="field-input"
                className="engineering-parameter-panel__field"
                onChange={(event) =>
                  setBindingDraft((current) => ({
                    ...current,
                    field: event.target.value,
                  }))
                }
                placeholder="field"
                type="text"
                value={bindingDraft.field}
              />
            </label>
          </div>
          <div className="selected-shape-actions-data-row engineering-parameter-panel__row">
            <span />
            <button
              className="engineering-parameter-panel__button"
              onClick={() => {
                if (!bindingTarget.variableId) {
                  return;
                }

                upsertEngineeringPointBinding({
                  variableId: bindingTarget.variableId,
                  measurement: bindingDraft.measurement.trim(),
                  pointName: bindingDraft.pointName.trim(),
                  field: bindingDraft.field.trim(),
                });
                setBindingTarget(null);
              }}
              type="button"
            >
              保存绑定
            </button>
            <button
              className="engineering-parameter-panel__button"
              onClick={() => setBindingTarget(null)}
              type="button"
            >
              关闭绑定面板
            </button>
          </div>
        </div>
      ) : null}
      {section === "input" && curveTarget ? (
        <div className="selected-shape-actions-card engineering-parameter-panel__drawer">
          <div className="selected-shape-actions-card__title">曲线面板（占位）</div>
          <div className="selected-shape-actions-card__meta">
            当前参数：{curveTarget.name}
          </div>
          <div className="selected-shape-actions-card__meta">
            状态：
            {curveStatus === "loading"
              ? "加载中"
              : curveStatus === "ready"
              ? "已加载"
              : curveStatus === "error"
              ? "加载失败"
              : "未加载"}
            {curveSummary ? ` · ${curveSummary}` : ""}
          </div>
          <div className="selected-shape-actions-data-row engineering-parameter-panel__row">
            <span />
            <button
              className="engineering-parameter-panel__button"
              onClick={() => setCurveTarget(null)}
              type="button"
            >
              关闭曲线面板
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
