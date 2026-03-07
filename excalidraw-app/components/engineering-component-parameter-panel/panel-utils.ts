import type { ComponentSpecParameter } from "../../component-spec-store";
import type { EngineeringValue } from "../../engineering/engineering-domain";
import { getFirstNonEmptyString } from "../../engineering/engineering-component-data-utils";
import type { InputType, ParameterGroup } from "./types";

const DEFAULT_PARAMETER_GROUP_NAME = "未分组";

const getParameterGroupName = (parameter: ComponentSpecParameter) =>
  getFirstNonEmptyString(parameter.group) || DEFAULT_PARAMETER_GROUP_NAME;

export const groupParametersByGroup = (
  parameters: ComponentSpecParameter[],
): ParameterGroup[] => {
  const groupedParameters: ParameterGroup[] = [];
  const groupIndexesByName = new Map<string, number>();

  parameters.forEach((parameter, index) => {
    const groupName = getParameterGroupName(parameter);
    const currentGroupIndex = groupIndexesByName.get(groupName);

    if (currentGroupIndex === undefined) {
      groupedParameters.push({
        name: groupName,
        items: [{ parameter, index }],
      });
      groupIndexesByName.set(groupName, groupedParameters.length - 1);
      return;
    }

    groupedParameters[currentGroupIndex].items.push({ parameter, index });
  });

  return groupedParameters;
};

export const getParameterIdentity = (
  parameter: ComponentSpecParameter,
  index: number,
) => parameter.id || parameter.uuid || parameter.key || `parameter:${index}`;

export const getParameterDescription = (_parameter: ComponentSpecParameter) => [];

const normalizeParameterDisplayName = (value: string) =>
  value
    .split("•")[0]
    .split("·")[0]
    .trim();

export const getParameterTitle = (parameter: ComponentSpecParameter) => {
  const nameCn = getFirstNonEmptyString(parameter.nameCn);
  if (nameCn) {
    return normalizeParameterDisplayName(nameCn);
  }

  const name = getFirstNonEmptyString(parameter.name, parameter.key);
  if (name) {
    return normalizeParameterDisplayName(name);
  }

  return "Unnamed parameter";
};

export const getEnumOptions = (parameter: ComponentSpecParameter) =>
  (Array.isArray(parameter.enumOptions) ? parameter.enumOptions : []).filter(
    (option): option is string => typeof option === "string" && option.length > 0,
  );

export const getInputType = (parameter: ComponentSpecParameter): InputType => {
  const normalized = (parameter.valueType || "").toLowerCase();
  const enumOptions = getEnumOptions(parameter);

  if (
    normalized === "float" ||
    normalized === "double" ||
    normalized === "number" ||
    normalized === "int" ||
    normalized === "integer"
  ) {
    return "number";
  }
  if (normalized === "bool" || normalized === "boolean") {
    return "boolean";
  }
  if (normalized === "curve" || parameter.hasCurveData) {
    return "curve";
  }
  if (normalized === "enum") {
    return enumOptions.length > 0 ? "enum" : "text";
  }
  if (enumOptions.length > 0) {
    return "enum";
  }
  return "text";
};

export const toStringValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

export const toManualInputValue = (
  inputType: InputType,
  rawValue: string | boolean,
): EngineeringValue | undefined => {
  if (inputType === "boolean") {
    return Boolean(rawValue);
  }

  if (inputType === "number") {
    if (typeof rawValue !== "string") {
      return undefined;
    }
    const normalized = rawValue.trim();

    if (!normalized) {
      return undefined;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (typeof rawValue === "string") {
    return rawValue;
  }

  return undefined;
};

export const toInputFieldValue = (
  inputType: InputType,
  value: EngineeringValue | undefined,
) => {
  if (inputType === "boolean") {
    return typeof value === "boolean" ? value : Boolean(value);
  }

  if (typeof value === "undefined") {
    return "";
  }

  return toStringValue(value);
};
