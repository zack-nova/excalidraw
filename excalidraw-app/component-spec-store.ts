import { atom } from "./app-jotai";
import manifestJson from "./data/componentSpecsMock/manifest.json";

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
type LoadState = LoadStatus | "idle";

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

type ComponentSpecManifestState = {
  items: ComponentSpecManifestEntry[];
  status: LoadState;
  error: string;
};

type InterfaceSpecLoaderModule = {
  default: {
    material_type?: unknown;
    name_cn?: unknown;
    parameters?: unknown;
  };
};

class EngineeringBackendHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EngineeringBackendHttpError";
    this.status = status;
  }
}

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

const componentSpecLocalLoaders = import.meta.glob<{ default: ComponentSpec }>(
  "./data/componentSpecsMock/specs/*.json",
);
const componentCurveLocalLoaders = import.meta.glob<{
  default: ComponentCurveData;
}>("./data/componentSpecsMock/curves/*.json");
const interfaceSpecLocalLoaders = import.meta.glob<InterfaceSpecLoaderModule>(
  "./data/interfaceSpecsMock/*.json",
);

const readField = (record: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
};

const readArrayField = (
  record: Record<string, unknown>,
  keys: readonly string[],
) => {
  const value = readField(record, keys);
  return Array.isArray(value) ? value : [];
};

const getConfiguredEngineeringBackendBaseUrl = () => {
  const runtimeBaseUrl = (
    globalThis as typeof globalThis & {
      __EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__?: unknown;
    }
  ).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__;
  if (typeof runtimeBaseUrl === "string") {
    const runtimeTrimmed = runtimeBaseUrl.trim();
    if (runtimeTrimmed) {
      return runtimeTrimmed.replace(/\/+$/, "");
    }
  }

  // Avoid real network calls in tests unless explicitly injected at runtime.
  if (import.meta.env.MODE === "test") {
    return null;
  }

  const candidate = import.meta.env.VITE_APP_ENGINEERING_BACKEND_URL;
  if (typeof candidate !== "string") {
    return null;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
};

const requestEngineeringBackendJson = async <T>(
  baseUrl: string,
  path: string,
): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  const responseBody = await response.json();

  if (!response.ok) {
    throw new EngineeringBackendHttpError(
      `Engineering backend request failed with ${response.status}`,
      response.status,
    );
  }

  return responseBody as T;
};

const normalizeParameter = (
  parameter: unknown,
  index: number,
  scope: string,
): ComponentSpecParameter | null => {
  if (!isRecord(parameter)) {
    return null;
  }

  const parameterId =
    getNonEmptyString(readField(parameter, ["id", "uuid"])) ||
    getNonEmptyString(readField(parameter, ["tpisKey", "tpis_key"])) ||
    getNonEmptyString(readField(parameter, ["name", "nameCn", "name_cn"])) ||
    `${scope}:${index}`;

  return {
    id: parameterId,
    uuid: getNonEmptyString(readField(parameter, ["uuid"])),
    key:
      getNonEmptyString(readField(parameter, ["key", "tpisKey", "tpis_key"])) ||
      getNonEmptyString(readField(parameter, ["name"])),
    name: getNonEmptyString(readField(parameter, ["name"])),
    nameCn: getNonEmptyString(readField(parameter, ["nameCn", "name_cn"])),
    source: getNonEmptyString(readField(parameter, ["source"])),
    valueType:
      getNonEmptyString(readField(parameter, ["valueType", "value_type"])) || "string",
    unit: getNonEmptyString(readField(parameter, ["unit"])),
    defaultValue: readField(parameter, ["defaultValue", "value"]),
    tips: getNonEmptyString(readField(parameter, ["tips"])),
    enumOptions: normalizeEnumOptions(
      readField(parameter, ["enumOptions", "enum_options"]),
    ),
    physicalEntityType: getNonEmptyString(
      readField(parameter, ["physicalEntityType", "physical_entity_type"]),
    ),
    group: getNonEmptyString(readField(parameter, ["group"])),
    required: toBooleanOrNull(readField(parameter, ["required", "require"])),
    inputStatus: getNonEmptyString(readField(parameter, ["inputStatus", "input_status"])),
    allowNotDisplay: toBooleanOrNull(
      readField(parameter, ["allowNotDisplay", "allow_not_display"]),
    ),
    tpisKey: getNonEmptyString(readField(parameter, ["tpisKey", "tpis_key"])),
    tpisOperationMode: toStringArrayOrNull(
      readField(parameter, ["tpisOperationMode", "tpis_operation_mode"]),
    ),
    tpisExtraInfo: readField(parameter, ["tpisExtraInfo", "tpis_extra_info"]),
    hasCurveData:
      readField(parameter, ["hasCurveData"]) === true ||
      readField(parameter, ["curve_data"]) !== null,
  };
};

