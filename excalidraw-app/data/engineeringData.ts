import {
  computeContainerDimensionForBoundText,
  computeBoundTextPosition,
  getContainerElement,
  isArrowElement,
  isTextElement,
  newElementWith,
  refreshTextDimensions,
} from "@excalidraw/element";

import type {
  ExcalidrawTextContainer,
  ExcalidrawTextElementWithContainer,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  ProjectDocument,
  RuntimeProjection,
  ValueProvider,
} from "../engineering-domain";
import { createEngineeringDataChannel } from "./engineering-data-channel";
import { createMockEngineeringDataFrame } from "./engineering-data-mock";
import { renderEngineeringTemplate } from "./engineering-data-template-render";

type EngineeringPrimitive = number | string | boolean | null | undefined;

export interface EngineeringData {
  id?: string | null;
  uuid?: string | null;
  alias?: string | null;
  name?: string | null;
  value?: EngineeringPrimitive;
  value_type?: string;
  unit?: string | null;
  timestamp?: number | null;
  enum_options?: string[] | null;
  source?: string;
  description?: string | null;
  tags?: Record<string, string> | null;
  tips?: string | null;
  group?: string | null;
  values?: number[] | null;
  time_span?: number | null;
  physical_entity_type?: string | null;
  physical_entity_id?: string | null;
  component_id?: string | null;
  anchor_id?: string | null;
  measurement?: string | null;
  point_name?: string | null;
  field?: string | null;
  name_cn?: string | null;
  tpis_key?: string | null;
  tpis_extra_info?: string | null;
  input_status?: string | null;
  require?: boolean | null;
  max_value?: number | null;
  min_value?: number | null;
  allow_not_display?: boolean | null;
  [key: string]: unknown;
}

export type EngineeringDataContext = {
  rows: EngineeringData[];
  data: Record<string, EngineeringData>;
  items: Record<string, EngineeringData>;
  values: Record<string, EngineeringPrimitive>;
  aliasToId: Record<string, string>;
};

const IDENTIFIER_START = /^[$_\p{L}]$/u;
const IDENTIFIER_PART = /^[$_\p{L}\p{N}]$/u;
const MOCK_QUERY_PARAM = "engineeringDataMock";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isIdentifierStart = (char: string) => IDENTIFIER_START.test(char);
const isIdentifierPart = (char: string) => IDENTIFIER_PART.test(char);

const isValidIdentifier = (value: string) => {
  if (!value) {
    return false;
  }
  const chars = Array.from(value);
  if (!isIdentifierStart(chars[0])) {
    return false;
  }
  return chars.slice(1).every(isIdentifierPart);
};

const normalizeAlias = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/[^\p{L}\p{N}_$]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    return null;
  }

  return /^\p{N}/u.test(normalized) ? `_${normalized}` : normalized;
};

const resolveEngineeringDataItemId = (item: EngineeringData) => {
  if (isNonEmptyString(item.id)) {
    return item.id.trim();
  }

  if (isNonEmptyString(item.uuid)) {
    return item.uuid.trim();
  }

  return null;
};

const collectAliases = (item: EngineeringData) => {
  const aliases = new Set<string>();
  const candidates = [item.alias];

  candidates.forEach((candidate) => {
    if (!isNonEmptyString(candidate)) {
      return;
    }
    if (isValidIdentifier(candidate)) {
      aliases.add(candidate);
    }
    const normalized = normalizeAlias(candidate);
    if (normalized) {
      aliases.add(normalized);
    }
  });

  return aliases;
};

export const createEngineeringDataContext = (
  data: EngineeringData | EngineeringData[],
): EngineeringDataContext => {
  const items = Array.isArray(data) ? data : [data];
  const aliasToId: Record<string, string> = {};
  const context: EngineeringDataContext = {
    rows: items.slice(),
    data: {},
    items: {},
    values: {},
    aliasToId,
  };

  items.forEach((item) => {
    const itemId = resolveEngineeringDataItemId(item);
    if (itemId) {
      context.data[itemId] = item;
    }

    collectAliases(item).forEach((alias) => {
      if (!itemId) {
        throw new Error(`Alias "${alias}" requires item id`);
      }

      const currentVariableId = aliasToId[alias];
      if (currentVariableId && currentVariableId !== itemId) {
        throw new Error(
          `Alias "${alias}" conflicts between "${currentVariableId}" and "${itemId}"`,
        );
      }

      aliasToId[alias] = itemId;
      context.items[alias] = item;
      context.values[alias] = item.value;
    });
  });

  return context;
};

