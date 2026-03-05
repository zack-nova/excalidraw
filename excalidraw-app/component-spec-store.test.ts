import { createStore } from "jotai";
import { describe, expect, it } from "vitest";

import {
  componentCurveCatalogAtom,
  componentSpecCatalogAtom,
  componentSpecManifestAtom,
  ensureComponentCurveDataLoadedAtom,
  ensureInterfaceSpecLoadedAtom,
  ensureComponentSpecLoadedAtom,
  getInterfaceMaterialTypeKey,
  interfaceSpecCatalogAtom,
} from "./component-spec-store";

describe("component spec store", () => {
  it("loads component specs on demand and keeps curve data in a separate cache", async () => {
    const store = createStore();
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
  });
});
