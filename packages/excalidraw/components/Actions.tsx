import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "radix-ui";

import {
  CLASSES,
  KEYS,
  capitalizeString,
  isTransparent,
} from "@excalidraw/common";

import {
  shouldAllowVerticalAlign,
  suppportsHorizontalAlign,
  hasBoundTextElement,
  isElbowArrow,
  isImageElement,
  isLinearElement,
  isTextElement,
  isArrowElement,
  isBindableElement,
  supportsBindableElementAnchorPoints,
  hasStrokeColor,
  toolIsArrow,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawElementType,
  NonDeletedElementsMap,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { actionToggleZenMode } from "../actions";

import { alignActionsPredicate } from "../actions/actionAlign";
import { trackEvent } from "../analytics";
import { useTunnels } from "../context/tunnels";

import { t } from "../i18n";
import {
  canChangeRoundness,
  canHaveArrowheads,
  getTargetElements,
  hasBackground,
  hasStrokeStyle,
  hasStrokeWidth,
} from "../scene";

import { getFormValue } from "../actions/actionProperties";

import { useTextEditorFocus } from "../hooks/useTextEditorFocus";

import { actionToggleViewMode } from "../actions/actionToggleViewMode";

import { getToolbarTools } from "./shapes";

import "./Actions.scss";

import {
  useEditorInterface,
  useStylesPanelMode,
  useExcalidrawContainer,
} from "./App";
import Stack from "./Stack";
import { ToolButton } from "./ToolButton";
import { ToolPopover } from "./ToolPopover";
import { Tooltip } from "./Tooltip";
import DropdownMenu from "./dropdownMenu/DropdownMenu";
import { PropertiesPopover } from "./PropertiesPopover";
import {
  EmbedIcon,
  extraToolsIcon,
  frameToolIcon,
  mermaidLogoIcon,
  laserPointerToolIcon,
  MagicIcon,
  LassoIcon,
  sharpArrowIcon,
  roundArrowIcon,
  elbowArrowIcon,
  TextSizeIcon,
  adjustmentsIcon,
  DotsHorizontalIcon,
  SelectionIcon,
  pencilIcon,
} from "./icons";

import { Island } from "./Island";

import type {
  AppClassProperties,
  AppProps,
  UIAppState,
  Zoom,
  AppState,
} from "../types";
import type { ActionManager } from "../actions/manager";

// Common CSS class combinations
const PROPERTIES_CLASSES = clsx([
  CLASSES.SHAPE_ACTIONS_THEME_SCOPE,
  "properties-content",
]);

export const canChangeStrokeColor = (
  appState: UIAppState,
  targetElements: ExcalidrawElement[],
) => {
  let commonSelectedType: ExcalidrawElementType | null =
    targetElements[0]?.type || null;

  for (const element of targetElements) {
    if (element.type !== commonSelectedType) {
      commonSelectedType = null;
      break;
    }
  }

  return (
    (hasStrokeColor(appState.activeTool.type) &&
      commonSelectedType !== "image" &&
      commonSelectedType !== "frame" &&
      commonSelectedType !== "magicframe") ||
    targetElements.some((element) => hasStrokeColor(element.type))
  );
};

export const canChangeBackgroundColor = (
  appState: UIAppState,
  targetElements: ExcalidrawElement[],
) => {
  return (
    hasBackground(appState.activeTool.type) ||
    targetElements.some((element) => hasBackground(element.type))
  );
};

type PropertiesSectionTab =
  | "input"
  | "output"
  | "anchors"
  | "data"
  | "placeholder"
  | "properties";

let lastSelectedShapeActionsDataTab: PropertiesSectionTab = "data";

type ComponentAnchorMetadata = {
  id?: string | null;
  uuid?: string | null;
  node_id?: string | null;
  position?: {
    x: number;
    y: number;
  } | null;
  data?: {
    name?: string | null;
    name_cn?: string | null;
    interface_type?: string | null;
    connection_type?: string | null;
    material_type?: string | null;
    is_connected?: boolean;
    is_visible?: boolean;
    allow_not_display?: boolean;
    [key: string]: unknown;
  } | null;
};

type ComponentMetadata = {
  id?: string | null;
  uuid?: string | null;
  data?: {
    name?: string | null;
    name_cn?: string | null;
    component_type?: string | null;
    anchors?: ComponentAnchorMetadata[] | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

type FlattenedDataEntry = {
  key: string;
  label: string;
  value: string;
};

type ShapeActionsInspectorItem = {
  id: string;
  title: string;
  description: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const getSelectedElementWithComponent = (
  targetElements: ExcalidrawElement[],
): {
  element: ExcalidrawElement;
  component: ComponentMetadata;
} | null => {
  if (targetElements.length !== 1) {
    return null;
  }

  const element = targetElements[0];
  const component = element.customData?.component;

  if (!isRecord(component)) {
    return null;
  }

  return {
    element,
    component: component as ComponentMetadata,
  };
};

const getComponentAnchors = (
  targetElements: ExcalidrawElement[],
): ComponentAnchorMetadata[] => {
  const selectedElementWithComponent =
    getSelectedElementWithComponent(targetElements);

  if (!selectedElementWithComponent) {
    return [];
  }

  const anchors = selectedElementWithComponent.component.data?.anchors;

  if (!Array.isArray(anchors)) {
    return [];
  }

  return anchors.filter(isRecord) as ComponentAnchorMetadata[];
};

const getClosestAnchorIndexForFixedPoint = (
  anchors: ComponentAnchorMetadata[],
  fixedPoint: readonly [number, number],
) => {
  let closestIndex: number | null = null;
  let closestDistanceSq = Infinity;

  anchors.forEach((anchor, index) => {
    const x = anchor.position?.x;
    const y = anchor.position?.y;

    if (typeof x !== "number" || typeof y !== "number") {
      return;
    }

    const dx = x - fixedPoint[0];
    const dy = y - fixedPoint[1];
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      closestIndex = index;
    }
  });

  return closestIndex;
};

const getAnchorFocusFromArrowEndpointSelection = ({
  targetElements,
  appState,
  elementsMap,
}: {
  targetElements: ExcalidrawElement[];
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
}) => {
  if (targetElements.length !== 1 || !isArrowElement(targetElements[0])) {
    return null;
  }

  const arrow = targetElements[0];
  const selectedPointsIndices = appState.selectedLinearElement?.selectedPointsIndices;

  if (!selectedPointsIndices || selectedPointsIndices.length === 0) {
    return null;
  }

  const endpointBindings: Array<{
    elementId: string;
    fixedPoint: readonly [number, number];
  }> = [];

  if (
    selectedPointsIndices.includes(0) &&
    arrow.startBinding &&
    Array.isArray(arrow.startBinding.fixedPoint)
  ) {
    endpointBindings.push({
      elementId: arrow.startBinding.elementId,
      fixedPoint: arrow.startBinding.fixedPoint as readonly [number, number],
    });
  }

  const lastPointIndex = arrow.points.length - 1;
  if (
    selectedPointsIndices.includes(lastPointIndex) &&
    arrow.endBinding &&
    Array.isArray(arrow.endBinding.fixedPoint)
  ) {
    endpointBindings.push({
      elementId: arrow.endBinding.elementId,
      fixedPoint: arrow.endBinding.fixedPoint as readonly [number, number],
    });
  }

  for (const endpointBinding of endpointBindings) {
    const boundElement = elementsMap.get(endpointBinding.elementId);
    if (!boundElement || boundElement.isDeleted) {
      continue;
    }

    const component = boundElement.customData?.component;
    if (!isRecord(component)) {
      continue;
    }

    const componentData = isRecord(component.data) ? component.data : null;
    const anchorsRaw = componentData?.anchors;
    if (!Array.isArray(anchorsRaw)) {
      continue;
    }

    const anchors = anchorsRaw.filter(isRecord) as ComponentAnchorMetadata[];
    if (anchors.length === 0) {
      continue;
    }

    const anchorIndex = getClosestAnchorIndexForFixedPoint(
      anchors,
      endpointBinding.fixedPoint,
    );
    if (anchorIndex === null) {
      continue;
    }

    return {
      elementId: boundElement.id,
      anchorIndex,
    };
  }

  return null;
};

const getAnchorFocusSelection = ({
  targetElements,
  appState,
  elementsMap,
  componentAnchors,
}: {
  targetElements: ExcalidrawElement[];
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  componentAnchors: ComponentAnchorMetadata[];
}) => {
  const selectedElementWithComponent =
    getSelectedElementWithComponent(targetElements);

  if (
    selectedElementWithComponent &&
    typeof appState.selectedAnchorPointIndex === "number" &&
    appState.selectedAnchorPointIndex >= 0 &&
    appState.selectedAnchorPointIndex < componentAnchors.length
  ) {
    return {
      elementId: selectedElementWithComponent.element.id,
      anchorIndex: appState.selectedAnchorPointIndex,
    };
  }

  return getAnchorFocusFromArrowEndpointSelection({
    targetElements,
    appState,
    elementsMap,
  });
};

const getAnchorConnectionType = (anchor: ComponentAnchorMetadata) =>
  getFirstNonEmptyString(anchor.data?.connection_type)?.toLowerCase() || null;

const getAnchorTitle = (anchor: ComponentAnchorMetadata) =>
  getFirstNonEmptyString(
    anchor.data?.name,
    anchor.data?.name_cn,
    anchor.id,
    anchor.uuid,
  ) || t("labels.propertiesTabs.unnamedAnchor");

const getAnchorDescription = (anchor: ComponentAnchorMetadata) =>
  [
    getFirstNonEmptyString(anchor.data?.interface_type),
    getFirstNonEmptyString(anchor.data?.material_type),
    getFirstNonEmptyString(anchor.data?.connection_type),
  ].filter((value): value is string => !!value);

const toInspectorItems = (anchors: ComponentAnchorMetadata[]) =>
  anchors.map((anchor, index) => ({
    id: anchor.id || anchor.uuid || `${index}`,
    title: getAnchorTitle(anchor),
    description: getAnchorDescription(anchor),
  }));

const formatDataValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return null;
};

const toFlattenedDataEntries = (
  value: unknown,
  prefix?: string,
): FlattenedDataEntry[] => {
  if (Array.isArray(value)) {
    const serialized = value
      .map((item) => formatDataValue(item) || JSON.stringify(item))
      .filter((item): item is string => !!item)
      .join(", ");

    return prefix && serialized
      ? [{ key: prefix, label: prefix, value: serialized }]
      : [];
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, nestedValue]) =>
      toFlattenedDataEntries(
        nestedValue,
        prefix ? `${prefix}.${key}` : key,
      ),
    );
  }

  const formattedValue = formatDataValue(value);

  return prefix && formattedValue
    ? [{ key: prefix, label: prefix, value: formattedValue }]
    : [];
};

