import manifestJson from "./data/componentSpecsMock/manifest.json";

import { atom } from "./app-jotai";

export type ComponentSpecManifestEntry = {
  componentType: string;
  inputCount: number;
  outputCount: number;
  curveParameterCount: number;
  specPath: string;
  curvePath: string;
};

export type ComponentSpecParameter = {
  id: string | null;
  uuid: string | null;
  key: string | null;
  name: string | null;
  nameCn: string | null;
  source: string | null;
  valueType: string | null;
  unit: string | null;
  defaultValue: unknown;
  tips: string | null;
  enumOptions: unknown[] | null;
  physicalEntityType: string | null;
  group: string | null;
  required: boolean | null;
  inputStatus: string | null;
  allowNotDisplay: boolean | null;
  tpisKey: string | null;
  tpisOperationMode: string[] | null;
  tpisExtraInfo: unknown;
  hasCurveData: boolean;
};

export type ComponentSpec = {
  componentType: string;
  id: string | null;
  uuid: string | null;
  group: string | null;
  icon: string | null;
  measured: {
    width?: number;
    height?: number;
  } | null;
  operationMode: string | null;
  data: Record<string, unknown> | null;
  inputParameters: ComponentSpecParameter[];
  outputParameters: ComponentSpecParameter[];
};

export type ComponentCurveData = {
  componentType: string;
  curvesByParameterId: Record<string, unknown>;
};

export type InterfaceSpec = {
  materialType: string;
  nameCn: string | null;
  parameters: ComponentSpecParameter[];
};

type LoadStatus = "loading" | "ready" | "error";

type ComponentSpecCatalogState = {
  specsByType: Record<string, ComponentSpec>;
  loadStatusByType: Record<string, LoadStatus>;
  errorsByType: Record<string, string>;
};

type ComponentCurveCatalogState = {
  curvesByType: Record<string, ComponentCurveData>;
  loadStatusByType: Record<string, LoadStatus>;
  errorsByType: Record<string, string>;
};

type InterfaceSpecCatalogState = {
  specsByMaterialType: Record<string, InterfaceSpec>;
  loadStatusByMaterialType: Record<string, LoadStatus>;
  errorsByMaterialType: Record<string, string>;
};

type InterfaceSpecLoaderModule = {
  default: {
    material_type?: unknown;
    name_cn?: unknown;
    parameters?: unknown;
  };
};

const componentSpecLoaders = import.meta.glob<{ default: ComponentSpec }>(
  "./data/componentSpecsMock/specs/*.json",
);
const componentCurveLoaders = import.meta.glob<{ default: ComponentCurveData }>(
  "./data/componentSpecsMock/curves/*.json",
);
const interfaceSpecLoaders = import.meta.glob<InterfaceSpecLoaderModule>(
  "./data/interfaceSpecsMock/*.json",
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const getNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toBooleanOrNull = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return null;
};