const normalizeComponentSpec = (
  payload: unknown,
  componentType: string,
): ComponentSpec => {
  const spec = isRecord(payload) ? payload : {};
  const data = isRecord(spec.data) ? spec.data : {};
  const inputParameters = readArrayField(spec, ["inputParameters", "input_parameters"]);
  const outputParameters = readArrayField(spec, [
    "outputParameters",
    "output_parameters",
  ]);
  const normalizedComponentType =
    getNonEmptyString(readField(spec, ["componentType", "component_type"])) ||
    getNonEmptyString(readField(data, ["component_type"])) ||
    componentType;

  return {
    componentType: normalizedComponentType,
    id: getNonEmptyString(readField(spec, ["id"])),
    uuid: getNonEmptyString(readField(spec, ["uuid"])),
    group: getNonEmptyString(readField(spec, ["group"])),
    icon: getNonEmptyString(readField(spec, ["icon"])),
    measured: isRecord(readField(spec, ["measured"]))
      ? (readField(spec, ["measured"]) as ComponentSpec["measured"])
      : null,
    operationMode: getNonEmptyString(readField(spec, ["operationMode", "operation_mode"])),
    data: {
      ...data,
      component_type: normalizedComponentType,
      name:
        getNonEmptyString(readField(spec, ["name"])) ||
        getNonEmptyString(readField(data, ["name"])),
      name_cn:
        getNonEmptyString(readField(spec, ["nameCn", "name_cn"])) ||
        getNonEmptyString(readField(data, ["name_cn"])),
    },
    inputParameters: inputParameters
      .map((parameter, index) =>
        normalizeParameter(parameter, index, `${normalizedComponentType}:input`),
      )
      .filter((parameter): parameter is ComponentSpecParameter => !!parameter),
    outputParameters: outputParameters
      .map((parameter, index) =>
        normalizeParameter(parameter, index, `${normalizedComponentType}:output`),
      )
      .filter((parameter): parameter is ComponentSpecParameter => !!parameter),
  };
};

const normalizeComponentCurveData = (
  payload: unknown,
  componentType: string,
): ComponentCurveData => {
  if (!isRecord(payload)) {
    return {
      componentType,
      curvesByParameterId: {},
    };
  }

  return {
    componentType:
      getNonEmptyString(readField(payload, ["componentType", "component_type"])) ||
      componentType,
    curvesByParameterId: isRecord(payload.curvesByParameterId)
      ? (payload.curvesByParameterId as Record<string, unknown>)
      : {},
  };
};

const normalizeInterfaceSpec = (
  payload: unknown,
  requestedMaterialType: string,
): InterfaceSpec => {
  const module = isRecord(payload) ? payload : {};
  const materialType =
    getNonEmptyString(readField(module, ["materialType", "material_type"])) ||
    requestedMaterialType;
  const parametersRaw = readArrayField(module, ["parameters"]);

  return {
    materialType,
    nameCn: getNonEmptyString(readField(module, ["nameCn", "name_cn"])),
    parameters: parametersRaw
      .map((parameter, index) =>
        normalizeParameter(parameter, index, `${materialType}:interface`),
      )
      .filter((parameter): parameter is ComponentSpecParameter => !!parameter),
  };
};

