import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import {
  useApp,
  useExcalidrawAppState,
  useExcalidrawElements,
} from "@excalidraw/excalidraw/components/App";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAtomValue, useSetAtom } from "../app-jotai";
import {
  componentSpecCatalogAtom,
  ensureComponentSpecLoadedAtom,
  ensureInterfaceSpecLoadedAtom,
  getInterfaceMaterialTypeKey,
  interfaceSpecCatalogAtom,
  type ComponentSpecParameter,
} from "../component-spec-store";
import {
  engineeringProjectDocumentAtom,
  engineeringRuntimeProjectionAtom,
  engineeringScenarioDocumentAtom,
} from "../engineering-domain-state";
import type {
  ProjectDocument,
  RuntimeProjection,
  ScenarioDocument,
  VariableDef,
} from "../engineering-domain";
import {
  toComponentParameterLookupKey,
  toComponentParameterStableToken,
} from "../engineering-parameter-identity";
import { engineeringWorkspaceModeAtom } from "../engineering-ui-state";
import {
  getFirstNonEmptyString,
  isRecord,
  normalizeLookupKey,
  parseEngineeringComponent,
  type ParsedEngineeringAnchor,
} from "../engineering-component-data-utils";

import "./EngineeringHoverPreviewOverlay.scss";

type HoverPreviewTarget =
  | {
      kind: "component";
      elementId: string;
      componentType: string;
      componentName: string;
      componentEntityId: string | null;
      sceneX: number;
      sceneY: number;
    }
  | {
      kind: "anchor";
      elementId: string;
      anchorEntityId: string | null;
      anchorName: string;
      materialType: string;
      sceneX: number;
      sceneY: number;
    };

type HoverPreviewRow = {
  id: string;
  text: string;
};

type HoverPreviewCard = {
  title: string;
  subtitle: string | null;
  sceneX: number;
  sceneY: number;
  rows: HoverPreviewRow[];
};

type ParsedAnchor = ParsedEngineeringAnchor;

type ParsedComponentData = {
  componentType: string;
  componentName: string;
  anchors: ParsedAnchor[];
};

const HIDE_DELAY_MS = 150;

const getParsedComponentDataFromElement = (
  element: ReturnType<typeof useExcalidrawElements>[number],
): ParsedComponentData | null => {
  const isEngineeringComponent =
    element.customData?.isEngineeringComponent === true ||
    element.customData?.component?.isEngineeringComponent === true;
  if (!isEngineeringComponent) {
    return null;
  }

  const component = element.customData?.component;
  const parsedComponent = parseEngineeringComponent(component);
  if (!parsedComponent) {
    return null;
  }

  const componentName =
    getFirstNonEmptyString(
      parsedComponent.nameCn,
      parsedComponent.name,
      parsedComponent.componentType,
    ) || parsedComponent.componentType;

  return {
    componentType: parsedComponent.componentType,
    componentName,
    anchors: parsedComponent.anchors,
  };
};

const getComponentEntityForElement = (
  project: ProjectDocument,
  elementId: string,
) =>
  Object.values(project.topology.componentsById).find(
    (component) =>
      component.props.elementId === elementId ||
      (Array.isArray(component.props.elementIds) &&
        component.props.elementIds.includes(elementId)),
  ) || null;

const getAnchorScenePointFromCustomAnchorPoints = (
  element: ReturnType<typeof useExcalidrawElements>[number],
  anchorIndex: number,
) => {
  const anchorPoints = Array.isArray(element.customData?.anchorPoints)
    ? element.customData.anchorPoints
    : [];
  const maybeAnchorPoint = anchorPoints[anchorIndex];
  if (
    !Array.isArray(maybeAnchorPoint) ||
    maybeAnchorPoint.length !== 2 ||
    typeof maybeAnchorPoint[0] !== "number" ||
    typeof maybeAnchorPoint[1] !== "number"
  ) {
    return null;
  }

  const clampedX = clamp(maybeAnchorPoint[0], 0, 1);
  const clampedY = clamp(maybeAnchorPoint[1], 0, 1);
  return {
    x: element.x + element.width * clampedX,
    y: element.y + element.height * clampedY,
  };
};

