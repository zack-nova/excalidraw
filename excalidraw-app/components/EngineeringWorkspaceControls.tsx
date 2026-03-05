import type { JSX } from "react";

import { ToolButton } from "@excalidraw/excalidraw/components/ToolButton";
import {
  abacusIcon,
  gridIcon,
  presentationIcon,
  settingsIcon,
} from "@excalidraw/excalidraw/components/icons";

import { useAtom, useSetAtom } from "../app-jotai";
import { requestEngineeringCalculationAtom } from "../engineering-domain-state";
import {
  getNextEngineeringWorkspaceMode,
  engineeringWorkspaceModeAtom,
  type EngineeringWorkspaceMode,
} from "../engineering-ui-state";

import "./EngineeringWorkspaceControls.scss";

const WORKSPACE_MODES: readonly {
  key: EngineeringWorkspaceMode;
  label: string;
  icon: JSX.Element;
}[] = [
  { key: "modeling", label: "建模", icon: settingsIcon },
  { key: "data", label: "数据", icon: gridIcon },
  { key: "analysis", label: "分析", icon: presentationIcon },
];

const getWorkspaceModeConfig = (workspaceMode: EngineeringWorkspaceMode) =>
  WORKSPACE_MODES.find((workspace) => workspace.key === workspaceMode)!;

export const EngineeringWorkspaceModeTrigger = () => {
  const [workspaceMode, setWorkspaceMode] = useAtom(
    engineeringWorkspaceModeAtom,
  );
  const currentWorkspace = getWorkspaceModeConfig(workspaceMode);

  return (
    <ToolButton
      type="icon"
      icon={currentWorkspace.icon}
      title={currentWorkspace.label}
      aria-label={currentWorkspace.label}
      className="engineering-workspace-trigger"
      data-testid="engineering-workspace-trigger"
      size="medium"
      onClick={() =>
        setWorkspaceMode(getNextEngineeringWorkspaceMode(workspaceMode))
      }
    />
  );
};

export const EngineeringCalculateTrigger = () => {
  const requestCalculation = useSetAtom(requestEngineeringCalculationAtom);

  return (
    <ToolButton
      type="icon"
      icon={abacusIcon}
      title="计算"
      aria-label="计算"
      className="engineering-calculate-trigger"
      data-testid="engineering-calculate-trigger"
      size="medium"
      onClick={() => requestCalculation()}
    />
  );
};
