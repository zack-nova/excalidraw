import { MIME_TYPES } from "@excalidraw/common";
import { newImageElement } from "@excalidraw/element";
import {
  generateIdFromFile,
  getDataURL,
  getMimeType,
} from "@excalidraw/excalidraw/data/blob";
import {
  getConfiguredEngineeringBackendBaseUrl,
  requestEngineeringBackendJson,
} from "../engineering/engineering-backend-client";

import { createEngineeringTableMaterialLibraryItem } from "./engineeringTableMaterial";
import { createEngineeringChartMaterialLibraryItems } from "./engineeringChartMaterial";

import type {
  BinaryFileData,
  LibraryItem,
  LibraryItems,
} from "@excalidraw/excalidraw/types";

type ComponentAnchor = {
  uuid: string | null;
  id: string | null;
  node_id: string | null;
  position: {
    x: number;
    y: number;
  };
  data: {
    interface_type: string;
    is_connected: boolean;
    connection_type: string;
    material_type: string;
    is_visible: boolean;
    allow_not_display: boolean;
    name: string;
    name_cn: string;
    tpis_extra_info: unknown;
  };
};

export type ComponentListItem = {
  uuid: string | null;
  id: string | null;
  type: "component";
  isEngineeringComponent?: boolean;
  position: {
    x: number;
    y: number;
  } | null;
  measured: {
    width: number;
    height: number;
  } | null;
  style?: {
    width?: string;
    height?: string;
  } | null;
  data: {
    image?: string;
    component_type?: string;
    operation_mode?: string;
    supported_operation_modes?: string[];
    name?: string;
    name_cn?: string;
    anchors?: ComponentAnchor[];
    tpis_extra_info?: unknown;
  };
  icon?: string;
  group?: string;
};

export type ComponentLibrarySource = {
  sourceId: string;
  sourceName: string;
  sourceKind?: "personal" | "public";
  items: ComponentListItem[];
};

type BuildLibraryItemsOptions = {
  loadAsset?: (assetPath: string) => Promise<File>;
};

const DEFAULT_COMPONENT_WIDTH = 40;
const DEFAULT_COMPONENT_HEIGHT = 40;
const DEFAULT_GROUP = "Ungrouped";
const DEFAULT_SOURCE_ID = "engineering-backend";
const DEFAULT_SOURCE_NAME = "工程素材库";
const BACKEND_LIBRARY_PAGE_SIZE = 200;

type BackendLibraryAnchor = {
  id?: string | null;
  uuid?: string | null;
  nodeId?: string | null;
  position?: {
    x: number;
    y: number;
  } | null;
  interfaceType?: string | null;
  connectionType?: string | null;
  materialType?: string | null;
  name?: string | null;
  nameCn?: string | null;
  isVisible?: boolean | null;
};

type BackendLibraryComponentItem = {
  componentType: string;
  name?: string | null;
  nameCn?: string | null;
  group?: string | null;
  icon?: string | null;
  measured?: {
    width?: number;
    height?: number;
  } | null;
  anchors?: BackendLibraryAnchor[] | null;
  isEngineeringComponent?: boolean;
};

type BackendLibraryListResponse = {
  items?: BackendLibraryComponentItem[];
  offset?: number;
  limit?: number;
  total?: number;
};

const getStableHashNumber = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) || 1;
};

const toBackendAnchor = (anchor: BackendLibraryAnchor): ComponentAnchor => ({
  id: anchor.id ?? null,
  uuid: anchor.uuid ?? null,
  node_id: anchor.nodeId ?? null,
  position: anchor.position && typeof anchor.position === "object"
    ? {
        x: Number(anchor.position.x),
        y: Number(anchor.position.y),
      }
    : { x: 0.5, y: 0.5 },
  data: {
    interface_type: anchor.interfaceType || "",
    is_connected: false,
    connection_type: anchor.connectionType || "bidirectional",
    material_type: anchor.materialType || "",
    is_visible:
      typeof anchor.isVisible === "boolean" ? anchor.isVisible : true,
    allow_not_display: false,
    name: anchor.name || "",
    name_cn: anchor.nameCn || "",
    tpis_extra_info: null,
  },
});