const normalizeComponentManifestEntry = (
  item: unknown,
): ComponentSpecManifestEntry | null => {
  if (!isRecord(item)) {
    return null;
  }

  const componentType = getNonEmptyString(item.componentType);
  if (!componentType) {
    return null;
  }

  const inputCount =
    typeof item.inputCount === "number" && Number.isFinite(item.inputCount)
      ? item.inputCount
      : 0;
  const outputCount =
    typeof item.outputCount === "number" && Number.isFinite(item.outputCount)
      ? item.outputCount
      : 0;
  const curveParameterCount =
    typeof item.curveParameterCount === "number" &&
    Number.isFinite(item.curveParameterCount)
      ? item.curveParameterCount
      : 0;

  return {
    componentType,
    inputCount,
    outputCount,
    curveParameterCount,
    specPath: `/api/v1/templates/components/${encodeURIComponent(componentType)}`,
    curvePath: `/api/v1/templates/components/${encodeURIComponent(componentType)}/curves`,
  };
};

export const getInterfaceMaterialTypeKey = (materialType: string) =>
  materialType.trim().toLowerCase();

const getLocalComponentSpecLoader = (componentType: string) =>
  componentSpecLocalLoaders[`./data/componentSpecsMock/specs/${componentType}.json`];

const getLocalComponentCurveLoader = (componentType: string) =>
  componentCurveLocalLoaders[
    `./data/componentSpecsMock/curves/${componentType}.json`
  ];

const getLocalInterfaceSpecLoader = (materialType: string) =>
  interfaceSpecLocalLoaders[
    `./data/interfaceSpecsMock/${materialType}.json`
  ];

const componentSpecManifestStateAtom = atom<ComponentSpecManifestState>({
  items: [],
  status: "idle",
  error: "",
});

