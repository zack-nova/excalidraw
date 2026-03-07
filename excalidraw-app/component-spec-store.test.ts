import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  componentCurveCatalogAtom,
  componentSpecCatalogAtom,
  componentSpecManifestAtom,
  ensureComponentCurveDataLoadedAtom,
  ensureComponentSpecManifestLoadedAtom,
  ensureInterfaceSpecLoadedAtom,
  ensureComponentSpecLoadedAtom,
  getInterfaceMaterialTypeKey,
  interfaceSpecCatalogAtom,
} from "./component-spec-store";

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

describe("component spec store", () => {
  afterEach(() => {
    delete (globalThis as GlobalWithEngineeringBackend)
      .__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__;
    vi.restoreAllMocks();
  });

  it("loads component specs on demand and keeps curve data in a separate cache", async () => {
    const store = createStore();
    const fetchMock = vi.fn();
    (globalThis as GlobalWithEngineeringBackend).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__ =
      "http://127.0.0.1:8000";
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        items: [
          {
            componentType: "Boiler",
            inputCount: 30,
            outputCount: 2,
            curveParameterCount: 6,
          },
        ],
        offset: 0,
        limit: 500,
        total: 1,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        componentType: "Boiler",
        group: "燃料设备",
        icon: "/PNG/Boiler.png",
        operationMode: "design_mode",
        inputParameters: [
          {
            id: "boiler:eta",
            name: "Name",
            nameCn: "锅炉效率",
            source: "frontend_manual_input",
            valueType: "float",
            unit: "%",
            defaultValue: 90,
            group: "基本",
          },
          {
            id: "boiler:curve",
            name: "MainDPcv",
            source: "frontend_manual_input",
            valueType: "curve",
            unit: null,
            hasCurveData: true,
          },
        ],
        outputParameters: [
          {
            id: "boiler:output:q",
            name: "Q",
            nameCn: "锅炉热负荷",
            source: "backend_calculation",
            valueType: "float",
            unit: "MW",
            group: "基本",
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        componentType: "Boiler",
        curvesByParameterId: {
          "boiler:curve": {
            points: [
              [0, 1],
              [1, 2],
            ],
          },
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        materialType: "water",
        nameCn: "汽水",
        parameters: [
          {
            id: "water:p",
            name: "P",
            nameCn: "压力",
            tpisKey: "P",
            physicalEntityType: "anchor",
            valueType: "float",
            unit: "MPa",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await store.set(ensureComponentSpecManifestLoadedAtom);
    const manifest = store.get(componentSpecManifestAtom);

    expect(manifest).toContainEqual(
      expect.objectContaining({
        componentType: "Boiler",
        inputCount: 30,
        outputCount: 2,
      }),
    );

    expect(store.get(componentSpecCatalogAtom).specsByType.Boiler).toBeUndefined();
    expect(
      store.get(componentCurveCatalogAtom).curvesByType.Boiler,
    ).toBeUndefined();

    await store.set(ensureComponentSpecLoadedAtom, "Boiler");

    const specState = store.get(componentSpecCatalogAtom);
    const boilerSpec = specState.specsByType.Boiler;

    expect(specState.loadStatusByType.Boiler).toBe("ready");
    expect(boilerSpec).toEqual(
      expect.objectContaining({
        componentType: "Boiler",
      }),
    );
    expect(boilerSpec.inputParameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nameCn: "锅炉效率",
          source: "frontend_manual_input",
          unit: "%",
        }),
      ]),
    );
    expect(
      boilerSpec.inputParameters.some(
        (parameter) =>
          parameter.id === "boiler:eta" && parameter.hasCurveData === false,
      ),
    ).toBe(true);
    expect(
      boilerSpec.inputParameters.some(
        (parameter) =>
          parameter.name === "MainDPcv" && parameter.hasCurveData === true,
      ),
    ).toBe(true);
    expect(JSON.stringify(boilerSpec)).not.toContain("scale_fit_order");

    expect(
      store.get(componentCurveCatalogAtom).curvesByType.Boiler,
    ).toBeUndefined();

    await store.set(ensureComponentCurveDataLoadedAtom, "Boiler");

    const curveState = store.get(componentCurveCatalogAtom);

    expect(curveState.loadStatusByType.Boiler).toBe("ready");
    expect(curveState.curvesByType.Boiler).toEqual(
      expect.objectContaining({
        componentType: "Boiler",
        curvesByParameterId: expect.any(Object),
      }),
    );
    expect(
      Object.keys(curveState.curvesByType.Boiler.curvesByParameterId),
    ).not.toHaveLength(0);

    const materialTypeKey = getInterfaceMaterialTypeKey("water");

    expect(
      store.get(interfaceSpecCatalogAtom).specsByMaterialType[materialTypeKey],
    ).toBeUndefined();

    await store.set(ensureInterfaceSpecLoadedAtom, "water");

    const interfaceState = store.get(interfaceSpecCatalogAtom);

    expect(interfaceState.loadStatusByMaterialType[materialTypeKey]).toBe("ready");
    expect(interfaceState.specsByMaterialType[materialTypeKey]).toEqual(
      expect.objectContaining({
        materialType: "water",
      }),
    );
    expect(interfaceState.specsByMaterialType[materialTypeKey].parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nameCn: "压力",
          tpisKey: "P",
          physicalEntityType: "anchor",
        }),
      ]),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/api/v1/templates/components?offset=0&limit=500",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/v1/templates/components/Boiler",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:8000/api/v1/templates/components/Boiler/curves",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:8000/api/v1/templates/materials/water",
      expect.any(Object),
    );
  });

  it("loads minimal local mocks in test mode when backend url is not configured", async () => {
    const store = createStore();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await store.set(ensureComponentSpecManifestLoadedAtom);
    await store.set(ensureComponentSpecLoadedAtom, "Boiler");
    await store.set(ensureComponentCurveDataLoadedAtom, "Boiler");
    await store.set(ensureInterfaceSpecLoadedAtom, "water");

    const manifest = store.get(componentSpecManifestAtom);
    const specState = store.get(componentSpecCatalogAtom);
    const curveState = store.get(componentCurveCatalogAtom);
    const interfaceState = store.get(interfaceSpecCatalogAtom);
    const waterKey = getInterfaceMaterialTypeKey("water");

    expect(manifest).toContainEqual(
      expect.objectContaining({
        componentType: "Boiler",
      }),
    );
    expect(specState.loadStatusByType.Boiler).toBe("ready");
    expect(specState.specsByType.Boiler.componentType).toBe("Boiler");
    expect(curveState.loadStatusByType.Boiler).toBe("ready");
    expect(
      Object.keys(curveState.curvesByType.Boiler.curvesByParameterId).length,
    ).toBeGreaterThan(0);
    expect(interfaceState.loadStatusByMaterialType[waterKey]).toBe("ready");
    expect(interfaceState.specsByMaterialType[waterKey].materialType).toBe("water");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