const toBackendComponentLibraryItem = (
  item: BackendLibraryComponentItem,
): ComponentListItem => {
  const width = Number(item.measured?.width || DEFAULT_COMPONENT_WIDTH);
  const height = Number(item.measured?.height || DEFAULT_COMPONENT_HEIGHT);
  const icon = item.icon || "";
  const anchors = Array.isArray(item.anchors)
    ? item.anchors.map(toBackendAnchor)
    : [];

  return {
    uuid: null,
    id: null,
    type: "component",
    isEngineeringComponent: item.isEngineeringComponent !== false,
    position: null,
    measured: {
      width,
      height,
    },
    style: {
      width: `${width}px`,
      height: `${height}px`,
    },
    data: {
      image: icon,
      component_type: item.componentType,
      operation_mode: "design_mode",
      supported_operation_modes: ["design_mode", "interpolation_mode"],
      name: item.name || item.componentType,
      name_cn: item.nameCn || item.name || item.componentType,
      anchors,
      tpis_extra_info: null,
    },
    icon,
    group: item.group || DEFAULT_GROUP,
  };
};

const getComponentIdentityKey = (
  source: ComponentLibrarySource,
  component: ComponentListItem,
  index: number,
) =>
  [
    source.sourceId,
    component.group?.trim() || DEFAULT_GROUP,
    component.data.component_type ||
      component.data.name ||
      component.data.name_cn ||
      index,
  ].join(":");

const getComponentAssetPath = (component: ComponentListItem) =>
  component.icon || component.data.image || "";

const getComponentDisplayName = (component: ComponentListItem) =>
  component.data.name_cn ||
  component.data.name ||
  component.data.component_type ||
  "Unnamed component";

const getComponentDimensions = (component: ComponentListItem) => ({
  width: component.measured?.width || DEFAULT_COMPONENT_WIDTH,
  height: component.measured?.height || DEFAULT_COMPONENT_HEIGHT,
});

const getComponentAnchorPoints = (component: ComponentListItem) =>
  (component.data.anchors || []).flatMap((anchor) => {
    const x = anchor.position?.x;
    const y = anchor.position?.y;

    return (
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y)
    )
      ? ([[x, y]] as [number, number][])
      : [];
  });

const buildSearchKeywords = (
  component: ComponentListItem,
  source: ComponentLibrarySource,
) =>
  [
    source.sourceName,
    component.group,
    component.data.name_cn,
    component.data.name,
    component.data.component_type,
    ...(component.data.anchors || []).flatMap((anchor) => [
      anchor.data.name,
      anchor.data.name_cn,
      anchor.data.interface_type,
      anchor.data.material_type,
    ]),
  ].filter((value): value is string => !!value);

const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:|^\/\//;

const resolveComponentLibraryAssetUrl = (assetPath: string) => {
  const trimmedAssetPath = assetPath.trim();
  if (!trimmedAssetPath) {
    return trimmedAssetPath;
  }
  if (ABSOLUTE_URL_PATTERN.test(trimmedAssetPath)) {
    return trimmedAssetPath;
  }

  const baseUrl = getConfiguredEngineeringBackendBaseUrl();
  if (baseUrl && trimmedAssetPath.startsWith("/PNG/")) {
    return `${baseUrl}${trimmedAssetPath}`;
  }

  return trimmedAssetPath;
};

