import type { ComponentSpecParameter } from "./component-spec-store";

const getFirstNonEmptyString = (...values: (string | null | undefined)[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

export const normalizeEngineeringIdSegment = (value: string) =>
  value
    .trim()
    .replace(/[^A-Za-z0-9:_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "param";

export const toComponentParameterStableToken = (
  parameter: ComponentSpecParameter,
  index: number,
) =>
  normalizeEngineeringIdSegment(
    getFirstNonEmptyString(
      parameter.uuid,
      parameter.id,
      parameter.key,
      parameter.tpisKey,
      `index-${index}`,
    ) || `index-${index}`,
  );

export const toComponentParameterStableKey = (
  parameter: ComponentSpecParameter,
  index: number,
) =>
  normalizeEngineeringIdSegment(
    getFirstNonEmptyString(
      parameter.tpisKey,
      parameter.key,
      parameter.id,
      parameter.uuid,
      `index-${index}`,
    ) || `index-${index}`,
  );

export const toComponentParameterLookupKey = (
  parameter: ComponentSpecParameter,
) =>
  getFirstNonEmptyString(
    parameter.tpisKey,
    parameter.key,
    parameter.id,
    parameter.uuid,
  );