const getSelectedElementDataEntries = (
  targetElements: ExcalidrawElement[],
): FlattenedDataEntry[] => {
  if (targetElements.length !== 1) {
    return [];
  }

  const customData = targetElements[0].customData;

  if (!isRecord(customData)) {
    return [];
  }

  return Object.entries(customData).flatMap(([key, value]) => {
    if (key === "component" || key === "anchorPoints") {
      return [];
    }

    return toFlattenedDataEntries(value, isRecord(value) ? undefined : key);
  });
};

const ShapeActionsInspectorPanel = ({
  items,
  emptyMessage,
}: {
  items: ShapeActionsInspectorItem[];
  emptyMessage: string;
}) => {
  if (items.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">{emptyMessage}</div>
    );
  }

  return (
    <div className="selected-shape-actions-inspector">
      {items.map((item) => (
        <div
          className="selected-shape-actions-card"
          key={item.id}
        >
          <div className="selected-shape-actions-card__title">{item.title}</div>
          {item.description.length > 0 && (
            <div className="selected-shape-actions-card__meta">
              {item.description.join(" · ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const ShapeActionsDataPanel = ({
  componentName,
  dataEntries,
}: {
  componentName: string | null;
  dataEntries: FlattenedDataEntry[];
}) => {
  if (!componentName && dataEntries.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">
        {t("labels.propertiesTabs.emptyData")}
      </div>
    );
  }

  return (
    <div className="selected-shape-actions-data">
      {componentName && (
        <div className="selected-shape-actions-card">
          <div className="selected-shape-actions-card__title">
            {componentName}
          </div>
        </div>
      )}
      {dataEntries.length > 0 && (
        <dl className="selected-shape-actions-data-list">
          {dataEntries.map((entry) => (
            <div
              className="selected-shape-actions-data-row"
              key={entry.key}
            >
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

const SelectedShapeActionsPropertiesPanel = ({
  appState,
  elementsMap,
  renderAction,
  app,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
}) => {
  const targetElements = getTargetElements(elementsMap, appState);

  let isSingleElementBoundContainer = false;
  if (
    targetElements.length === 2 &&
    (hasBoundTextElement(targetElements[0]) ||
      hasBoundTextElement(targetElements[1]))
  ) {
    isSingleElementBoundContainer = true;
  }
  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );
  const editorInterface = useEditorInterface();
  const isRTL = document.documentElement.getAttribute("dir") === "rtl";

  const showFillIcons =
    (hasBackground(appState.activeTool.type) &&
      !isTransparent(appState.currentItemBackgroundColor)) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );

  const showLinkIcon =
    targetElements.length === 1 || isSingleElementBoundContainer;

  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  const showCropEditorAction =
    !appState.croppingElementId &&
    targetElements.length === 1 &&
    isImageElement(targetElements[0]);

  const showAnchorEditorAction = targetElements.some(
    (element) =>
      isBindableElement(element) &&
      supportsBindableElementAnchorPoints(element),
  );

  const showAlignActions =
    !isSingleElementBoundContainer && alignActionsPredicate(appState, app);

  return (
    <div className="selected-shape-actions__stack">
      <div>
        {canChangeStrokeColor(appState, targetElements) &&
          renderAction("changeStrokeColor")}
      </div>
      {canChangeBackgroundColor(appState, targetElements) && (
        <div>{renderAction("changeBackgroundColor")}</div>
      )}
      {showFillIcons && renderAction("changeFillStyle")}

      {(hasStrokeWidth(appState.activeTool.type) ||
        targetElements.some((element) => hasStrokeWidth(element.type))) &&
        renderAction("changeStrokeWidth")}

      {(appState.activeTool.type === "freedraw" ||
        targetElements.some((element) => element.type === "freedraw")) &&
        renderAction("changeStrokeShape")}

      {(hasStrokeStyle(appState.activeTool.type) ||
        targetElements.some((element) => hasStrokeStyle(element.type))) && (
        <>
          {renderAction("changeStrokeStyle")}
          {renderAction("changeSloppiness")}
        </>
      )}

      {(canChangeRoundness(appState.activeTool.type) ||
        targetElements.some((element) => canChangeRoundness(element.type))) && (
        <>{renderAction("changeRoundness")}</>
      )}

      {(toolIsArrow(appState.activeTool.type) ||
        targetElements.some((element) => toolIsArrow(element.type))) && (
        <>{renderAction("changeArrowType")}</>
      )}

      {(appState.activeTool.type === "text" ||
        targetElements.some(isTextElement)) && (
        <>
          {renderAction("changeFontFamily")}
          {renderAction("changeFontSize")}
          {(appState.activeTool.type === "text" ||
            suppportsHorizontalAlign(targetElements, elementsMap)) &&
            renderAction("changeTextAlign")}
        </>
      )}

      {shouldAllowVerticalAlign(targetElements, elementsMap) &&
        renderAction("changeVerticalAlign")}
      {(canHaveArrowheads(appState.activeTool.type) ||
        targetElements.some((element) => canHaveArrowheads(element.type))) && (
        <>{renderAction("changeArrowhead")}</>
      )}

      {renderAction("changeOpacity")}

      <fieldset>
        <legend>{t("labels.layers")}</legend>
        <div className="buttonList">
          {renderAction("sendToBack")}
          {renderAction("sendBackward")}
          {renderAction("bringForward")}
          {renderAction("bringToFront")}
        </div>
      </fieldset>

      {showAlignActions && !isSingleElementBoundContainer && (
        <fieldset>
          <legend>{t("labels.align")}</legend>
          <div className="buttonList">
            {
              // swap this order for RTL so the button positions always match their action
              // (i.e. the leftmost button aligns left)
            }
            {isRTL ? (
              <>
                {renderAction("alignRight")}
                {renderAction("alignHorizontallyCentered")}
                {renderAction("alignLeft")}
              </>
            ) : (
              <>
                {renderAction("alignLeft")}
                {renderAction("alignHorizontallyCentered")}
                {renderAction("alignRight")}
              </>
            )}
            {targetElements.length > 2 &&
              renderAction("distributeHorizontally")}
            {/* breaks the row ˇˇ */}
            <div style={{ flexBasis: "100%", height: 0 }} />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: ".5rem",
                marginTop: "-0.5rem",
              }}
            >
              {renderAction("alignTop")}
              {renderAction("alignVerticallyCentered")}
              {renderAction("alignBottom")}
              {targetElements.length > 2 &&
                renderAction("distributeVertically")}
            </div>
          </div>
        </fieldset>
      )}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <fieldset>
          <legend>{t("labels.actions")}</legend>
          <div className="buttonList">
            {editorInterface.formFactor !== "phone" &&
              renderAction("duplicateSelection")}
            {editorInterface.formFactor !== "phone" &&
              renderAction("deleteSelectedElements")}
            {renderAction("group")}
            {renderAction("ungroup")}
            {showLinkIcon && renderAction("hyperlink")}
            {showCropEditorAction && renderAction("cropEditor")}
            {showLineEditorAction && renderAction("toggleLinearEditor")}
          </div>
        </fieldset>
      )}
      {showAnchorEditorAction && renderAction("toggleAnchorEditor")}
    </div>
  );
};

export const SelectedShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
  layout = "tabbed",
  footer = null,
  renderPanel,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
  layout?: "tabbed" | "properties-only" | "data-tabs";
  footer?: ReactNode;
  renderPanel?: (
    panel: PropertiesSectionTab,
    appState: UIAppState,
  ) => ReactNode | null;
}) => {
  const targetElements = getTargetElements(elementsMap, appState);
  const selectedElementWithComponent =
    getSelectedElementWithComponent(targetElements);
  const componentAnchors = getComponentAnchors(targetElements);
  const componentName =
    getFirstNonEmptyString(
      selectedElementWithComponent?.component.data?.name,
      selectedElementWithComponent?.component.data?.name_cn,
      selectedElementWithComponent?.component.data?.component_type,
      selectedElementWithComponent?.component.id,
      selectedElementWithComponent?.component.uuid,
    ) || null;
  const inputItems = toInspectorItems(
    componentAnchors.filter(
      (anchor) => getAnchorConnectionType(anchor) === "inlet",
    ),
  );
  const outputItems = toInspectorItems(
    componentAnchors.filter(
      (anchor) => getAnchorConnectionType(anchor) === "outlet",
    ),
  );
  const anchorItems = toInspectorItems(componentAnchors);
  const dataEntries = getSelectedElementDataEntries(targetElements);
  const tabsResetKey = `${appState.activeTool.type}:${targetElements
    .map((element) => element.id)
    .join(",")}`;
  const [activeTab, setActiveTab] =
    useState<PropertiesSectionTab>(
      layout === "data-tabs" ? lastSelectedShapeActionsDataTab : "properties",
    );
  const getRenderedPanel = (panel: PropertiesSectionTab) =>
    activeTab === panel ? renderPanel?.(panel, appState) : null;
  const anchorFocusSelection = getAnchorFocusSelection({
    targetElements,
    appState,
    elementsMap,
    componentAnchors,
  });
  const anchorFocusKey = anchorFocusSelection
    ? `${anchorFocusSelection.elementId}:${anchorFocusSelection.anchorIndex}`
    : null;
  const lastAutoAnchorsTabFocusKeyRef = useRef<string | null>(null);
  const tabs: Array<{
    value: PropertiesSectionTab;
    label: string;
  }> =
    layout === "data-tabs"
      ? [
          { value: "input", label: t("labels.propertiesTabs.input") },
          { value: "output", label: t("labels.propertiesTabs.output") },
          { value: "anchors", label: t("labels.propertiesTabs.anchors") },
          { value: "data", label: t("labels.propertiesTabs.data") },
          {
            value: "placeholder",
            label: t("labels.propertiesTabs.placeholder"),
          },
        ]
      : [
          { value: "input", label: t("labels.propertiesTabs.input") },
          { value: "output", label: t("labels.propertiesTabs.output") },
          { value: "anchors", label: t("labels.propertiesTabs.anchors") },
          { value: "data", label: t("labels.propertiesTabs.data") },
          { value: "properties", label: t("labels.propertiesTabs.properties") },
        ];

  useEffect(() => {
    setActiveTab((current) => {
      if (layout === "data-tabs") {
        return current === "properties" ? lastSelectedShapeActionsDataTab : current;
      }
      if (current !== "properties") {
        lastSelectedShapeActionsDataTab = current;
      }
      return "properties";
    });
  }, [layout]);

  useEffect(() => {
    if (layout === "data-tabs") {
      return;
    }
    setActiveTab("properties");
  }, [layout, tabsResetKey]);

  useEffect(() => {
    if (layout !== "data-tabs") {
      lastAutoAnchorsTabFocusKeyRef.current = null;
      return;
    }

    if (!anchorFocusKey) {
      lastAutoAnchorsTabFocusKeyRef.current = null;
      return;
    }

    if (lastAutoAnchorsTabFocusKeyRef.current === anchorFocusKey) {
      return;
    }

    lastAutoAnchorsTabFocusKeyRef.current = anchorFocusKey;
    setActiveTab("anchors");
    lastSelectedShapeActionsDataTab = "anchors";
  }, [anchorFocusKey, layout]);

  if (layout === "properties-only") {
    return (
      <div className="selected-shape-actions">
        <SelectedShapeActionsPropertiesPanel
          app={app}
          appState={appState}
          elementsMap={elementsMap}
          renderAction={renderAction}
        />
        {footer}
      </div>
    );
  }

  return (
    <div className="selected-shape-actions">
      <div
        aria-label={t("labels.propertiesTabs.label")}
        className="selected-shape-actions-tabs"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            aria-controls={`selected-shape-actions-panel-${tab.value}`}
            aria-selected={activeTab === tab.value}
            className="selected-shape-actions-tab"
            data-state={activeTab === tab.value ? "active" : "inactive"}
            id={`selected-shape-actions-tab-${tab.value}`}
            key={tab.value}
            onClick={() => {
              setActiveTab(tab.value);
              if (tab.value !== "properties") {
                lastSelectedShapeActionsDataTab = tab.value;
              }
            }}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby="selected-shape-actions-tab-input"
        className="selected-shape-actions-panel"
        data-state={activeTab === "input" ? "active" : "inactive"}
        hidden={activeTab !== "input"}
        id="selected-shape-actions-panel-input"
        role="tabpanel"
        tabIndex={0}
      >
        {getRenderedPanel("input") ?? (
          <ShapeActionsInspectorPanel
            emptyMessage={t("labels.propertiesTabs.emptyInput")}
            items={inputItems}
          />
        )}
      </div>
      <div
        aria-labelledby="selected-shape-actions-tab-output"
        className="selected-shape-actions-panel"
        data-state={activeTab === "output" ? "active" : "inactive"}
        hidden={activeTab !== "output"}
        id="selected-shape-actions-panel-output"
        role="tabpanel"
        tabIndex={0}
      >
        {getRenderedPanel("output") ?? (
          <ShapeActionsInspectorPanel
            emptyMessage={t("labels.propertiesTabs.emptyOutput")}
            items={outputItems}
          />
        )}
      </div>
      <div
        aria-labelledby="selected-shape-actions-tab-anchors"
        className="selected-shape-actions-panel"
        data-state={activeTab === "anchors" ? "active" : "inactive"}
        hidden={activeTab !== "anchors"}
        id="selected-shape-actions-panel-anchors"
        role="tabpanel"
        tabIndex={0}
      >
        {getRenderedPanel("anchors") ?? (
          <ShapeActionsInspectorPanel
            emptyMessage={t("labels.propertiesTabs.emptyAnchors")}
            items={anchorItems}
          />
        )}
      </div>
      <div
        aria-labelledby="selected-shape-actions-tab-data"
        className="selected-shape-actions-panel"
        data-state={activeTab === "data" ? "active" : "inactive"}
        hidden={activeTab !== "data"}
        id="selected-shape-actions-panel-data"
        role="tabpanel"
        tabIndex={0}
      >
        {getRenderedPanel("data") ?? (
          <ShapeActionsDataPanel
            componentName={componentName}
            dataEntries={dataEntries}
          />
        )}
      </div>
      <div
        aria-labelledby="selected-shape-actions-tab-placeholder"
        className="selected-shape-actions-panel"
        data-state={activeTab === "placeholder" ? "active" : "inactive"}
        data-testid="selected-shape-actions-placeholder-panel"
        hidden={activeTab !== "placeholder"}
        id="selected-shape-actions-panel-placeholder"
        role="tabpanel"
        tabIndex={0}
      >
        {getRenderedPanel("placeholder") ?? (
          <div className="selected-shape-actions-data-card">
            <div className="selected-shape-actions-placeholder">
              {t("labels.propertiesTabs.emptyPlaceholder")}
            </div>
          </div>
        )}
      </div>
      <div
        aria-labelledby="selected-shape-actions-tab-properties"
        className="selected-shape-actions-panel"
        data-state={activeTab === "properties" ? "active" : "inactive"}
        hidden={activeTab !== "properties"}
        id="selected-shape-actions-panel-properties"
        role="tabpanel"
        tabIndex={0}
      >
        {getRenderedPanel("properties") ?? (
          <SelectedShapeActionsPropertiesPanel
            app={app}
            appState={appState}
            elementsMap={elementsMap}
            renderAction={renderAction}
          />
        )}
      </div>
    </div>
  );
};

const CombinedShapeProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
}: {
  targetElements: ExcalidrawElement[];
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
}) => {
  const showFillIcons =
    (hasBackground(appState.activeTool.type) &&
      !isTransparent(appState.currentItemBackgroundColor)) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );

  const shouldShowCombinedProperties =
    targetElements.length > 0 ||
    (appState.activeTool.type !== "selection" &&
      appState.activeTool.type !== "eraser" &&
      appState.activeTool.type !== "hand" &&
      appState.activeTool.type !== "laser" &&
      appState.activeTool.type !== "lasso");
  const isOpen = appState.openPopup === "compactStrokeStyles";

  if (!shouldShowCombinedProperties) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactStrokeStyles" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.stroke")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              setAppState({
                openPopup: isOpen ? null : "compactStrokeStyles",
              });
            }}
          >
            {adjustmentsIcon}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{ maxWidth: "13rem" }}
            onClose={() => {}}
          >
            <div className="selected-shape-actions">
              {showFillIcons && renderAction("changeFillStyle")}
              {(hasStrokeWidth(appState.activeTool.type) ||
                targetElements.some((element) =>
                  hasStrokeWidth(element.type),
                )) &&
                renderAction("changeStrokeWidth")}
              {(hasStrokeStyle(appState.activeTool.type) ||
                targetElements.some((element) =>
                  hasStrokeStyle(element.type),
                )) && (
                <>
                  {renderAction("changeStrokeStyle")}
                  {renderAction("changeSloppiness")}
                </>
              )}
              {(canChangeRoundness(appState.activeTool.type) ||
                targetElements.some((element) =>
                  canChangeRoundness(element.type),
                )) &&
                renderAction("changeRoundness")}
              {renderAction("changeOpacity")}
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedArrowProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
  app,
}: {
  targetElements: ExcalidrawElement[];
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
  app: AppClassProperties;
}) => {
  const showShowArrowProperties =
    toolIsArrow(appState.activeTool.type) ||
    targetElements.some((element) => toolIsArrow(element.type));
  const isOpen = appState.openPopup === "compactArrowProperties";

  if (!showShowArrowProperties) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactArrowProperties" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.arrowtypes")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              setAppState({
                openPopup: isOpen ? null : "compactArrowProperties",
              });
            }}
          >
            {(() => {
              // Show an icon based on the current arrow type
              const arrowType = getFormValue(
                targetElements,
                app,
                (element) => {
                  if (isArrowElement(element)) {
                    return element.elbowed
                      ? "elbow"
                      : element.roundness
                      ? "round"
                      : "sharp";
                  }
                  return null;
                },
                (element) => isArrowElement(element),
                (hasSelection) =>
                  hasSelection ? null : appState.currentItemArrowType,
              );

              if (arrowType === "elbow") {
                return elbowArrowIcon;
              }
              if (arrowType === "round") {
                return roundArrowIcon;
              }
              return sharpArrowIcon;
            })()}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            container={container}
            className="properties-content"
            style={{ maxWidth: "13rem" }}
            onClose={() => {}}
          >
            {renderAction("changeArrowProperties")}
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedTextProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
  elementsMap,
}: {
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  targetElements: ExcalidrawElement[];
  container: HTMLDivElement | null;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
}) => {
  const { saveCaretPosition, restoreCaretPosition } = useTextEditorFocus();
  const isOpen = appState.openPopup === "compactTextProperties";

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            if (appState.editingTextElement) {
              saveCaretPosition();
            }
            setAppState({ openPopup: "compactTextProperties" });
          } else {
            setAppState({ openPopup: null });
            if (appState.editingTextElement) {
              restoreCaretPosition();
            }
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.textAlign")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (isOpen) {
                setAppState({ openPopup: null });
              } else {
                if (appState.editingTextElement) {
                  saveCaretPosition();
                }
                setAppState({ openPopup: "compactTextProperties" });
              }
            }}
          >
            {TextSizeIcon}
          </button>
        </Popover.Trigger>
        {appState.openPopup === "compactTextProperties" && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{ maxWidth: "13rem" }}
            // Improve focus handling for text editing scenarios
            preventAutoFocusOnTouch={!!appState.editingTextElement}
            onClose={() => {
              // Refocus text editor when popover closes with caret restoration
              if (appState.editingTextElement) {
                restoreCaretPosition();
              }
            }}
          >
            <div className="selected-shape-actions">
              {(appState.activeTool.type === "text" ||
                targetElements.some(isTextElement)) &&
                renderAction("changeFontSize")}
              {(appState.activeTool.type === "text" ||
                suppportsHorizontalAlign(targetElements, elementsMap)) &&
                renderAction("changeTextAlign")}
              {shouldAllowVerticalAlign(targetElements, elementsMap) &&
                renderAction("changeVerticalAlign")}
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedExtraActions = ({
  appState,
  renderAction,
  targetElements,
  setAppState,
  container,
  app,
  showDuplicate,
  showDelete,
}: {
  appState: UIAppState;
  targetElements: ExcalidrawElement[];
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
  app: AppClassProperties;
  showDuplicate?: boolean;
  showDelete?: boolean;
}) => {
  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );
  const showCropEditorAction =
    !appState.croppingElementId &&
    targetElements.length === 1 &&
    isImageElement(targetElements[0]);
  const showLinkIcon = targetElements.length === 1;
  const showAlignActions = alignActionsPredicate(appState, app);
  let isSingleElementBoundContainer = false;
  if (
    targetElements.length === 2 &&
    (hasBoundTextElement(targetElements[0]) ||
      hasBoundTextElement(targetElements[1]))
  ) {
    isSingleElementBoundContainer = true;
  }

  const isRTL = document.documentElement.getAttribute("dir") === "rtl";
  const isOpen = appState.openPopup === "compactOtherProperties";

  if (isEditingTextOrNewElement || targetElements.length === 0) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactOtherProperties" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.actions")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAppState({
                openPopup: isOpen ? null : "compactOtherProperties",
              });
            }}
          >
            {DotsHorizontalIcon}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{
              maxWidth: "12rem",
              justifyContent: "center",
              alignItems: "center",
            }}
            onClose={() => {}}
          >
            <div className="selected-shape-actions">
              <fieldset>
                <legend>{t("labels.layers")}</legend>
                <div className="buttonList">
                  {renderAction("sendToBack")}
                  {renderAction("sendBackward")}
                  {renderAction("bringForward")}
                  {renderAction("bringToFront")}
                </div>
              </fieldset>

              {showAlignActions && !isSingleElementBoundContainer && (
                <fieldset>
                  <legend>{t("labels.align")}</legend>
                  <div className="buttonList">
                    {isRTL ? (
                      <>
                        {renderAction("alignRight")}
                        {renderAction("alignHorizontallyCentered")}
                        {renderAction("alignLeft")}
                      </>
                    ) : (
                      <>
                        {renderAction("alignLeft")}
                        {renderAction("alignHorizontallyCentered")}
                        {renderAction("alignRight")}
                      </>
                    )}
                    {targetElements.length > 2 &&
                      renderAction("distributeHorizontally")}
                    {/* breaks the row ˇˇ */}
                    <div style={{ flexBasis: "100%", height: 0 }} />
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: ".5rem",
                        marginTop: "-0.5rem",
                      }}
                    >
                      {renderAction("alignTop")}
                      {renderAction("alignVerticallyCentered")}
                      {renderAction("alignBottom")}
                      {targetElements.length > 2 &&
                        renderAction("distributeVertically")}
                    </div>
                  </div>
                </fieldset>
              )}
              <fieldset>
                <legend>{t("labels.actions")}</legend>
                <div className="buttonList">
                  {renderAction("group")}
                  {renderAction("ungroup")}
                  {showLinkIcon && renderAction("hyperlink")}
                  {showCropEditorAction && renderAction("cropEditor")}
                  {showDuplicate && renderAction("duplicateSelection")}
                  {showDelete && renderAction("deleteSelectedElements")}
                </div>
              </fieldset>
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const LinearEditorAction = ({
  appState,
  renderAction,
  targetElements,
}: {
  appState: UIAppState;
  targetElements: ExcalidrawElement[];
  renderAction: ActionManager["renderAction"];
}) => {
  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  if (!showLineEditorAction) {
    return null;
  }

  return (
    <div className="compact-action-item">
      {renderAction("toggleLinearEditor")}
    </div>
  );
};