const getProviderIdsForVariable = (
  project: ProjectDocument,
  variableId: string,
) => {
  const explicitProviderIds =
    project.variableCatalog.providerIdsByVariableId[variableId] ?? [];
  const fallbackProviderIds = Object.values(project.variableCatalog.providersById)
    .filter((provider) => provider.variableId === variableId)
    .map((provider) => provider.id);

  return explicitProviderIds.length > 0 ? explicitProviderIds : fallbackProviderIds;
};

const getProviderById = (
  project: ProjectDocument,
  providerId: string | undefined,
) => {
  if (!providerId) {
    return null;
  }

  return project.variableCatalog.providersById[providerId] ?? null;
};

const findProviderByKind = (
  project: ProjectDocument,
  variableId: string,
  providerKind: ValueProvider["kind"],
) =>
  getProviderIdsForVariable(project, variableId)
    .map((providerId) => project.variableCatalog.providersById[providerId])
    .find((provider) => provider?.kind === providerKind) || null;

const toDataRowGroup = (
  projectVariable: ProjectDocument["variableCatalog"]["variablesById"][string],
) => {
  if (typeof projectVariable.tags?.group === "string" && projectVariable.tags.group.trim()) {
    return projectVariable.tags.group.trim();
  }

  return projectVariable.role;
};

export const buildEngineeringDataRowsFromRuntimeProjection = ({
  project,
  runtimeProjection,
}: {
  project: ProjectDocument;
  runtimeProjection: RuntimeProjection;
}): EngineeringData[] =>
  Object.values(project.variableCatalog.variablesById)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((variable) => {
      const snapshot = runtimeProjection.effectiveValues[variable.id];
      const currentProvider =
        getProviderById(project, snapshot?.providerId) ||
        findProviderByKind(project, variable.id, "manual") ||
        findProviderByKind(project, variable.id, "sensor") ||
        findProviderByKind(project, variable.id, "backend") ||
        findProviderByKind(project, variable.id, "expression");
      const sensorProvider =
        currentProvider?.kind === "sensor"
          ? currentProvider
          : findProviderByKind(project, variable.id, "sensor");

      return {
        id: variable.id,
        alias: typeof variable.tags?.alias === "string" ? variable.tags.alias : null,
        name: variable.name,
        name_cn: variable.nameCn || null,
        value: snapshot?.value,
        source: snapshot?.source,
        timestamp: snapshot?.timestamp ?? null,
        status: snapshot?.status,
        unit: variable.displayUnit || variable.canonicalUnit || null,
        group: toDataRowGroup(variable),
        measurement: sensorProvider?.kind === "sensor" ? sensorProvider.measurement : null,
        point_name: sensorProvider?.kind === "sensor" ? sensorProvider.pointName : null,
        field: sensorProvider?.kind === "sensor" ? sensorProvider.field : null,
        physical_entity_type: variable.owner.kind,
        physical_entity_id: variable.owner.id,
        component_id: variable.owner.kind === "component" ? variable.owner.id : null,
        anchor_id: variable.owner.kind === "anchor" ? variable.owner.id : null,
        value_type: variable.valueType,
        tags: variable.tags ?? null,
        variable_id: variable.id,
        provider_id: snapshot?.providerId || null,
        role: variable.role,
        stage: variable.stage,
      };
    });

const getEngineeringTemplate = (
  element: OrderedExcalidrawElement,
): string | null => {
  if (!isTextElement(element)) {
    return null;
  }

  if (element.originalText.includes("{{")) {
    return element.originalText;
  }

  const storedTemplate = element.customData?.engineeringTemplate;
  const storedRenderedText = element.customData?.engineeringRenderedText;
  if (
    isNonEmptyString(storedTemplate) &&
    ((isNonEmptyString(storedRenderedText) &&
      storedRenderedText === element.originalText) ||
      (!isNonEmptyString(storedRenderedText) &&
        element.originalText === element.text))
  ) {
    return storedTemplate;
  }
  return null;
};

