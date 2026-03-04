import { atom } from "./app-jotai";

export type EngineeringWorkspaceMode = "modeling" | "data" | "analysis";

export const ENGINEERING_WORKSPACE_MODE_ORDER: readonly EngineeringWorkspaceMode[] =
  ["modeling", "data", "analysis"];

export const engineeringWorkspaceModeAtom =
  atom<EngineeringWorkspaceMode>("modeling");

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