const toStringArrayOrNull = (value: unknown) => {
  if (!Array.isArray(value)) {
    return null;
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  return strings.length > 0 ? strings : null;
};

const normalizeEnumOptions = (value: unknown) => {
  if (Array.isArray(value)) {
    const filtered = value.filter((item) => item !== null && item !== "");
    return filtered.length > 0 ? filtered : null;
  }

  if (value === null || value === undefined || value === "") {
    return null;
  }

  return [value];
};

export const getInterfaceMaterialTypeKey = (materialType: string) =>
  materialType.trim().toLowerCase();

const getFileStemFromPath = (path: string) =>
  path
    .split("/")
    .pop()
    ?.replace(/\.json$/i, "") || "";

const interfaceSpecLoadersByMaterialType = Object.entries(interfaceSpecLoaders).reduce<
  Record<string, (typeof interfaceSpecLoaders)[string]>
>((result, [path, loader]) => {
  const materialType = getFileStemFromPath(path);

  if (!materialType) {
    return result;
  }

  result[getInterfaceMaterialTypeKey(materialType)] = loader;

  return result;
}, {});

const normalizeInterfaceParameter = (
  rawParameter: unknown,
  index: number,
): ComponentSpecParameter | null => {
  if (!isRecord(rawParameter)) {
    return null;
  }

  const parameterId =
    getNonEmptyString(rawParameter.uuid) ||
    getNonEmptyString(rawParameter.tpis_key) ||
    getNonEmptyString(rawParameter.name) ||
    getNonEmptyString(rawParameter.name_cn) ||
    `interface-parameter:${index}`;

  const valueType = getNonEmptyString(rawParameter.value_type) || "string";

  return {
    id: parameterId,
    uuid: getNonEmptyString(rawParameter.uuid),
    key:
      getNonEmptyString(rawParameter.tpis_key) ||
      getNonEmptyString(rawParameter.name),
    name: getNonEmptyString(rawParameter.name),
    nameCn: getNonEmptyString(rawParameter.name_cn),
    source: getNonEmptyString(rawParameter.source),
    valueType,
    unit: getNonEmptyString(rawParameter.unit),
    defaultValue: rawParameter.value,
    tips: getNonEmptyString(rawParameter.tips),
    enumOptions: normalizeEnumOptions(rawParameter.enum_options),
    physicalEntityType: getNonEmptyString(rawParameter.physical_entity_type),
    group: getNonEmptyString(rawParameter.group),
    required: toBooleanOrNull(rawParameter.require),
    inputStatus: getNonEmptyString(rawParameter.input_status),
    allowNotDisplay: toBooleanOrNull(rawParameter.allow_not_display),
    tpisKey: getNonEmptyString(rawParameter.tpis_key),
    tpisOperationMode: toStringArrayOrNull(rawParameter.tpis_operation_mode),
    tpisExtraInfo: rawParameter.tpis_extra_info,
    hasCurveData: false,
  };
};

const normalizeInterfaceSpec = (
  module: InterfaceSpecLoaderModule["default"],
  requestedMaterialType: string,
): InterfaceSpec => {
  const materialType =
    getNonEmptyString(module.material_type) || requestedMaterialType;
  const parametersRaw = Array.isArray(module.parameters) ? module.parameters : [];

  return {
    materialType,
    nameCn: getNonEmptyString(module.name_cn),
    parameters: parametersRaw
      .map((parameter, index) => normalizeInterfaceParameter(parameter, index))
      .filter((parameter): parameter is ComponentSpecParameter => !!parameter),
  };
};

const getSpecLoader = (componentType: string) =>
  componentSpecLoaders[`./data/componentSpecsMock/specs/${componentType}.json`];

const getCurveLoader = (componentType: string) =>
  componentCurveLoaders[`./data/componentSpecsMock/curves/${componentType}.json`];

const getInterfaceSpecLoader = (materialType: string) =>
  interfaceSpecLoadersByMaterialType[getInterfaceMaterialTypeKey(materialType)];

export const componentSpecManifestAtom = atom<ComponentSpecManifestEntry[]>(
  manifestJson as ComponentSpecManifestEntry[],
);

export const componentSpecCatalogAtom = atom<ComponentSpecCatalogState>({
  specsByType: {},
  loadStatusByType: {},
  errorsByType: {},
});

export const componentCurveCatalogAtom = atom<ComponentCurveCatalogState>({
  curvesByType: {},
  loadStatusByType: {},
  errorsByType: {},
});

export const interfaceSpecCatalogAtom = atom<InterfaceSpecCatalogState>({
  specsByMaterialType: {},
  loadStatusByMaterialType: {},
  errorsByMaterialType: {},
});

export const ensureComponentSpecLoadedAtom = atom(
  null,
  async (get, set, componentType: string) => {
    const state = get(componentSpecCatalogAtom);
    const status = state.loadStatusByType[componentType];

    if (status === "ready" || status === "loading") {
      return;
    }

    const loader = getSpecLoader(componentType);

    if (!loader) {
      set(componentSpecCatalogAtom, {
        ...state,
        loadStatusByType: {
          ...state.loadStatusByType,
          [componentType]: "error",
        },
        errorsByType: {
          ...state.errorsByType,
          [componentType]: `Missing component spec loader for ${componentType}`,
        },
      });
      return;
    }

    set(componentSpecCatalogAtom, {
      ...state,
      loadStatusByType: {
        ...state.loadStatusByType,
        [componentType]: "loading",
      },
    });

    try {
      const module = await loader();
      const nextState = get(componentSpecCatalogAtom);

      set(componentSpecCatalogAtom, {
        specsByType: {
          ...nextState.specsByType,
          [componentType]: module.default,
        },
        loadStatusByType: {
          ...nextState.loadStatusByType,
          [componentType]: "ready",
        },
        errorsByType: {
          ...nextState.errorsByType,
          [componentType]: "",
        },
      });
    } catch (error) {
      const nextState = get(componentSpecCatalogAtom);

      set(componentSpecCatalogAtom, {
        ...nextState,
        loadStatusByType: {
          ...nextState.loadStatusByType,
          [componentType]: "error",
        },
        errorsByType: {
          ...nextState.errorsByType,
          [componentType]:
            error instanceof Error ? error.message : String(error),
        },
      });
    }
  },
);

export const ensureComponentCurveDataLoadedAtom = atom(
  null,
  async (get, set, componentType: string) => {
    const state = get(componentCurveCatalogAtom);
    const status = state.loadStatusByType[componentType];

    if (status === "ready" || status === "loading") {
      return;
    }

    const loader = getCurveLoader(componentType);

    if (!loader) {
      set(componentCurveCatalogAtom, {
        ...state,
        loadStatusByType: {
          ...state.loadStatusByType,
          [componentType]: "error",
        },
        errorsByType: {
          ...state.errorsByType,
          [componentType]: `Missing component curve loader for ${componentType}`,
        },
      });
      return;
    }

    set(componentCurveCatalogAtom, {
      ...state,
      loadStatusByType: {
        ...state.loadStatusByType,
        [componentType]: "loading",
      },
    });

    try {
      const module = await loader();
      const nextState = get(componentCurveCatalogAtom);

      set(componentCurveCatalogAtom, {
        curvesByType: {
          ...nextState.curvesByType,
          [componentType]: module.default,
        },
        loadStatusByType: {
          ...nextState.loadStatusByType,
          [componentType]: "ready",
        },
        errorsByType: {
          ...nextState.errorsByType,
          [componentType]: "",
        },
      });
    } catch (error) {
      const nextState = get(componentCurveCatalogAtom);

      set(componentCurveCatalogAtom, {
        ...nextState,
        loadStatusByType: {
          ...nextState.loadStatusByType,
          [componentType]: "error",
        },
        errorsByType: {
          ...nextState.errorsByType,
          [componentType]:
            error instanceof Error ? error.message : String(error),
        },
      });
    }
  },
);

export const ensureInterfaceSpecLoadedAtom = atom(
  null,
  async (get, set, materialType: string) => {
    const materialTypeKey = getInterfaceMaterialTypeKey(materialType);

    if (!materialTypeKey) {
      return;
    }

    const state = get(interfaceSpecCatalogAtom);
    const status = state.loadStatusByMaterialType[materialTypeKey];

    if (status === "ready" || status === "loading") {
      return;
    }

    const loader = getInterfaceSpecLoader(materialTypeKey);

    if (!loader) {
      set(interfaceSpecCatalogAtom, {
        ...state,
        loadStatusByMaterialType: {
          ...state.loadStatusByMaterialType,
          [materialTypeKey]: "error",
        },
        errorsByMaterialType: {
          ...state.errorsByMaterialType,
          [materialTypeKey]: `Missing interface spec loader for ${materialType}`,
        },
      });
      return;
    }

    set(interfaceSpecCatalogAtom, {
      ...state,
      loadStatusByMaterialType: {
        ...state.loadStatusByMaterialType,
        [materialTypeKey]: "loading",
      },
    });

    try {
      const module = await loader();
      const normalizedSpec = normalizeInterfaceSpec(module.default, materialTypeKey);
      const nextState = get(interfaceSpecCatalogAtom);

      set(interfaceSpecCatalogAtom, {
        specsByMaterialType: {
          ...nextState.specsByMaterialType,
          [materialTypeKey]: normalizedSpec,
        },
        loadStatusByMaterialType: {
          ...nextState.loadStatusByMaterialType,
          [materialTypeKey]: "ready",
        },
        errorsByMaterialType: {
          ...nextState.errorsByMaterialType,
          [materialTypeKey]: "",
        },
      });
    } catch (error) {
      const nextState = get(interfaceSpecCatalogAtom);

      set(interfaceSpecCatalogAtom, {
        ...nextState,
        loadStatusByMaterialType: {
          ...nextState.loadStatusByMaterialType,
          [materialTypeKey]: "error",
        },
        errorsByMaterialType: {
          ...nextState.errorsByMaterialType,
          [materialTypeKey]:
            error instanceof Error ? error.message : String(error),
        },
      });
    }
  },
);