export const CompactShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
  setAppState,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const targetElements = getTargetElements(elementsMap, appState);
  const { container } = useExcalidrawContainer();

  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );

  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  return (
    <div className="compact-shape-actions">
      {/* Stroke Color */}
      {canChangeStrokeColor(appState, targetElements) && (
        <div className={clsx("compact-action-item")}>
          {renderAction("changeStrokeColor")}
        </div>
      )}

      {/* Background Color */}
      {canChangeBackgroundColor(appState, targetElements) && (
        <div className="compact-action-item">
          {renderAction("changeBackgroundColor")}
        </div>
      )}

      <CombinedShapeProperties
        appState={appState}
        renderAction={renderAction}
        setAppState={setAppState}
        targetElements={targetElements}
        container={container}
      />

      <CombinedArrowProperties
        appState={appState}
        renderAction={renderAction}
        setAppState={setAppState}
        targetElements={targetElements}
        container={container}
        app={app}
      />
      {/* Linear Editor */}
      {showLineEditorAction && (
        <div className="compact-action-item">
          {renderAction("toggleLinearEditor")}
        </div>
      )}

      {/* Text Properties */}
      {(appState.activeTool.type === "text" ||
        targetElements.some(isTextElement)) && (
        <>
          <div className="compact-action-item">
            {renderAction("changeFontFamily")}
          </div>
          <CombinedTextProperties
            appState={appState}
            renderAction={renderAction}
            setAppState={setAppState}
            targetElements={targetElements}
            container={container}
            elementsMap={elementsMap}
          />
        </>
      )}

      {/* Dedicated Copy Button */}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <div className="compact-action-item">
          {renderAction("duplicateSelection")}
        </div>
      )}

      {/* Dedicated Delete Button */}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <div className="compact-action-item">
          {renderAction("deleteSelectedElements")}
        </div>
      )}

      <CombinedExtraActions
        appState={appState}
        renderAction={renderAction}
        targetElements={targetElements}
        setAppState={setAppState}
        container={container}
        app={app}
      />
    </div>
  );
};

