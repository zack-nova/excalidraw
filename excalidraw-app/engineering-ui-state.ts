import { atom } from "./app-jotai";

export type EngineeringWorkspaceMode = "modeling" | "data" | "analysis";

export const ENGINEERING_WORKSPACE_MODE_ORDER: readonly EngineeringWorkspaceMode[] =
  ["modeling", "data", "analysis"];

export const engineeringWorkspaceModeAtom =
  atom<EngineeringWorkspaceMode>("modeling");

export const ENGINEERING_SELECTED_SHAPE_ACTIONS_WIDTHS_STORAGE_KEY =
  "engineering:selected-shape-actions-widths:v1";

export const ENGINEERING_SELECTED_SHAPE_ACTIONS_MIN_WIDTH = 280;
export const ENGINEERING_SELECTED_SHAPE_ACTIONS_MAX_WIDTH = 560;

export type EngineeringSelectedShapeActionsWidths = Record<
  EngineeringWorkspaceMode,
  number
>;

export const ENGINEERING_SELECTED_SHAPE_ACTIONS_DEFAULT_WIDTHS: EngineeringSelectedShapeActionsWidths =
  {
    modeling: 302,
    data: 302,
    analysis: 302,
  };

const clampSelectedShapeActionsWidth = (width: number) =>
  Math.max(
    ENGINEERING_SELECTED_SHAPE_ACTIONS_MIN_WIDTH,
    Math.min(ENGINEERING_SELECTED_SHAPE_ACTIONS_MAX_WIDTH, width),
  );

const normalizeStoredWidth = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? clampSelectedShapeActionsWidth(Math.round(value))
    : fallback;

export const readEngineeringSelectedShapeActionsWidthsFromStorage = () => {
  if (typeof window === "undefined") {
    return ENGINEERING_SELECTED_SHAPE_ACTIONS_DEFAULT_WIDTHS;
  }

  try {
    const raw = window.localStorage.getItem(
      ENGINEERING_SELECTED_SHAPE_ACTIONS_WIDTHS_STORAGE_KEY,
    );

    if (!raw) {
      return ENGINEERING_SELECTED_SHAPE_ACTIONS_DEFAULT_WIDTHS;
    }

    const parsed = JSON.parse(raw) as Partial<EngineeringSelectedShapeActionsWidths>;

    return {
      modeling: normalizeStoredWidth(
        parsed.modeling,
        ENGINEERING_SELECTED_SHAPE_ACTIONS_DEFAULT_WIDTHS.modeling,
      ),
      data: normalizeStoredWidth(
        parsed.data,
        ENGINEERING_SELECTED_SHAPE_ACTIONS_DEFAULT_WIDTHS.data,
      ),
      analysis: normalizeStoredWidth(
        parsed.analysis,
        ENGINEERING_SELECTED_SHAPE_ACTIONS_DEFAULT_WIDTHS.analysis,
      ),
    };
  } catch {
    return ENGINEERING_SELECTED_SHAPE_ACTIONS_DEFAULT_WIDTHS;
  }
};

export const persistEngineeringSelectedShapeActionsWidthsToStorage = (
  widths: EngineeringSelectedShapeActionsWidths,
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      ENGINEERING_SELECTED_SHAPE_ACTIONS_WIDTHS_STORAGE_KEY,
      JSON.stringify(widths),
    );
  } catch {
    // Ignore quota/permission errors, runtime should still work without persistence.
  }
};

export const getNextEngineeringWorkspaceMode = (
  currentMode: EngineeringWorkspaceMode,
): EngineeringWorkspaceMode => {
  const currentIndex = ENGINEERING_WORKSPACE_MODE_ORDER.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % ENGINEERING_WORKSPACE_MODE_ORDER.length;

  return ENGINEERING_WORKSPACE_MODE_ORDER[nextIndex];
};

export const engineeringCalculationRequestedAtAtom = atom<number | null>(null);

export const requestEngineeringCalculationAtom = atom(
  null,
  (_get, set) => {
    set(engineeringCalculationRequestedAtAtom, Date.now());
  },
);