const resolveTopologyAnchorEntityId = ({
  project,
  componentEntityId,
  elementId,
  anchorIndex,
  parsedAnchorId,
}: {
  project: ProjectDocument;
  componentEntityId: string | null;
  elementId: string;
  anchorIndex: number;
  parsedAnchorId: string | null;
}) => {
  if (!componentEntityId) {
    return null;
  }

  const componentEntity = project.topology.componentsById[componentEntityId];
  if (!componentEntity) {
    return null;
  }

  const elementScopedAnchorIds = componentEntity.anchorIds.filter((anchorId) =>
    anchorId.includes(`:${elementId}:`),
  );

  if (parsedAnchorId) {
    const matchedByParsedId =
      elementScopedAnchorIds.find((anchorId) =>
        anchorId.endsWith(`:${parsedAnchorId}`),
      ) ||
      componentEntity.anchorIds.find((anchorId) =>
        anchorId.endsWith(`:${parsedAnchorId}`),
      ) ||
      null;
    if (matchedByParsedId) {
      return matchedByParsedId;
    }
  }

  return (
    elementScopedAnchorIds[anchorIndex] ||
    componentEntity.anchorIds[anchorIndex] ||
    null
  );
};

const isBasicGroup = (group: string | null) => {
  if (!group) {
    return false;
  }
  const normalized = group.trim().toLowerCase();
  return normalized.includes("基本") || normalized.includes("basic");
};

const isVisibleHoverParameter = (parameter: ComponentSpecParameter) => {
  const normalizedValueType = (parameter.valueType || "").trim().toLowerCase();
  if (parameter.hasCurveData || normalizedValueType === "curve") {
    return false;
  }
  if (normalizedValueType === "button") {
    return false;
  }
  return true;
};

const getParameterDisplayName = (parameter: ComponentSpecParameter, index: number) =>
  getFirstNonEmptyString(parameter.nameCn, parameter.name, parameter.key) ||
  `Parameter ${index + 1}`;

const formatHoverValue = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "--";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "--";
};

const resolveParameterVariable = (
  variables: VariableDef[],
  parameter: ComponentSpecParameter,
  index: number,
) => {
  const stableToken = toComponentParameterStableToken(parameter, index);
  const lookupKeyRaw = toComponentParameterLookupKey(parameter);
  const lookupKey = lookupKeyRaw ? normalizeLookupKey(lookupKeyRaw) : null;

  const byStableToken =
    variables.find((variable) => variable.tags?.specParameterToken === stableToken) ||
    null;
  if (byStableToken) {
    return byStableToken;
  }

  if (lookupKey) {
    const byTpisKey =
      variables.find(
        (variable) =>
          normalizeLookupKey(variable.backend?.tpisKey || "") === lookupKey,
      ) || null;
    if (byTpisKey) {
      return byTpisKey;
    }

    const byVariableKey =
      variables.find((variable) => normalizeLookupKey(variable.key) === lookupKey) ||
      null;
    if (byVariableKey) {
      return byVariableKey;
    }
  }

  return null;
};

