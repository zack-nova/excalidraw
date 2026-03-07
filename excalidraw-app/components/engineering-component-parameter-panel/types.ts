import type { ComponentSpecParameter } from "../../component-spec-store";
import type { ParsedEngineeringAnchor } from "../../engineering-component-data-utils";
import type { EngineeringValue } from "../../engineering-domain";

export type SelectedComponentAnchor = ParsedEngineeringAnchor;

export type SelectedComponentContext = {
  elementId: string;
  componentType: string;
  anchors: SelectedComponentAnchor[];
  focusedAnchorIndex: number | null;
};

export type SelectedShapeVariableBinding = {
  id: string;
  expression: string;
  variableTokens: string[];
};

export type IndexedParameter = {
  parameter: ComponentSpecParameter;
  index: number;
};

export type ParameterGroup = {
  name: string;
  items: IndexedParameter[];
};

export type InputType = "number" | "boolean" | "curve" | "enum" | "text";

export type ResolvedInputParameterBinding = {
  variableId: string;
  providerId: string | undefined;
  snapshotValue: EngineeringValue | undefined;
};

export type OutputAnchorSection = {
  anchorId: string;
  anchorName: string;
  materialType: string;
  status: "loading" | "ready" | "error";
  parameters: ComponentSpecParameter[];
};