const loadComponentLibraryAsset = async (assetPath: string) => {
  const resolvedAssetUrl = resolveComponentLibraryAssetUrl(assetPath);
  const response = await fetch(resolvedAssetUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch component asset: ${resolvedAssetUrl}`);
  }

  const blob = await response.blob();
  const sanitizedAssetUrl = resolvedAssetUrl.split("?")[0].split("#")[0];
  const filename = sanitizedAssetUrl.split("/").at(-1) || "component.png";

  return new File([blob], filename, {
    type: blob.type || getMimeType(assetPath) || MIME_TYPES.binary,
  });
};

const getComponentFileMimeType = (
  assetFile: File,
): BinaryFileData["mimeType"] =>
  getMimeType(assetFile) as BinaryFileData["mimeType"];

export const buildLibraryItemsFromComponentSources = async (
  sources: readonly ComponentLibrarySource[],
  options: BuildLibraryItemsOptions = {},
): Promise<LibraryItems> => {
  const loadAsset = options.loadAsset || loadComponentLibraryAsset;

  const libraryItems = await Promise.all(
    sources.flatMap((source) =>
      source.items.map(async (component, index) => {
        const normalizedComponent = {
          ...component,
          isEngineeringComponent: component.isEngineeringComponent !== false,
        };
        const assetPath = getComponentAssetPath(component);
        const assetFile = await loadAsset(assetPath);
        const fileId = await generateIdFromFile(assetFile);
        const dataURL = await getDataURL(assetFile);
        const { width, height } = getComponentDimensions(component);
        const anchorPoints = getComponentAnchorPoints(component);
        const name = getComponentDisplayName(component);
        const groupName = component.group?.trim() || DEFAULT_GROUP;
        const identityKey = getComponentIdentityKey(source, component, index);
        const imageElement = {
          ...newImageElement({
            type: "image",
            x: 0,
            y: 0,
            width,
            height,
            status: "saved",
            fileId,
            customData: {
              isEngineeringComponent:
                normalizedComponent.isEngineeringComponent === true,
              component: normalizedComponent,
              ...(anchorPoints.length > 0 ? { anchorPoints } : {}),
            },
          }),
          id: `component-element:${encodeURIComponent(identityKey)}`,
          seed: getStableHashNumber(`${identityKey}:seed`),
          versionNonce: getStableHashNumber(`${identityKey}:versionNonce`),
        };

        const libraryItem: LibraryItem = {
          id: `component-library:${encodeURIComponent(identityKey)}`,
          status: "unpublished",
          created: Date.now(),
          name,
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          sourceKind: source.sourceKind || "public",
          componentGroup: groupName,
          searchKeywords: buildSearchKeywords(component, source),
          elements: [imageElement],
          files: {
            [fileId]: {
              id: fileId,
              mimeType: getComponentFileMimeType(assetFile),
              dataURL,
              created: Date.now(),
            },
          },
        };

        return libraryItem;
      }),
    ),
  );

  return libraryItems;
};

export const fetchComponentLibrarySourcesFromBackend = async () => {
  const baseUrl = getConfiguredEngineeringBackendBaseUrl();

  if (!baseUrl) {
    return [] as ComponentLibrarySource[];
  }

  const items: ComponentListItem[] = [];
  let offset = 0;
  let total = Number.MAX_SAFE_INTEGER;

  while (offset < total) {
    const response = await requestEngineeringBackendJson<BackendLibraryListResponse>(
      baseUrl,
      `/api/v1/library/components?offset=${offset}&limit=${BACKEND_LIBRARY_PAGE_SIZE}`,
    );

    const pageItems = Array.isArray(response.items) ? response.items : [];
    const mappedItems = pageItems
      .filter(
        (item): item is BackendLibraryComponentItem =>
          !!item &&
          typeof item === "object" &&
          typeof item.componentType === "string",
      )
      .map(toBackendComponentLibraryItem);

    items.push(...mappedItems);
    total =
      typeof response.total === "number" && Number.isFinite(response.total)
        ? response.total
        : items.length;

    if (mappedItems.length === 0) {
      break;
    }

    offset += mappedItems.length;
  }

  return [
    {
      sourceId: DEFAULT_SOURCE_ID,
      sourceName: DEFAULT_SOURCE_NAME,
      sourceKind: "public" as const,
      items,
    },
  ];
};

export const loadEngineeringLibraryItems = async () => {
  const tableMaterialLibraryItem = createEngineeringTableMaterialLibraryItem();
  const chartMaterialLibraryItems = createEngineeringChartMaterialLibraryItems();

  try {
    const sources = await fetchComponentLibrarySourcesFromBackend();
    const componentLibraryItems = await buildLibraryItemsFromComponentSources(
      sources,
    );
    return [
      tableMaterialLibraryItem,
      ...chartMaterialLibraryItems,
      ...componentLibraryItems,
    ];
  } catch (error) {
    // Keep app usable even if backend library endpoint is unavailable.
    return [tableMaterialLibraryItem, ...chartMaterialLibraryItems];
  }
};