export const MobileShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
  setAppState,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const targetElements = getTargetElements(elementsMap, appState);
  const { container } = useExcalidrawContainer();
  const mobileActionsRef = useRef<HTMLDivElement>(null);

  const ACTIONS_WIDTH =
    mobileActionsRef.current?.getBoundingClientRect()?.width ?? 0;

  // 7 actions + 2 for undo/redo
  const MIN_ACTIONS = 9;

  const GAP = 6;
  const WIDTH = 32;

  const MIN_WIDTH = MIN_ACTIONS * WIDTH + (MIN_ACTIONS - 1) * GAP;

  const ADDITIONAL_WIDTH = WIDTH + GAP;

  const showDeleteOutside = ACTIONS_WIDTH >= MIN_WIDTH + ADDITIONAL_WIDTH;
  const showDuplicateOutside =
    ACTIONS_WIDTH >= MIN_WIDTH + 2 * ADDITIONAL_WIDTH;

  return (
    <Island
      className="compact-shape-actions mobile-shape-actions"
      style={{
        flexDirection: "row",
        boxShadow: "none",
        padding: 0,
        zIndex: 2,
        backgroundColor: "transparent",
        height: WIDTH * 1.35,
        marginBottom: 4,
        alignItems: "center",
        gap: GAP,
        pointerEvents: "none",
      }}
      ref={mobileActionsRef}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: GAP,
          flex: 1,
        }}
      >
        {canChangeStrokeColor(appState, targetElements) && (
          <div className={clsx("compact-action-item")}>
            {renderAction("changeStrokeColor")}
          </div>
        )}
        {canChangeBackgroundColor(appState, targetElements) && (
          <div className="compact-action-item">
            {renderAction("changeBackgroundColor")}
          </div>
        )}
        <CombinedShapeProperties
          appState={appState}
          renderAction={renderAction}
          setAppState={setAppState}
          targetElements={targetElements}
          container={container}
        />
        {/* Combined Arrow Properties */}
        <CombinedArrowProperties
          appState={appState}
          renderAction={renderAction}
          setAppState={setAppState}
          targetElements={targetElements}
          container={container}
          app={app}
        />
        {/* Linear Editor */}
        <LinearEditorAction
          appState={appState}
          renderAction={renderAction}
          targetElements={targetElements}
        />
        {/* Text Properties */}
        {(appState.activeTool.type === "text" ||
          targetElements.some(isTextElement)) && (
          <>
            <div className="compact-action-item">
              {renderAction("changeFontFamily")}
            </div>
            <CombinedTextProperties
              appState={appState}
              renderAction={renderAction}
              setAppState={setAppState}
              targetElements={targetElements}
              container={container}
              elementsMap={elementsMap}
            />
          </>
        )}

        {/* Combined Other Actions */}
        <CombinedExtraActions
          appState={appState}
          renderAction={renderAction}
          targetElements={targetElements}
          setAppState={setAppState}
          container={container}
          app={app}
          showDuplicate={!showDuplicateOutside}
          showDelete={!showDeleteOutside}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: GAP,
        }}
      >
        <div className="compact-action-item">{renderAction("undo")}</div>
        <div className="compact-action-item">{renderAction("redo")}</div>
        {showDuplicateOutside && (
          <div className="compact-action-item">
            {renderAction("duplicateSelection")}
          </div>
        )}
        {showDeleteOutside && (
          <div className="compact-action-item">
            {renderAction("deleteSelectedElements")}
          </div>
        )}
      </div>
    </Island>
  );
};