export const applyEngineeringDataToTextElements = (
  elements: readonly OrderedExcalidrawElement[],
  context: EngineeringDataContext,
  options?: {
    skipElementIds?: ReadonlySet<string>;
  },
) => {
  let didChange = false;
  const nextElements = elements.slice();
  const elementsMap = new Map(nextElements.map((element) => [element.id, element]));
  const elementIndexById = new Map(
    nextElements.map((element, index) => [element.id, index]),
  );

  nextElements.forEach((element, index) => {
    if (options?.skipElementIds?.has(element.id)) {
      return;
    }

    const template = getEngineeringTemplate(element);
    if (!template || !isTextElement(element)) {
      return;
    }

    const renderedText = renderEngineeringTemplate(template, context);
    const nextCustomData =
      element.customData?.engineeringTemplate === template &&
      element.customData?.engineeringRenderedText === renderedText
        ? element.customData
        : {
            ...element.customData,
            engineeringTemplate: template,
            engineeringRenderedText: renderedText,
          };

    let nextElement = newElementWith(element, {
      originalText: template,
      customData: nextCustomData,
    });

    let container = getContainerElement(nextElement, elementsMap);
    const dimensions = refreshTextDimensions(
      nextElement,
      container,
      elementsMap,
      renderedText,
    );

    if (dimensions) {
      nextElement = newElementWith(nextElement, dimensions);
    }

    if (container) {
      if (!isArrowElement(container)) {
        const targetContainerHeight = computeContainerDimensionForBoundText(
          nextElement.height,
          container.type,
        );

        if (container.height !== targetContainerHeight) {
          const nextContainer = newElementWith(container, {
            height: targetContainerHeight,
          }) as OrderedExcalidrawElement & ExcalidrawTextContainer;
          const containerIndex = elementIndexById.get(container.id);

          if (typeof containerIndex === "number") {
            nextElements[containerIndex] = nextContainer;
            elementsMap.set(nextContainer.id, nextContainer);
            container = nextContainer;
            didChange = true;
          }
        }
      }

      const textContainer = container as ExcalidrawTextContainer;
      nextElement = newElementWith(
        nextElement,
        computeBoundTextPosition(
          textContainer,
          nextElement as ExcalidrawTextElementWithContainer,
          elementsMap,
        ),
      );
    }

    if (nextElement !== element) {
      didChange = true;
      nextElements[index] = nextElement;
      elementsMap.set(nextElement.id, nextElement);
    }
  });

  return didChange ? nextElements : elements;
};

const engineeringDataChannel = createEngineeringDataChannel({
  createContext: createEngineeringDataContext,
  createMockFrame: createMockEngineeringDataFrame,
  mockQueryParam: MOCK_QUERY_PARAM,
});

export { createMockEngineeringDataFrame, renderEngineeringTemplate };

export const publishEngineeringData = engineeringDataChannel.publishExternalData;
export const publishEngineeringDomainData = engineeringDataChannel.publishDomainData;
export const subscribeEngineeringData = engineeringDataChannel.subscribe;
export const stopMockEngineeringDataFeed = engineeringDataChannel.stopMockFeed;
export const startMockEngineeringDataFeed = engineeringDataChannel.startMockFeed;
export const maybeStartEngineeringDataMockFromUrl =
  engineeringDataChannel.maybeStartMockFromUrl;
export const registerEngineeringDataDevTools =
  engineeringDataChannel.registerDevTools;
export const resetEngineeringDataChannelForTests = engineeringDataChannel.resetForTests;

declare global {
  interface Window {
    __EXCALIDRAW_ENGINEERING_DATA__?: {
      getSnapshot: () => EngineeringData[];
      publish: (data: EngineeringData | EngineeringData[]) => void;
      startMock: (intervalMs?: number) => () => void;
      stopMock: () => void;
    };
  }
}
