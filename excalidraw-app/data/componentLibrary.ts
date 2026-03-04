import { MIME_TYPES } from "@excalidraw/common";
import { newImageElement } from "@excalidraw/element";
import {
  generateIdFromFile,
  getDataURL,
  getMimeType,
} from "@excalidraw/excalidraw/data/blob";

import { mockEngineeringComponentLibraryItems } from "./componentLibraryMockItems";

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

const getStableHashNumber = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) || 1;
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

const loadComponentLibraryAsset = async (assetPath: string) => {
  const response = await fetch(assetPath);

  if (!response.ok) {
    throw new Error(`Failed to fetch component asset: ${assetPath}`);
  }

  const blob = await response.blob();
  const filename = assetPath.split("/").at(-1) || "component.png";

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

export const mockComponentLibrarySources: readonly ComponentLibrarySource[] = [
  {
    sourceId: "xjtu-library",
    sourceName: "西交大素材库",
    items: [...mockEngineeringComponentLibraryItems],
  },
];