export const ShapesSwitcher = ({
  activeTool,
  setAppState,
  app,
  UIOptions,
}: {
  activeTool: UIAppState["activeTool"];
  setAppState: React.Component<any, AppState>["setState"];
  app: AppClassProperties;
  UIOptions: AppProps["UIOptions"];
}) => {
  const [isExtraToolsMenuOpen, setIsExtraToolsMenuOpen] = useState(false);
  const stylesPanelMode = useStylesPanelMode();
  const isFullStylesPanel = stylesPanelMode === "full";
  const isCompactStylesPanel = stylesPanelMode === "compact";

  const SELECTION_TOOLS = [
    {
      type: "selection",
      icon: SelectionIcon,
      title: capitalizeString(t("toolBar.selection")),
    },
    {
      type: "lasso",
      icon: LassoIcon,
      title: capitalizeString(t("toolBar.lasso")),
    },
  ] as const;

  const frameToolSelected = activeTool.type === "frame";
  const laserToolSelected = activeTool.type === "laser";
  const lassoToolSelected =
    isFullStylesPanel &&
    activeTool.type === "lasso" &&
    app.state.preferredSelectionTool.type !== "lasso";

  const embeddableToolSelected = activeTool.type === "embeddable";

  const { TTDDialogTriggerTunnel } = useTunnels();

  return (
    <>
      {getToolbarTools(app).map(
        ({ value, icon, key, numericKey, fillable, toolbar }) => {
          if (
            toolbar === false ||
            UIOptions.tools?.[
              value as Extract<
                typeof value,
                keyof AppProps["UIOptions"]["tools"]
              >
            ] === false
          ) {
            return null;
          }

          const label = t(`toolBar.${value}`);
          const letter =
            key && capitalizeString(typeof key === "string" ? key : key[0]);
          const shortcut = letter
            ? `${letter} ${t("helpDialog.or")} ${numericKey}`
            : `${numericKey}`;
          const keybindingLabel =
            value === "hand" ? undefined : numericKey || letter;

          // when in compact styles panel mode (tablet)
          // use a ToolPopover for selection/lasso toggle as well
          if (
            (value === "selection" || value === "lasso") &&
            isCompactStylesPanel
          ) {
            return (
              <ToolPopover
                key={"selection-popover"}
                app={app}
                options={SELECTION_TOOLS}
                activeTool={activeTool}
                defaultOption={app.state.preferredSelectionTool.type}
                namePrefix="selectionType"
                title={capitalizeString(t("toolBar.selection"))}
                data-testid="toolbar-selection"
                onToolChange={(type: string) => {
                  if (type === "selection" || type === "lasso") {
                    app.setActiveTool({ type });
                    setAppState({
                      preferredSelectionTool: { type, initialized: true },
                    });
                  }
                }}
                displayedOption={
                  SELECTION_TOOLS.find(
                    (tool) =>
                      tool.type === app.state.preferredSelectionTool.type,
                  ) || SELECTION_TOOLS[0]
                }
                fillable={activeTool.type === "selection"}
              />
            );
          }

          return (
            <ToolButton
              className={clsx("Shape", { fillable })}
              key={value}
              type="radio"
              icon={icon}
              checked={activeTool.type === value}
              name="editor-current-shape"
              title={`${capitalizeString(label)} — ${shortcut}`}
              keyBindingLabel={keybindingLabel}
              aria-label={capitalizeString(label)}
              aria-keyshortcuts={shortcut}
              data-testid={`toolbar-${value}`}
              onPointerDown={({ pointerType }) => {
                if (!app.state.penDetected && pointerType === "pen") {
                  app.togglePenMode(true);
                }

                if (value === "selection") {
                  if (app.state.activeTool.type === "selection") {
                    app.setActiveTool({ type: "lasso" });
                  } else {
                    app.setActiveTool({ type: "selection" });
                  }
                }
              }}
              onChange={({ pointerType }) => {
                if (app.state.activeTool.type !== value) {
                  trackEvent("toolbar", value, "ui");
                }
                if (value === "image") {
                  app.setActiveTool({
                    type: value,
                  });
                } else {
                  app.setActiveTool({ type: value });
                }
              }}
            />
          );
        },
      )}
      <div className="App-toolbar__divider" />

      <DropdownMenu open={isExtraToolsMenuOpen}>
        <DropdownMenu.Trigger
          className={clsx("App-toolbar__extra-tools-trigger", {
            "App-toolbar__extra-tools-trigger--selected":
              frameToolSelected ||
              embeddableToolSelected ||
              lassoToolSelected ||
              // in collab we're already highlighting the laser button
              // outside toolbar, so let's not highlight extra-tools button
              // on top of it
              (laserToolSelected && !app.props.isCollaborating),
          })}
          onToggle={() => {
            setIsExtraToolsMenuOpen(!isExtraToolsMenuOpen);
            setAppState({ openMenu: null, openPopup: null });
          }}
          title={t("toolBar.extraTools")}
        >
          {frameToolSelected
            ? frameToolIcon
            : embeddableToolSelected
            ? EmbedIcon
            : laserToolSelected && !app.props.isCollaborating
            ? laserPointerToolIcon
            : lassoToolSelected
            ? LassoIcon
            : extraToolsIcon}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          onClickOutside={() => setIsExtraToolsMenuOpen(false)}
          onSelect={() => setIsExtraToolsMenuOpen(false)}
          className="App-toolbar__extra-tools-dropdown"
        >
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "frame" })}
            icon={frameToolIcon}
            shortcut={KEYS.F.toLocaleUpperCase()}
            data-testid="toolbar-frame"
            selected={frameToolSelected}
          >
            {t("toolBar.frame")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "embeddable" })}
            icon={EmbedIcon}
            data-testid="toolbar-embeddable"
            selected={embeddableToolSelected}
          >
            {t("toolBar.embeddable")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "laser" })}
            icon={laserPointerToolIcon}
            data-testid="toolbar-laser"
            selected={laserToolSelected}
            shortcut={KEYS.K.toLocaleUpperCase()}
          >
            {t("toolBar.laser")}
          </DropdownMenu.Item>
          {isFullStylesPanel && (
            <DropdownMenu.Item
              onSelect={() => app.setActiveTool({ type: "lasso" })}
              icon={LassoIcon}
              data-testid="toolbar-lasso"
              selected={lassoToolSelected}
            >
              {t("toolBar.lasso")}
            </DropdownMenu.Item>
          )}
          <div style={{ margin: "6px 0", fontSize: 14, fontWeight: 600 }}>
            Generate
          </div>
          {app.props.aiEnabled !== false && <TTDDialogTriggerTunnel.Out />}
          <DropdownMenu.Item
            onSelect={() => app.setOpenDialog({ name: "ttd", tab: "mermaid" })}
            icon={mermaidLogoIcon}
            data-testid="toolbar-embeddable"
          >
            {t("toolBar.mermaidToExcalidraw")}
          </DropdownMenu.Item>
          {app.props.aiEnabled !== false && app.plugins.diagramToCode && (
            <DropdownMenu.Item
              onSelect={() => app.onMagicframeToolSelect()}
              icon={MagicIcon}
              data-testid="toolbar-magicframe"
              badge={<DropdownMenu.Item.Badge>AI</DropdownMenu.Item.Badge>}
            >
              {t("toolBar.magicframe")}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>
    </>
  );
};

