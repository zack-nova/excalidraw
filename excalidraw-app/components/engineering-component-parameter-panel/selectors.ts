import { getSelectedElements, isArrowElement } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import {
  parseEngineeringComponent,
  type ParsedEngineeringAnchor,
} from "../../engineering-component-data-utils";
import type {
  SelectedComponentContext,
  SelectedShapeVariableBinding,
} from "./types";

const getClosestAnchorIndexForFixedPoint = (
  anchors: ParsedEngineeringAnchor[],
  fixedPoint: readonly [number, number],
) => {
  let closestIndex: number | null = null;
  let closestDistanceSq = Infinity;

  anchors.forEach((anchor, index) => {
    if (!anchor.position) {
      return;
    }

    const dx = anchor.position.x - fixedPoint[0];
    const dy = anchor.position.y - fixedPoint[1];
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      closestIndex = index;
    }
  });

  return closestIndex;
};

const getSelectedComponentContextFromElement = (
  element: ExcalidrawElement,
  focusedAnchorIndex: number | null,
): SelectedComponentContext | null => {
  const parsedComponent = parseEngineeringComponent(element.customData?.component);
  if (!parsedComponent) {
    return null;
  }

  const normalizedFocusedAnchorIndex =
    typeof focusedAnchorIndex === "number" &&
    focusedAnchorIndex >= 0 &&
    focusedAnchorIndex < parsedComponent.anchors.length
      ? focusedAnchorIndex
      : null;

  return {
    elementId: element.id,
    componentType: parsedComponent.componentType,
    anchors: parsedComponent.anchors,
    focusedAnchorIndex: normalizedFocusedAnchorIndex,
  };
};

const getSelectedComponentContextFromArrowEndpoint = (
  selectedElement: ExcalidrawElement,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
): SelectedComponentContext | null => {
  if (!isArrowElement(selectedElement)) {
    return null;
  }

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
    selectedElement.startBinding &&
    Array.isArray(selectedElement.startBinding.fixedPoint)
  ) {
    endpointBindings.push({
      elementId: selectedElement.startBinding.elementId,
      fixedPoint: selectedElement.startBinding.fixedPoint as readonly [number, number],
    });
  }

  const lastPointIndex = selectedElement.points.length - 1;
  if (
    selectedPointsIndices.includes(lastPointIndex) &&
    selectedElement.endBinding &&
    Array.isArray(selectedElement.endBinding.fixedPoint)
  ) {
    endpointBindings.push({
      elementId: selectedElement.endBinding.elementId,
      fixedPoint: selectedElement.endBinding.fixedPoint as readonly [number, number],
    });
  }

  for (const endpointBinding of endpointBindings) {
    const boundElement = elements.find(
      (element) => element.id === endpointBinding.elementId,
    );
    if (!boundElement) {
      continue;
    }

    const boundContext = getSelectedComponentContextFromElement(boundElement, null);
    if (!boundContext || boundContext.anchors.length === 0) {
      continue;
    }

    const focusedAnchorIndex = getClosestAnchorIndexForFixedPoint(
      boundContext.anchors,
      endpointBinding.fixedPoint,
    );

    if (focusedAnchorIndex === null) {
      continue;
    }

    return {
      ...boundContext,
      focusedAnchorIndex,
    };
  }

  return null;
};

export const getSelectedComponentContext = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
): SelectedComponentContext | null => {
  const selectedElements = getSelectedElements(elements, appState, {
    includeBoundTextElement: false,
    includeElementsInFrames: false,
  });

  if (selectedElements.length !== 1) {
    return null;
  }

  const selectedElement = selectedElements[0];
  const directContext = getSelectedComponentContextFromElement(
    selectedElement,
    appState.selectedAnchorPointIndex,
  );

  if (directContext) {
    return directContext;
  }

  return getSelectedComponentContextFromArrowEndpoint(
    selectedElement,
    elements,
    appState,
  );
};

const normalizeVariableToken = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1).trim();
    return unquoted || null;
  }

  return trimmed;
};

const getTextTemplateFromElement = (element: ExcalidrawElement) => {
  if (element.type !== "text") {
    return null;
  }

  if (
    typeof element.originalText === "string" &&
    element.originalText.includes("{{")
  ) {
    return element.originalText;
  }

  const storedTemplate = element.customData?.engineeringTemplate;
  if (typeof storedTemplate === "string" && storedTemplate.includes("{{")) {
    return storedTemplate;
  }

  return null;
};

const extractVariableTokensFromExpression = (expression: string) => {
  const tokens = new Set<string>();

  for (const match of expression.matchAll(/data\[([^[\]]+?)\]/g)) {
    const token = normalizeVariableToken(match[1] || "");
    if (token) {
      tokens.add(token);
    }
  }

  for (const match of expression.matchAll(/ref\((["'])(.+?)\1\)/g)) {
    const token = normalizeVariableToken(match[2] || "");
    if (token) {
      tokens.add(token);
    }
  }

  return Array.from(tokens);
};

export const collectSelectedShapeVariableBindings = ({
  elements,
  appState,
  tableGroupId,
}: {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  tableGroupId: string | null;
}): SelectedShapeVariableBinding[] => {
  const selectedElements = getSelectedElements(elements, appState, {
    includeBoundTextElement: false,
    includeElementsInFrames: false,
  });

  const targetElements = tableGroupId
    ? elements.filter(
        (element) =>
          !element.isDeleted && element.groupIds.includes(tableGroupId),
      )
    : selectedElements;

  const bindings = new Map<string, SelectedShapeVariableBinding>();

  targetElements.forEach((element) => {
    const template = getTextTemplateFromElement(element);
    if (!template) {
      return;
    }

    for (const match of template.matchAll(/\{\{([\s\S]+?)\}\}/g)) {
      const expression = (match[1] || "").trim();
      if (!expression) {
        continue;
      }

      if (!bindings.has(expression)) {
        bindings.set(expression, {
          id: expression,
          expression,
          variableTokens: extractVariableTokensFromExpression(expression),
        });
      }
    }
  });

  return Array.from(bindings.values());
};
