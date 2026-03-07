import { evaluateEngineeringExpression } from "./engineering-data-expression-engine";

import type { EngineeringDataContext } from "./engineeringData";

const TEMPLATE_PATTERN = /\{\{([\s\S]+?)\}\}/g;

const stringifyResolvedValue = (value: unknown) => {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return String(value);
};

export const renderEngineeringTemplate = (
  template: string,
  context: EngineeringDataContext,
) => {
  return template.replace(TEMPLATE_PATTERN, (match, expression: string) => {
    const trimmedExpression = expression.trim();
    if (!trimmedExpression) {
      return match;
    }

    try {
      const resolvedValue = evaluateEngineeringExpression(trimmedExpression, context);
      if (typeof resolvedValue === "undefined") {
        return match;
      }
      return stringifyResolvedValue(resolvedValue);
    } catch {
      return match;
    }
  });
};