const resolveHoverValue = ({
  variableId,
  defaultValue,
  manualInputs,
  runtimeValues,
}: {
  variableId: string | null;
  defaultValue: unknown;
  manualInputs: ScenarioDocument["manualInputs"];
  runtimeValues: RuntimeProjection["effectiveValues"];
}) => {
  if (!variableId) {
    return defaultValue;
  }

  const manualValue = manualInputs[variableId]?.value;
  if (typeof manualValue !== "undefined") {
    return manualValue;
  }

  const runtimeValue = runtimeValues[variableId]?.value;
  if (typeof runtimeValue !== "undefined") {
    return runtimeValue;
  }

  return defaultValue;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const resolveEngineeringHoverTarget = ({
  workspaceMode,
  elements,
  appState,
  project,
  pointerHoveredElementId,
}: {
  workspaceMode: string;
  elements: ReturnType<typeof useExcalidrawElements>;
  appState: ReturnType<typeof useExcalidrawAppState>;
  project: ProjectDocument;
  pointerHoveredElementId?: string | null;
}): HoverPreviewTarget | null => {
  if (workspaceMode !== "data") {
    return null;
  }

  if (
    typeof appState.hoveredAnchorElementId === "string" &&
    appState.hoveredAnchorElementId.trim().length > 0 &&
    typeof appState.hoveredAnchorPointIndex === "number" &&
    appState.hoveredAnchorPointIndex >= 0
  ) {
    const hoveredElement = elements.find(
      (element) => element.id === appState.hoveredAnchorElementId,
    );
    if (hoveredElement) {
      const anchorIndex = appState.hoveredAnchorPointIndex;
      const parsedComponentData = getParsedComponentDataFromElement(hoveredElement);

      const parsedAnchor =
        parsedComponentData && anchorIndex < parsedComponentData.anchors.length
          ? parsedComponentData.anchors[anchorIndex]
          : null;
      const componentEntity = getComponentEntityForElement(project, hoveredElement.id);
      const anchorEntityId = resolveTopologyAnchorEntityId({
        project,
        componentEntityId: componentEntity?.id || null,
        elementId: hoveredElement.id,
        anchorIndex,
        parsedAnchorId: parsedAnchor?.id || null,
      });
      const topologyAnchor = anchorEntityId
        ? project.topology.anchorsById[anchorEntityId]
        : null;
      const anchorScenePoint = getAnchorScenePointFromCustomAnchorPoints(
        hoveredElement,
        anchorIndex,
      );
      const sceneX =
        anchorScenePoint?.x ??
        (typeof parsedAnchor?.position?.x === "number"
          ? hoveredElement.x + hoveredElement.width * parsedAnchor.position.x
          : hoveredElement.x + hoveredElement.width);
      const sceneY =
        anchorScenePoint?.y ??
        (typeof parsedAnchor?.position?.y === "number"
          ? hoveredElement.y + hoveredElement.height * parsedAnchor.position.y
          : hoveredElement.y);
      const materialType = getFirstNonEmptyString(
        parsedAnchor?.materialType,
        topologyAnchor?.medium,
      );
      if (materialType) {
        return {
          kind: "anchor",
          elementId: hoveredElement.id,
          anchorEntityId,
          anchorName:
            getFirstNonEmptyString(
              parsedAnchor?.name,
              topologyAnchor?.name,
              topologyAnchor?.key,
            ) || `Anchor ${anchorIndex + 1}`,
          materialType,
          sceneX,
          sceneY,
        };
      }
    }
  }

  const hoveredElementIds = Object.keys(appState.hoveredElementIds || {}).filter(
    (elementId) => !!appState.hoveredElementIds[elementId],
  );
  if (hoveredElementIds.length === 0 && pointerHoveredElementId) {
    hoveredElementIds.push(pointerHoveredElementId);
  }
  if (hoveredElementIds.length === 0) {
    return null;
  }

  for (const hoveredElementId of hoveredElementIds) {
    const hoveredElement = elements.find((element) => element.id === hoveredElementId);
    if (!hoveredElement) {
      continue;
    }

    const parsedComponentData = getParsedComponentDataFromElement(hoveredElement);
    if (!parsedComponentData) {
      continue;
    }

    const componentEntity = getComponentEntityForElement(project, hoveredElement.id);
    return {
      kind: "component",
      elementId: hoveredElement.id,
      componentType: parsedComponentData.componentType,
      componentName: parsedComponentData.componentName,
      componentEntityId: componentEntity?.id || null,
      sceneX: hoveredElement.x + hoveredElement.width,
      sceneY: hoveredElement.y,
    };
  }

  return null;
};

export const EngineeringHoverPreviewOverlay = () => {
  const app = useApp();
  const elements = useExcalidrawElements();
  const appState = useExcalidrawAppState();
  const workspaceMode = useAtomValue(engineeringWorkspaceModeAtom);
  const project = useAtomValue(engineeringProjectDocumentAtom);
  const scenario = useAtomValue(engineeringScenarioDocumentAtom);
  const runtimeProjection = useAtomValue(engineeringRuntimeProjectionAtom);
  const componentSpecCatalog = useAtomValue(componentSpecCatalogAtom);
  const interfaceSpecCatalog = useAtomValue(interfaceSpecCatalogAtom);
  const ensureComponentSpecLoaded = useSetAtom(ensureComponentSpecLoadedAtom);
  const ensureInterfaceSpecLoaded = useSetAtom(ensureInterfaceSpecLoadedAtom);
  const [displayedCard, setDisplayedCard] = useState<HoverPreviewCard | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [pointerHoveredElementId, setPointerHoveredElementId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const getElementAtPosition = (
      app as typeof app & {
        getElementAtPosition?: (
          x: number,
          y: number,
          opts?: {
            includeBoundTextElement?: boolean;
            includeLockedElements?: boolean;
          },
        ) => { id: string } | null;
      }
    ).getElementAtPosition;
    if (typeof getElementAtPosition !== "function") {
      return;
    }

    const updateHoveredElementFromPointer = () => {
      const pointer = app.lastPointerMoveCoords;
      if (!pointer) {
        setPointerHoveredElementId((prev) => (prev === null ? prev : null));
        return;
      }

      const hitElement = getElementAtPosition.call(app, pointer.x, pointer.y, {
        includeBoundTextElement: false,
        includeLockedElements: false,
      });
      const nextHoveredElementId = hitElement?.id || null;
      setPointerHoveredElementId((prev) =>
        prev === nextHoveredElementId ? prev : nextHoveredElementId,
      );
    };

    updateHoveredElementFromPointer();
    window.addEventListener("pointermove", updateHoveredElementFromPointer, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", updateHoveredElementFromPointer);
    };
  }, [app]);

  const hoverTarget = useMemo(
    () =>
      resolveEngineeringHoverTarget({
        workspaceMode,
        elements,
        appState,
        project,
        pointerHoveredElementId,
      }),
    [appState, elements, pointerHoveredElementId, project, workspaceMode],
  );

  const hoveredComponentType =
    hoverTarget?.kind === "component" ? hoverTarget.componentType : null;
  const hoveredAnchorMaterialType =
    hoverTarget?.kind === "anchor" ? hoverTarget.materialType : null;
  const hoveredAnchorMaterialTypeKey = hoveredAnchorMaterialType
    ? getInterfaceMaterialTypeKey(hoveredAnchorMaterialType)
    : null;

  useEffect(() => {
    if (!hoveredComponentType) {
      return;
    }

    if (componentSpecCatalog.loadStatusByType[hoveredComponentType]) {
      return;
    }

    void ensureComponentSpecLoaded(hoveredComponentType);
  }, [
    componentSpecCatalog.loadStatusByType,
    ensureComponentSpecLoaded,
    hoveredComponentType,
  ]);

  useEffect(() => {
    if (!hoveredAnchorMaterialTypeKey) {
      return;
    }

    if (interfaceSpecCatalog.loadStatusByMaterialType[hoveredAnchorMaterialTypeKey]) {
      return;
    }

    void ensureInterfaceSpecLoaded(hoveredAnchorMaterialTypeKey);
  }, [
    ensureInterfaceSpecLoaded,
    hoveredAnchorMaterialTypeKey,
    interfaceSpecCatalog.loadStatusByMaterialType,
  ]);

  const computedCard = useMemo<HoverPreviewCard | null>(() => {
    if (!hoverTarget) {
      return null;
    }

    if (hoverTarget.kind === "component") {
      const status = componentSpecCatalog.loadStatusByType[hoverTarget.componentType] || "loading";
      const componentSpec = componentSpecCatalog.specsByType[hoverTarget.componentType];
      if (status === "error") {
        return {
          title: hoverTarget.componentName,
          subtitle: "输入参数",
          sceneX: hoverTarget.sceneX,
          sceneY: hoverTarget.sceneY,
          rows: [{ id: "error", text: "参数加载失败" }],
        };
      }
      if (status !== "ready" || !componentSpec) {
        return {
          title: hoverTarget.componentName,
          subtitle: "输入参数",
          sceneX: hoverTarget.sceneX,
          sceneY: hoverTarget.sceneY,
          rows: [{ id: "loading", text: "参数加载中..." }],
        };
      }

      const indexedParameters = componentSpec.inputParameters
        .map((parameter, index) => ({ parameter, index }))
        .filter(({ parameter }) => isVisibleHoverParameter(parameter));
      const hasBasicGroup = indexedParameters.some(({ parameter }) =>
        isBasicGroup(parameter.group),
      );
      const visibleIndexedParameters = hasBasicGroup
        ? indexedParameters.filter(({ parameter }) => isBasicGroup(parameter.group))
        : indexedParameters;
      const componentVariables = hoverTarget.componentEntityId
        ? Object.values(project.variableCatalog.variablesById).filter(
            (variable) =>
              variable.owner.kind === "component" &&
              variable.owner.id === hoverTarget.componentEntityId &&
              variable.role === "input",
          )
        : [];
      const rowsFromSpec = visibleIndexedParameters.map(({ parameter, index }) => {
        const variable = resolveParameterVariable(componentVariables, parameter, index);
        const resolvedValue = resolveHoverValue({
          variableId: variable?.id || null,
          defaultValue: parameter.defaultValue,
          manualInputs: scenario.manualInputs,
          runtimeValues: runtimeProjection.effectiveValues,
        });
        const displayName = getParameterDisplayName(parameter, index);
        const displayValue = formatHoverValue(resolvedValue);
        const displayUnit = getFirstNonEmptyString(parameter.unit) || "";

        return {
          id: `${parameter.id || parameter.key || index}`,
          text: `${displayName}: ${displayValue}${displayUnit}`,
        };
      });
      const fallbackRows = componentVariables
        .filter((variable) => variable.valueType !== "curve")
        .sort((left, right) => left.key.localeCompare(right.key))
        .map((variable) => {
          const resolvedValue = resolveHoverValue({
            variableId: variable.id,
            defaultValue: undefined,
            manualInputs: scenario.manualInputs,
            runtimeValues: runtimeProjection.effectiveValues,
          });
          const displayName =
            getFirstNonEmptyString(variable.nameCn, variable.name, variable.key) ||
            variable.key;
          const displayValue = formatHoverValue(resolvedValue);
          const displayUnit =
            getFirstNonEmptyString(variable.displayUnit, variable.canonicalUnit) || "";

          return {
            id: `variable:${variable.id}`,
            text: `${displayName}: ${displayValue}${displayUnit}`,
          };
        });
      const rows = rowsFromSpec.length > 0 ? rowsFromSpec : fallbackRows;

      return {
        title: hoverTarget.componentName,
        subtitle: "输入参数",
        sceneX: hoverTarget.sceneX,
        sceneY: hoverTarget.sceneY,
        rows: rows.length > 0 ? rows : [{ id: "empty", text: "暂无可显示参数" }],
      };
    }

    const materialTypeKey = getInterfaceMaterialTypeKey(hoverTarget.materialType);
    const status = interfaceSpecCatalog.loadStatusByMaterialType[materialTypeKey] || "loading";
    const interfaceSpec = interfaceSpecCatalog.specsByMaterialType[materialTypeKey];
    if (status === "error") {
      return {
        title: hoverTarget.anchorName,
        subtitle: hoverTarget.materialType,
        sceneX: hoverTarget.sceneX,
        sceneY: hoverTarget.sceneY,
        rows: [{ id: "error", text: "接口参数加载失败" }],
      };
    }
    if (status !== "ready" || !interfaceSpec) {
      return {
        title: hoverTarget.anchorName,
        subtitle: hoverTarget.materialType,
        sceneX: hoverTarget.sceneX,
        sceneY: hoverTarget.sceneY,
        rows: [{ id: "loading", text: "接口参数加载中..." }],
      };
    }

    const anchorVariables = hoverTarget.anchorEntityId
      ? Object.values(project.variableCatalog.variablesById).filter(
          (variable) =>
            variable.owner.kind === "anchor" &&
            variable.owner.id === hoverTarget.anchorEntityId,
        )
      : [];
    const rows = interfaceSpec.parameters
      .map((parameter, index) => ({ parameter, index }))
      .filter(({ parameter }) => isVisibleHoverParameter(parameter))
      .map(({ parameter, index }) => {
        const variable = resolveParameterVariable(anchorVariables, parameter, index);
        const resolvedValue = resolveHoverValue({
          variableId: variable?.id || null,
          defaultValue: parameter.defaultValue,
          manualInputs: scenario.manualInputs,
          runtimeValues: runtimeProjection.effectiveValues,
        });
        const displayName = getParameterDisplayName(parameter, index);
        const displayValue = formatHoverValue(resolvedValue);
        const displayUnit = getFirstNonEmptyString(parameter.unit) || "";

        return {
          id: `${parameter.id || parameter.key || index}`,
          text: `${displayName}: ${displayValue}${displayUnit}`,
        };
      });

    return {
      title: hoverTarget.anchorName,
      subtitle: hoverTarget.materialType,
      sceneX: hoverTarget.sceneX,
      sceneY: hoverTarget.sceneY,
      rows: rows.length > 0 ? rows : [{ id: "empty", text: "暂无可显示参数" }],
    };
  }, [
    componentSpecCatalog.loadStatusByType,
    componentSpecCatalog.specsByType,
    hoverTarget,
    interfaceSpecCatalog.loadStatusByMaterialType,
    interfaceSpecCatalog.specsByMaterialType,
    project.variableCatalog.variablesById,
    runtimeProjection.effectiveValues,
    scenario.manualInputs,
  ]);

  useEffect(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (computedCard) {
      setDisplayedCard(computedCard);
      return;
    }

    hideTimerRef.current = window.setTimeout(() => {
      setDisplayedCard(null);
      hideTimerRef.current = null;
    }, HIDE_DELAY_MS);

    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [computedCard]);

  useEffect(
    () => () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    },
    [],
  );

  if (!displayedCard) {
    return null;
  }

  const viewportPoint = sceneCoordsToViewportCoords(
    {
      sceneX: displayedCard.sceneX,
      sceneY: displayedCard.sceneY,
    },
    appState,
  );
  const estimatedCardWidth = 320;
  const estimatedCardHeight = clamp(
    36 +
      (displayedCard.subtitle ? 16 : 0) +
      displayedCard.rows.length * 18,
    64,
    220,
  );
  const left = clamp(
    viewportPoint.x + 10,
    8,
    Math.max(8, window.innerWidth - estimatedCardWidth - 8),
  );
  const top = clamp(
    viewportPoint.y - estimatedCardHeight - 10,
    8,
    Math.max(8, window.innerHeight - estimatedCardHeight - 8),
  );

  return (
    <div
      className="engineering-hover-preview"
      data-testid="engineering-hover-preview-card"
      style={{
        left,
        top,
        pointerEvents: "none",
      }}
    >
      <div className="engineering-hover-preview__title">{displayedCard.title}</div>
      {displayedCard.subtitle ? (
        <div className="engineering-hover-preview__subtitle">
          {displayedCard.subtitle}
        </div>
      ) : null}
      <ul className="engineering-hover-preview__list">
        {displayedCard.rows.map((row) => (
          <li
            className="engineering-hover-preview__row"
            key={row.id}
            title={row.text}
          >
            {row.text}
          </li>
        ))}
      </ul>
    </div>
  );
};
