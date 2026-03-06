import { MIME_TYPES } from "@excalidraw/common";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getBindableElementAnchorPoints } from "@excalidraw/element";
import type { ExcalidrawBindableElement } from "@excalidraw/element/types";

import {
  buildLibraryItemsFromComponentSources,
  fetchComponentLibrarySourcesFromBackend,
} from "./componentLibrary";
import type { ComponentLibrarySource } from "./componentLibrary";

const PNG_BYTES = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
  156, 99, 248, 255, 255, 63, 0, 5, 254, 2, 254, 167, 141, 165, 88, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
]);

type GlobalWithEngineeringBackend = typeof globalThis & {
  __EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__?: string;
};

const mockJsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );

describe("buildLibraryItemsFromComponentSources()", () => {
  afterEach(() => {
    delete (globalThis as GlobalWithEngineeringBackend)
      .__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__;
    vi.restoreAllMocks();
  });

  it("fetches component library sources from backend endpoint", async () => {
    const fetchMock = vi.fn();
    (globalThis as GlobalWithEngineeringBackend).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__ =
      "http://127.0.0.1:8000";
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        items: [
          {
            componentType: "CoalSource",
            name: "CoalSource",
            nameCn: "煤/燃料",
            group: "燃料设备",
            icon: "/PNG/CoalSource.png",
            measured: { width: 40, height: 40 },
            anchors: [],
            isEngineeringComponent: true,
          },
        ],
        offset: 0,
        limit: 200,
        total: 1,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sources = await fetchComponentLibrarySourcesFromBackend();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/library/components?offset=0&limit=200",
      expect.any(Object),
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual(
      expect.objectContaining({
        sourceId: "engineering-backend",
        sourceName: "工程素材库",
      }),
    );
    expect(sources[0].items[0]).toEqual(
      expect.objectContaining({
        isEngineeringComponent: true,
        group: "燃料设备",
        data: expect.objectContaining({
          component_type: "CoalSource",
          name_cn: "煤/燃料",
        }),
      }),
    );
  });

  it("loads /PNG assets from backend base url when configured", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(PNG_BYTES, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as GlobalWithEngineeringBackend).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__ =
      "http://127.0.0.1:8000";

    const sources: ComponentLibrarySource[] = [
      {
        sourceId: "engineering-backend",
        sourceName: "工程素材库",
        sourceKind: "public",
        items: [
          {
            uuid: null,
            id: null,
            type: "component",
            position: null,
            measured: { width: 40, height: 40 },
            style: { width: "40px", height: "40px" },
            data: {
              image: "/PNG/CoalSource.png",
              component_type: "CoalSource",
              operation_mode: "design_mode",
              supported_operation_modes: ["design_mode"],
              name: "CoalSource",
              name_cn: "煤/燃料",
              anchors: [],
              tpis_extra_info: null,
            },
            icon: "/PNG/CoalSource.png",
            group: "燃料设备",
          },
        ],
      },
    ];

    const libraryItems = await buildLibraryItemsFromComponentSources(sources);

    expect(libraryItems).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/PNG/CoalSource.png",
    );
  });

  it("maps component source data into grouped image library items", async () => {
    const sources: ComponentLibrarySource[] = [
      {
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        items: [
          {
            uuid: null,
            id: null,
            type: "component",
            position: null,
            measured: { width: 40, height: 40 },
            style: { width: "40px", height: "40px" },
            data: {
              image: "/PNG/CoalSource.png",
              component_type: "CoalSource",
              operation_mode: "design_mode",
              supported_operation_modes: ["design_mode"],
              name: "CoalSource",
              name_cn: "煤/燃料",
              anchors: [],
              tpis_extra_info: null,
            },
            icon: "/PNG/CoalSource.png",
            group: "燃料设备",
          },
          {
            uuid: null,
            id: null,
            type: "component",
            position: null,
            measured: { width: 40, height: 40 },
            style: { width: "40px", height: "40px" },
            data: {
              image: "/PNG/WaterValve.png",
              component_type: "WaterValve",
              operation_mode: "design_mode",
              supported_operation_modes: ["design_mode", "interpolation_mode"],
              name: "WaterValve",
              name_cn: "节流阀",
              anchors: [],
              tpis_extra_info: null,
            },
            icon: "/PNG/WaterValve.png",
            group: "汽水连接件",
          },
        ],
      },
    ];

    const libraryItems = await buildLibraryItemsFromComponentSources(sources, {
      loadAsset: async (assetPath) =>
        new File([PNG_BYTES], assetPath.split("/").at(-1) || "component.png", {
          type: MIME_TYPES.png,
        }),
    });

    expect(libraryItems).toHaveLength(2);
    expect(libraryItems[0]).toEqual(
      expect.objectContaining({
        name: "煤/燃料",
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        sourceKind: "public",
        componentGroup: "燃料设备",
      }),
    );
    expect(libraryItems[1]).toEqual(
      expect.objectContaining({
        name: "节流阀",
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        sourceKind: "public",
        componentGroup: "汽水连接件",
      }),
    );

    const firstElement = libraryItems[0].elements[0];
    expect(firstElement.type).toBe("image");
    if (firstElement.type !== "image") {
      throw new Error("Expected an image element");
    }

    expect(firstElement).toEqual(
      expect.objectContaining({
        type: "image",
        width: 40,
        height: 40,
        fileId: expect.any(String),
        customData: expect.objectContaining({
          isEngineeringComponent: true,
          component: expect.objectContaining({
            group: "燃料设备",
            isEngineeringComponent: true,
            data: expect.objectContaining({
              component_type: "CoalSource",
            }),
          }),
        }),
      }),
    );
    expect(firstElement.customData?.anchorPoints).toBeUndefined();

    expect(libraryItems[0].files).toEqual(
      expect.objectContaining({
        [firstElement.fileId!]: expect.objectContaining({
          id: firstElement.fileId,
          mimeType: MIME_TYPES.png,
        }),
      }),
    );
  });

  it("maps component anchor positions to image anchor points", async () => {
    const sources: ComponentLibrarySource[] = [
      {
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        items: [
          {
            uuid: null,
            id: null,
            type: "component",
            position: null,
            measured: { width: 40, height: 40 },
            style: { width: "40px", height: "40px" },
            data: {
              image: "/PNG/WaterValve.png",
              component_type: "WaterValve",
              operation_mode: "design_mode",
              supported_operation_modes: ["design_mode", "interpolation_mode"],
              name: "WaterValve",
              name_cn: "节流阀",
              anchors: [
                {
                  uuid: null,
                  id: null,
                  node_id: null,
                  position: {
                    x: 0,
                    y: 0.75,
                  },
                  data: {
                    interface_type: "InSteam",
                    is_connected: false,
                    connection_type: "inlet",
                    material_type: "water",
                    is_visible: true,
                    allow_not_display: false,
                    name: "InSteam",
                    name_cn: "阀门入口",
                    tpis_extra_info: null,
                  },
                },
                {
                  uuid: null,
                  id: null,
                  node_id: null,
                  position: {
                    x: 1,
                    y: 0.75,
                  },
                  data: {
                    interface_type: "OutSteam",
                    is_connected: false,
                    connection_type: "outlet",
                    material_type: "water",
                    is_visible: true,
                    allow_not_display: false,
                    name: "OutSteam",
                    name_cn: "阀门出口",
                    tpis_extra_info: null,
                  },
                },
              ],
              tpis_extra_info: null,
            },
            icon: "/PNG/WaterValve.png",
            group: "汽水连接件",
          },
        ],
      },
    ];

    const libraryItems = await buildLibraryItemsFromComponentSources(sources, {
      loadAsset: async (assetPath) =>
        new File([PNG_BYTES], assetPath.split("/").at(-1) || "component.png", {
          type: MIME_TYPES.png,
        }),
    });

    const firstElement = libraryItems[0].elements[0];
    expect(firstElement.type).toBe("image");
    if (firstElement.type !== "image") {
      throw new Error("Expected an image element");
    }

    expect(
      getBindableElementAnchorPoints(
        firstElement as ExcalidrawBindableElement,
      ),
    ).toEqual([
      [0, 0.75],
      [1, 0.75],
    ]);
  });

  it("creates stable library item identities for the same component source", async () => {
    const sources: ComponentLibrarySource[] = [
      {
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        items: [
          {
            uuid: null,
            id: null,
            type: "component",
            position: null,
            measured: { width: 40, height: 40 },
            style: { width: "40px", height: "40px" },
            data: {
              image: "/PNG/CoalSource.png",
              component_type: "CoalSource",
              operation_mode: "design_mode",
              supported_operation_modes: ["design_mode"],
              name: "CoalSource",
              name_cn: "煤/燃料",
              anchors: [],
              tpis_extra_info: null,
            },
            icon: "/PNG/CoalSource.png",
            group: "燃料设备",
          },
        ],
      },
    ];

    const loadAsset = async (assetPath: string) =>
      new File([PNG_BYTES], assetPath.split("/").at(-1) || "component.png", {
        type: MIME_TYPES.png,
      });

    const [firstPass, secondPass] = await Promise.all([
      buildLibraryItemsFromComponentSources(sources, { loadAsset }),
      buildLibraryItemsFromComponentSources(sources, { loadAsset }),
    ]);

    const firstElement = firstPass[0].elements[0];
    const secondElement = secondPass[0].elements[0];

    expect(firstPass[0].id).toBe(secondPass[0].id);
    expect(firstElement.type).toBe("image");
    expect(secondElement.type).toBe("image");

    if (firstElement.type !== "image" || secondElement.type !== "image") {
      throw new Error("Expected image elements");
    }

    expect(firstElement.id).toBe(secondElement.id);
    expect(firstElement.versionNonce).toBe(secondElement.versionNonce);
    expect(firstElement.fileId).toBe(secondElement.fileId);
  });
});
