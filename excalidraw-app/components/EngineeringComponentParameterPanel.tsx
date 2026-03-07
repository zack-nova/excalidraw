import {
  useExcalidrawAppState,
  useExcalidrawElements,
} from "@excalidraw/excalidraw/components/App";
import { useEffect, useMemo, useState } from "react";

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
} from "../engineering/engineering-domain";
import { syncEngineeringComponentSpecBridgeAtom } from "../engineering/engineering-component-spec-bridge-state";
import {
  applyEngineeringScenarioMutationAtom,
  engineeringProjectDocumentAtom,
  engineeringScenarioDocumentAtom,
  upsertEngineeringPointBindingAtom,
} from "../engineering/engineering-domain-state";
import {
  toComponentParameterLookupKey,
  toComponentParameterStableToken,
} from "../engineering/engineering-parameter-identity";
import {
  getSelectedEngineeringTableMaterialContext,
  type EngineeringTableMaterialResizeOperation,
} from "../data/engineeringTableMaterial";
import {
  getSelectedEngineeringChartMaterialContext,
  type EngineeringChartMaterialPatch,
} from "../data/engineeringChartMaterial";
import {
  getFirstNonEmptyString,
  normalizeLookupKey,
} from "../engineering/engineering-component-data-utils";
import {
  EngineeringChartMaterialActionsPanel,
  EngineeringChartMaterialDataPanel,
  EngineeringTableMaterialActionsPanel,
  NormalShapeDataPanel,
  NormalShapeOperationsPanel,
} from "./engineering-component-parameter-panel/actions-panel";
import { AnchorsPanel } from "./engineering-component-parameter-panel/anchors-panel";
import {
  BindingDrawer,
  type BindingTarget,
  type PointBindingDraft,
} from "./engineering-component-parameter-panel/binding-drawer";
import {
  CurveDrawer,
  type CurveTarget,
} from "./engineering-component-parameter-panel/curve-drawer";
import { InputParameterPanel } from "./engineering-component-parameter-panel/input-panel";
import { getParameterIdentity, getParameterTitle } from "./engineering-component-parameter-panel/panel-utils";
import {
  collectSelectedShapeVariableBindings,
  getSelectedComponentContext,
} from "./engineering-component-parameter-panel/selectors";
import { OutputParameterPanel } from "./engineering-component-parameter-panel/output-panel";
import type {
  InputType,
  OutputAnchorSection,
  ResolvedInputParameterBinding,
} from "./engineering-component-parameter-panel/types";
import "./EngineeringComponentParameterPanel.scss";

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

    if (directElementId === elementId || elementIds.includes(elementId)) {
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

export const EngineeringComponentParameterPanel = ({
  section,
  onEngineeringTableResize,
  onEngineeringChartApply,
}: {
  section: "actions" | "input" | "output" | "anchors" | "data";
  onEngineeringTableResize?: (
    operation: EngineeringTableMaterialResizeOperation,
  ) => void;
  onEngineeringChartApply?: (patch: EngineeringChartMaterialPatch) => void;
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
  const selectedEngineeringTableMaterial = getSelectedEngineeringTableMaterialContext(
    {
      elements,
      appState,
    },
  );
  const selectedChartMaterial = getSelectedEngineeringChartMaterialContext({
    elements,
    appState,
  });
  const selectedShapeVariableBindings = collectSelectedShapeVariableBindings({
    elements,
    appState,
    tableGroupId: selectedEngineeringTableMaterial?.groupId || null,
  });
  const selectedComponent = getSelectedComponentContext(elements, appState);
  const componentType = selectedComponent?.componentType || null;
  const selectedComponentElementId = selectedComponent?.elementId || null;
  const selectedComponentEntityId = getComponentEntityIdForElement(
    project,
    selectedComponentElementId,
  );
  const selectedComponentAnchors = selectedComponent?.anchors || [];
  const focusedAnchorIndex = selectedComponent?.focusedAnchorIndex ?? null;
  const anchorMaterialTypeKeys = useMemo(() => {
    if (section !== "anchors") {
      return [] as string[];
    }

    const materialTypeKeys = new Set<string>();

    selectedComponentAnchors.forEach((anchor) => {
      if (!anchor.materialType) {
        return;
      }
      materialTypeKeys.add(getInterfaceMaterialTypeKey(anchor.materialType));
    });

    return Array.from(materialTypeKeys).filter(Boolean).sort();
  }, [section, selectedComponentAnchors]);
  const focusedAnchorId =
    focusedAnchorIndex !== null &&
    focusedAnchorIndex >= 0 &&
    focusedAnchorIndex < selectedComponentAnchors.length
      ? selectedComponentAnchors[focusedAnchorIndex]?.id || null
      : null;
  const status = componentType
    ? specCatalog.loadStatusByType[componentType]
    : undefined;
  const componentSpec = componentType
    ? specCatalog.specsByType[componentType]
    : undefined;
  const [bindingTarget, setBindingTarget] = useState<BindingTarget | null>(null);
  const [bindingDraft, setBindingDraft] = useState<PointBindingDraft>({
    measurement: "",
    pointName: "",
    field: "",
  });
  const [curveTarget, setCurveTarget] = useState<CurveTarget | null>(null);

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
    if (section !== "anchors" || anchorMaterialTypeKeys.length === 0) {
      return;
    }

    anchorMaterialTypeKeys.forEach((materialTypeKey) => {
      if (interfaceCatalog.loadStatusByMaterialType[materialTypeKey]) {
        return;
      }
      void ensureInterfaceSpecLoaded(materialTypeKey);
    });
  }, [
    anchorMaterialTypeKeys,
    ensureInterfaceSpecLoaded,
    interfaceCatalog.loadStatusByMaterialType,
    section,
  ]);

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

  if (section === "actions") {
    if (selectedEngineeringTableMaterial) {
      return (
        <EngineeringTableMaterialActionsPanel
          rows={selectedEngineeringTableMaterial.rows}
          cols={selectedEngineeringTableMaterial.cols}
          onResize={onEngineeringTableResize}
        />
      );
    }

    if (selectedChartMaterial) {
      return (
        <EngineeringChartMaterialActionsPanel
          chartElementId={selectedChartMaterial.elementId}
          chartMaterial={selectedChartMaterial.material}
          onApply={onEngineeringChartApply}
        />
      );
    }

    return <NormalShapeOperationsPanel />;
  }

  if (section === "data") {
    if (componentType) {
      return null;
    }
    if (selectedChartMaterial) {
      return (
        <EngineeringChartMaterialDataPanel
          bindings={selectedChartMaterial.material.bindings}
          warnings={selectedChartMaterial.material.warnings}
          lastErrorSummary={selectedChartMaterial.material.lastErrorSummary}
        />
      );
    }
    return <NormalShapeDataPanel bindings={selectedShapeVariableBindings} />;
  }

  if (!componentType && selectedEngineeringTableMaterial) {
    return (
      <EngineeringTableMaterialActionsPanel
        rows={selectedEngineeringTableMaterial.rows}
        cols={selectedEngineeringTableMaterial.cols}
        onResize={onEngineeringTableResize}
      />
    );
  }

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
  const visibleAnchorOutputSections =
    section === "anchors" && focusedAnchorId
      ? anchorOutputSections.filter(
          (anchorSection) => anchorSection.anchorId === focusedAnchorId,
        )
      : anchorOutputSections;

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
        <InputParameterPanel
          componentEntityId={selectedComponentEntityId}
          componentType={componentType}
          onOpenBindingPanel={openBindingPanel}
          onOpenCurvePanel={openCurvePanel}
          onPersistValue={persistInputValue}
          parameters={componentSpec.inputParameters}
          resolveStoredBinding={resolveStoredBinding}
        />
      ) : section === "output" ? (
        <OutputParameterPanel parameters={componentSpec.outputParameters} />
      ) : (
        <AnchorsPanel anchorSections={visibleAnchorOutputSections} />
      )}
      {section === "input" && bindingTarget ? (
        <BindingDrawer
          bindingDraft={bindingDraft}
          bindingTarget={bindingTarget}
          onBindingDraftChange={setBindingDraft}
          onClose={() => setBindingTarget(null)}
          onSave={() => {
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
        />
      ) : null}
      {section === "input" && curveTarget ? (
        <CurveDrawer
          curveStatus={curveStatus}
          curveSummary={curveSummary}
          curveTarget={curveTarget}
          onClose={() => setCurveTarget(null)}
        />
      ) : null}
    </div>
  );
};