export const ZoomActions = ({
  renderAction,
  zoom,
}: {
  renderAction: ActionManager["renderAction"];
  zoom: Zoom;
}) => (
  <Stack.Col gap={1} className={CLASSES.ZOOM_ACTIONS}>
    <Stack.Row align="center">
      {renderAction("zoomOut")}
      {renderAction("resetZoom")}
      {renderAction("zoomIn")}
    </Stack.Row>
  </Stack.Col>
);

export const UndoRedoActions = ({
  renderAction,
  className,
}: {
  renderAction: ActionManager["renderAction"];
  className?: string;
}) => (
  <div className={`undo-redo-buttons ${className}`}>
    <div className="undo-button-container">
      <Tooltip label={t("buttons.undo")}>{renderAction("undo")}</Tooltip>
    </div>
    <div className="redo-button-container">
      <Tooltip label={t("buttons.redo")}> {renderAction("redo")}</Tooltip>
    </div>
  </div>
);

export const ExitZenModeButton = ({
  actionManager,
  showExitZenModeBtn,
}: {
  actionManager: ActionManager;
  showExitZenModeBtn: boolean;
}) => (
  <button
    type="button"
    className={clsx("disable-zen-mode", {
      "disable-zen-mode--visible": showExitZenModeBtn,
    })}
    onClick={() => actionManager.executeAction(actionToggleZenMode)}
  >
    {t("buttons.exitZenMode")}
  </button>
);

export const ExitViewModeButton = ({
  actionManager,
}: {
  actionManager: ActionManager;
}) => (
  <button
    type="button"
    className="disable-view-mode"
    onClick={() => actionManager.executeAction(actionToggleViewMode)}
  >
    {pencilIcon}
  </button>
);