export const componentSpecManifestAtom = atom((get) =>
  get(componentSpecManifestStateAtom).items,
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

export const ensureComponentSpecManifestLoadedAtom = atom(
  null,
  async (get, set) => {
    const state = get(componentSpecManifestStateAtom);
    if (state.status === "loading" || state.status === "ready") {
      return;
    }

    const baseUrl = getConfiguredEngineeringBackendBaseUrl();
    if (!baseUrl) {
      if (import.meta.env.MODE === "test") {
        set(componentSpecManifestStateAtom, {
          items: (manifestJson as ComponentSpecManifestEntry[]) || [],
          status: "ready",
          error: "",
        });
        return;
      }
      set(componentSpecManifestStateAtom, {
        items: [],
        status: "error",
        error: "VITE_APP_ENGINEERING_BACKEND_URL is not configured",
      });
      return;
    }

    set(componentSpecManifestStateAtom, {
      ...state,
      status: "loading",
      error: "",
    });

    try {
      const response = await requestEngineeringBackendJson<{ items?: unknown[] }>(
        baseUrl,
        "/api/v1/templates/components?offset=0&limit=500",
      );

      const items = Array.isArray(response.items)
        ? response.items
            .map(normalizeComponentManifestEntry)
            .filter(
              (entry): entry is ComponentSpecManifestEntry => entry !== null,
            )
        : [];

      set(componentSpecManifestStateAtom, {
        items,
        status: "ready",
        error: "",
      });
    } catch (error) {
      set(componentSpecManifestStateAtom, {
        items: [],
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export const ensureComponentSpecLoadedAtom = atom(
  null,
  async (get, set, componentType: string) => {
    const state = get(componentSpecCatalogAtom);
    const status = state.loadStatusByType[componentType];

    if (status === "ready" || status === "loading") {
      return;
    }

    const baseUrl = getConfiguredEngineeringBackendBaseUrl();
    if (!baseUrl) {
      if (import.meta.env.MODE === "test") {
        const loader = getLocalComponentSpecLoader(componentType);
        if (!loader) {
          set(componentSpecCatalogAtom, {
            ...state,
            loadStatusByType: {
              ...state.loadStatusByType,
              [componentType]: "error",
            },
            errorsByType: {
              ...state.errorsByType,
              [componentType]: `Missing local component spec loader for ${componentType}`,
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
        return;
      }

      set(componentSpecCatalogAtom, {
        ...state,
        loadStatusByType: {
          ...state.loadStatusByType,
          [componentType]: "error",
        },
        errorsByType: {
          ...state.errorsByType,
          [componentType]: "VITE_APP_ENGINEERING_BACKEND_URL is not configured",
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
      const payload = await requestEngineeringBackendJson<unknown>(
        baseUrl,
        `/api/v1/templates/components/${encodeURIComponent(componentType)}`,
      );
      const normalizedSpec = normalizeComponentSpec(payload, componentType);
      const nextState = get(componentSpecCatalogAtom);

      set(componentSpecCatalogAtom, {
        specsByType: {
          ...nextState.specsByType,
          [componentType]: normalizedSpec,
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

    const baseUrl = getConfiguredEngineeringBackendBaseUrl();
    if (!baseUrl) {
      if (import.meta.env.MODE === "test") {
        const loader = getLocalComponentCurveLoader(componentType);
        if (!loader) {
          set(componentCurveCatalogAtom, {
            ...state,
            loadStatusByType: {
              ...state.loadStatusByType,
              [componentType]: "error",
            },
            errorsByType: {
              ...state.errorsByType,
              [componentType]: `Missing local component curve loader for ${componentType}`,
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
        return;
      }

      set(componentCurveCatalogAtom, {
        ...state,
        loadStatusByType: {
          ...state.loadStatusByType,
          [componentType]: "error",
        },
        errorsByType: {
          ...state.errorsByType,
          [componentType]: "VITE_APP_ENGINEERING_BACKEND_URL is not configured",
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
      const payload = await requestEngineeringBackendJson<unknown>(
        baseUrl,
        `/api/v1/templates/components/${encodeURIComponent(componentType)}/curves`,
      );
      const normalizedCurveData = normalizeComponentCurveData(payload, componentType);
      const nextState = get(componentCurveCatalogAtom);

      set(componentCurveCatalogAtom, {
        curvesByType: {
          ...nextState.curvesByType,
          [componentType]: normalizedCurveData,
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

    const baseUrl = getConfiguredEngineeringBackendBaseUrl();
    if (!baseUrl) {
      if (import.meta.env.MODE === "test") {
        const loader = getLocalInterfaceSpecLoader(materialTypeKey);
        if (!loader) {
          set(interfaceSpecCatalogAtom, {
            ...state,
            loadStatusByMaterialType: {
              ...state.loadStatusByMaterialType,
              [materialTypeKey]: "error",
            },
            errorsByMaterialType: {
              ...state.errorsByMaterialType,
              [materialTypeKey]: `Missing local interface spec loader for ${materialType}`,
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
        return;
      }

      set(interfaceSpecCatalogAtom, {
        ...state,
        loadStatusByMaterialType: {
          ...state.loadStatusByMaterialType,
          [materialTypeKey]: "error",
        },
        errorsByMaterialType: {
          ...state.errorsByMaterialType,
          [materialTypeKey]: "VITE_APP_ENGINEERING_BACKEND_URL is not configured",
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
      const payload = await requestEngineeringBackendJson<unknown>(
        baseUrl,
        `/api/v1/templates/materials/${encodeURIComponent(materialTypeKey)}`,
      );
      const normalizedSpec = normalizeInterfaceSpec(payload, materialTypeKey);
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
