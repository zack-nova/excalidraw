import {
  computeContainerDimensionForBoundText,
  computeBoundTextPosition,
  getContainerElement,
  isArrowElement,
  isTextElement,
  newElementWith,
  refreshTextDimensions,
} from "@excalidraw/element";

import type {
  ExcalidrawTextContainer,
  ExcalidrawTextElementWithContainer,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  ProjectDocument,
  RuntimeProjection,
  ValueProvider,
} from "../engineering-domain";

type EngineeringPrimitive = number | string | boolean | null | undefined;

export interface EngineeringData {
  id?: string | null;
  uuid?: string | null;
  alias?: string | null;
  name?: string | null;
  value?: EngineeringPrimitive;
  value_type?: string;
  unit?: string | null;
  timestamp?: number | null;
  enum_options?: string[] | null;
  source?: string;
  description?: string | null;
  tags?: Record<string, string> | null;
  tips?: string | null;
  group?: string | null;
  values?: number[] | null;
  time_span?: number | null;
  physical_entity_type?: string | null;
  physical_entity_id?: string | null;
  component_id?: string | null;
  anchor_id?: string | null;
  measurement?: string | null;
  point_name?: string | null;
  field?: string | null;
  name_cn?: string | null;
  tpis_key?: string | null;
  tpis_extra_info?: string | null;
  input_status?: string | null;
  require?: boolean | null;
  max_value?: number | null;
  min_value?: number | null;
  allow_not_display?: boolean | null;
  [key: string]: unknown;
}

export type EngineeringDataContext = {
  rows: EngineeringData[];
  data: Record<string, EngineeringData>;
  items: Record<string, EngineeringData>;
  values: Record<string, EngineeringPrimitive>;
  aliasToId: Record<string, string>;
};

type ExpressionNode =
  | {
      type: "number";
      value: number;
    }
  | {
      type: "string";
      value: string;
    }
  | {
      type: "identifier";
      path: string[];
    }
  | {
      type: "call";
      callee: string;
      arguments: ExpressionNode[];
    }
  | {
      type: "unary";
      operator: "+" | "-";
      argument: ExpressionNode;
    }
  | {
      type: "binary";
      operator: "+" | "-" | "*" | "/" | "%";
      left: ExpressionNode;
      right: ExpressionNode;
    };

type Token =
  | {
      type: "number";
      value: number;
    }
  | {
      type: "identifier";
      value: string;
    }
  | {
      type: "string";
      value: string;
    }
  | {
      type: "operator";
      value: "+" | "-" | "*" | "/" | "%";
    }
  | {
      type: "dot";
    }
  | {
      type: "paren";
      value: "(" | ")";
    }
  | {
      type: "comma";
    }
  | {
      type: "bracket";
      value: string;
    };

type EngineeringDataListener = (context: EngineeringDataContext) => void;

const TEMPLATE_PATTERN = /\{\{([\s\S]+?)\}\}/g;
const IDENTIFIER_START = /^[$_\p{L}]$/u;
const IDENTIFIER_PART = /^[$_\p{L}\p{N}]$/u;
const MOCK_QUERY_PARAM = "engineeringDataMock";

let engineeringDataSnapshot: EngineeringData[] = [];
let engineeringExternalDataSnapshot: EngineeringData[] = [];
let engineeringDomainDataSnapshot: EngineeringData[] = [];
let engineeringDataContext: EngineeringDataContext = {
  rows: [],
  data: {},
  items: {},
  values: {},
  aliasToId: {},
};
const listeners = new Set<EngineeringDataListener>();
let mockTimerId: number | null = null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isIdentifierStart = (char: string) => IDENTIFIER_START.test(char);
const isIdentifierPart = (char: string) => IDENTIFIER_PART.test(char);

const isValidIdentifier = (value: string) => {
  if (!value) {
    return false;
  }
  const chars = Array.from(value);
  if (!isIdentifierStart(chars[0])) {
    return false;
  }
  return chars.slice(1).every(isIdentifierPart);
};

const normalizeAlias = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/[^\p{L}\p{N}_$]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    return null;
  }

  return /^\p{N}/u.test(normalized) ? `_${normalized}` : normalized;
};

const resolveEngineeringDataItemId = (item: EngineeringData) => {
  if (isNonEmptyString(item.id)) {
    return item.id.trim();
  }

  if (isNonEmptyString(item.uuid)) {
    return item.uuid.trim();
  }

  return null;
};

const collectAliases = (item: EngineeringData) => {
  const aliases = new Set<string>();
  const candidates = [item.alias];

  candidates.forEach((candidate) => {
    if (!isNonEmptyString(candidate)) {
      return;
    }
    if (isValidIdentifier(candidate)) {
      aliases.add(candidate);
    }
    const normalized = normalizeAlias(candidate);
    if (normalized) {
      aliases.add(normalized);
    }
  });

  return aliases;
};

export const createEngineeringDataContext = (
  data: EngineeringData | EngineeringData[],
): EngineeringDataContext => {
  const items = Array.isArray(data) ? data : [data];
  const aliasToId: Record<string, string> = {};
  const context: EngineeringDataContext = {
    rows: items.slice(),
    data: {},
    items: {},
    values: {},
    aliasToId,
  };

  items.forEach((item) => {
    const itemId = resolveEngineeringDataItemId(item);
    if (itemId) {
      context.data[itemId] = item;
    }

    collectAliases(item).forEach((alias) => {
      if (!itemId) {
        throw new Error(
          `Alias "${alias}" requires item id`,
        );
      }

      const currentVariableId = aliasToId[alias];
      if (currentVariableId && currentVariableId !== itemId) {
        throw new Error(
          `Alias "${alias}" conflicts between "${currentVariableId}" and "${itemId}"`,
        );
      }

      aliasToId[alias] = itemId;
      context.items[alias] = item;
      context.values[alias] = item.value;
    });
  });

  return context;
};

const getProviderIdsForVariable = (
  project: ProjectDocument,
  variableId: string,
) => {
  const explicitProviderIds =
    project.variableCatalog.providerIdsByVariableId[variableId] ?? [];
  const fallbackProviderIds = Object.values(project.variableCatalog.providersById)
    .filter((provider) => provider.variableId === variableId)
    .map((provider) => provider.id);

  return explicitProviderIds.length > 0 ? explicitProviderIds : fallbackProviderIds;
};

const getProviderById = (
  project: ProjectDocument,
  providerId: string | undefined,
) => {
  if (!providerId) {
    return null;
  }

  return project.variableCatalog.providersById[providerId] ?? null;
};

const findProviderByKind = (
  project: ProjectDocument,
  variableId: string,
  providerKind: ValueProvider["kind"],
) =>
  getProviderIdsForVariable(project, variableId)
    .map((providerId) => project.variableCatalog.providersById[providerId])
    .find((provider) => provider?.kind === providerKind) || null;

const toDataRowGroup = (projectVariable: ProjectDocument["variableCatalog"]["variablesById"][string]) => {
  if (typeof projectVariable.tags?.group === "string" && projectVariable.tags.group.trim()) {
    return projectVariable.tags.group.trim();
  }

  return projectVariable.role;
};

export const buildEngineeringDataRowsFromRuntimeProjection = ({
  project,
  runtimeProjection,
}: {
  project: ProjectDocument;
  runtimeProjection: RuntimeProjection;
}): EngineeringData[] =>
  Object.values(project.variableCatalog.variablesById)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((variable) => {
      const snapshot = runtimeProjection.effectiveValues[variable.id];
      const currentProvider =
        getProviderById(project, snapshot?.providerId) ||
        findProviderByKind(project, variable.id, "manual") ||
        findProviderByKind(project, variable.id, "sensor") ||
        findProviderByKind(project, variable.id, "backend") ||
        findProviderByKind(project, variable.id, "expression");
      const sensorProvider =
        currentProvider?.kind === "sensor"
          ? currentProvider
          : findProviderByKind(project, variable.id, "sensor");

      return {
        id: variable.id,
        alias: typeof variable.tags?.alias === "string" ? variable.tags.alias : null,
        name: variable.name,
        name_cn: variable.nameCn || null,
        value: snapshot?.value,
        source: snapshot?.source,
        timestamp: snapshot?.timestamp ?? null,
        status: snapshot?.status,
        unit: variable.displayUnit || variable.canonicalUnit || null,
        group: toDataRowGroup(variable),
        measurement: sensorProvider?.kind === "sensor" ? sensorProvider.measurement : null,
        point_name: sensorProvider?.kind === "sensor" ? sensorProvider.pointName : null,
        field: sensorProvider?.kind === "sensor" ? sensorProvider.field : null,
        physical_entity_type: variable.owner.kind,
        physical_entity_id: variable.owner.id,
        component_id: variable.owner.kind === "component" ? variable.owner.id : null,
        anchor_id: variable.owner.kind === "anchor" ? variable.owner.id : null,
        value_type: variable.valueType,
        tags: variable.tags ?? null,
        variable_id: variable.id,
        provider_id: snapshot?.providerId || null,
        role: variable.role,
        stage: variable.stage,
      };
    });

class ExpressionParser {
  private index = 0;

  constructor(private tokens: Token[]) {}

  parse(): ExpressionNode {
    const node = this.parseAdditive();
    if (this.peek()) {
      throw new Error("Unexpected token");
    }
    return node;
  }

  private parseAdditive(): ExpressionNode {
    let node = this.parseMultiplicative();
    while (this.isOperator("+") || this.isOperator("-")) {
      const operator = this.consume() as Extract<Token, { type: "operator" }>;
      node = {
        type: "binary",
        operator: operator.value,
        left: node,
        right: this.parseMultiplicative(),
      };
    }
    return node;
  }

  private parseMultiplicative(): ExpressionNode {
    let node = this.parseUnary();
    while (
      this.isOperator("*") ||
      this.isOperator("/") ||
      this.isOperator("%")
    ) {
      const operator = this.consume() as Extract<Token, { type: "operator" }>;
      node = {
        type: "binary",
        operator: operator.value,
        left: node,
        right: this.parseUnary(),
      };
    }
    return node;
  }

  private parseUnary(): ExpressionNode {
    if (this.isOperator("+") || this.isOperator("-")) {
      const operator = this.consume() as Extract<Token, { type: "operator" }>;
      return {
        type: "unary",
        operator: operator.value as "+" | "-",
        argument: this.parseUnary(),
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();
    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    if (token.type === "number") {
      this.consume();
      return {
        type: "number",
        value: token.value,
      };
    }

    if (token.type === "string") {
      this.consume();
      return {
        type: "string",
        value: token.value,
      };
    }

    if (token.type === "identifier") {
      this.consume();
      if (this.isParen("(")) {
        this.consume();
        const args: ExpressionNode[] = [];

        if (!this.isParen(")")) {
          do {
            args.push(this.parseAdditive());
          } while (this.isComma() && this.consume());
        }

        const closing = this.consume();
        if (!closing || closing.type !== "paren" || closing.value !== ")") {
          throw new Error("Expected closing parenthesis");
        }

        return {
          type: "call",
          callee: token.value,
          arguments: args,
        };
      }

      const path = [token.value];

      while (this.peek()?.type === "dot" || this.peek()?.type === "bracket") {
        if (this.peek()?.type === "dot") {
          this.consume();
          const nextToken = this.consume();
          if (!nextToken || nextToken.type !== "identifier") {
            throw new Error("Expected identifier");
          }
          path.push(nextToken.value);
          continue;
        }

        const bracketToken = this.consume() as Extract<Token, { type: "bracket" }>;
        const bracketKey = this.parseBracketKey(bracketToken.value);
        if (!bracketKey) {
          throw new Error("Expected bracket key");
        }
        path.push(bracketKey);
      }

      return {
        type: "identifier",
        path,
      };
    }

    if (token.type === "paren" && token.value === "(") {
      this.consume();
      const expression = this.parseAdditive();
      const closing = this.consume();
      if (!closing || closing.type !== "paren" || closing.value !== ")") {
        throw new Error("Expected closing parenthesis");
      }
      return expression;
    }

    throw new Error("Unexpected token");
  }

  private peek() {
    return this.tokens[this.index];
  }

  private consume() {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private isOperator(operator: string) {
    const token = this.peek();
    return token?.type === "operator" && token.value === operator;
  }

  private isParen(value: "(" | ")") {
    const token = this.peek();
    return token?.type === "paren" && token.value === value;
  }

  private isComma() {
    return this.peek()?.type === "comma";
  }

  private parseBracketKey(rawKey: string) {
    const trimmedKey = rawKey.trim();
    if (!trimmedKey) {
      return null;
    }

    if (
      (trimmedKey.startsWith('"') && trimmedKey.endsWith('"')) ||
      (trimmedKey.startsWith("'") && trimmedKey.endsWith("'"))
    ) {
      return trimmedKey.slice(1, -1);
    }

    return trimmedKey;
  }
}

const tokenizeExpression = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }

    if (
      /\d/u.test(char) ||
      (char === "." && index + 1 < expression.length && /\d/u.test(expression[index + 1]))
    ) {
      let end = index + 1;
      while (
        end < expression.length &&
        /[\d.]/u.test(expression[end])
      ) {
        end += 1;
      }
      const value = Number(expression.slice(index, end));
      if (Number.isNaN(value)) {
        throw new Error("Invalid number");
      }
      tokens.push({
        type: "number",
        value,
      });
      index = end;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let end = index + 1;
      let value = "";

      while (end < expression.length) {
        const currentChar = expression[end];
        if (currentChar === "\\" && end + 1 < expression.length) {
          value += expression[end + 1];
          end += 2;
          continue;
        }
        if (currentChar === quote) {
          break;
        }
        value += currentChar;
        end += 1;
      }

      if (end >= expression.length || expression[end] !== quote) {
        throw new Error("Unterminated string literal");
      }

      tokens.push({
        type: "string",
        value,
      });
      index = end + 1;
      continue;
    }

    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (end < expression.length && isIdentifierPart(expression[end])) {
        end += 1;
      }
      tokens.push({
        type: "identifier",
        value: expression.slice(index, end),
      });
      index = end;
      continue;
    }

    if (char === ".") {
      tokens.push({ type: "dot" });
      index += 1;
      continue;
    }

    if (char === "[") {
      let end = index + 1;
      let quote: '"' | "'" | null = null;

      while (end < expression.length) {
        const currentChar = expression[end];
        if (quote) {
          if (currentChar === "\\" && end + 1 < expression.length) {
            end += 2;
            continue;
          }
          if (currentChar === quote) {
            quote = null;
          }
          end += 1;
          continue;
        }

        if (currentChar === '"' || currentChar === "'") {
          quote = currentChar;
          end += 1;
          continue;
        }

        if (currentChar === "]") {
          break;
        }

        end += 1;
      }

      if (end >= expression.length || expression[end] !== "]") {
        throw new Error("Unterminated bracket access");
      }

      tokens.push({
        type: "bracket",
        value: expression.slice(index + 1, end),
      });
      index = end + 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({
        type: "paren",
        value: char,
      });
      index += 1;
      continue;
    }

    if (char === ",") {
      tokens.push({ type: "comma" });
      index += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%") {
      tokens.push({
        type: "operator",
        value: char,
      });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported token: ${char}`);
  }

  return tokens;
};

const resolveExpressionPath = (
  path: string[],
  context: EngineeringDataContext,
): unknown => {
  const root: Record<string, unknown> = {
    rows: context.rows,
    ...context.values,
    data: context.data,
    items: context.items,
  };

  let current: unknown = root[path[0]];
  for (const segment of path.slice(1)) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const normalizeComputedNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Number(value.toFixed(12));
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  throw new Error("Expression operand is not numeric");
};

const toNonEmptyString = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const getValueAtPath = (value: unknown, path: string) => {
  let current = value;
  for (const segment of path.split(".")) {
    if (!segment) {
      throw new Error("Invalid field path");
    }
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const isEqualFilterValue = (left: unknown, right: unknown) => {
  if (Object.is(left, right)) {
    return true;
  }

  const leftIsNumericString =
    typeof left === "string" && left.trim() !== "" && !Number.isNaN(Number(left));
  const rightIsNumericString =
    typeof right === "string" &&
    right.trim() !== "" &&
    !Number.isNaN(Number(right));

  if (typeof left === "number" && rightIsNumericString) {
    return left === Number(right);
  }
  if (typeof right === "number" && leftIsNumericString) {
    return Number(left) === right;
  }
  return false;
};

const filterRows = (context: EngineeringDataContext, args: unknown[]) => {
  if (args.length % 2 !== 0) {
    throw new Error("Where arguments must be field/value pairs");
  }

  const conditions: {
    field: string;
    value: unknown;
  }[] = [];
  for (let index = 0; index < args.length; index += 2) {
    conditions.push({
      field: toNonEmptyString(args[index], `Condition field ${index / 2 + 1}`),
      value: args[index + 1],
    });
  }

  return context.rows.filter((item) =>
    conditions.every((condition) =>
      isEqualFilterValue(getValueAtPath(item, condition.field), condition.value),
    ),
  );
};

const getNumericFieldValues = (
  context: EngineeringDataContext,
  field: unknown,
  conditions: unknown[],
) => {
  const fieldPath = toNonEmptyString(field, "Value field");
  return filterRows(context, conditions).map((item) =>
    toNumber(getValueAtPath(item, fieldPath)),
  );
};

const evaluateBuiltInFunction = (
  callee: string,
  args: unknown[],
  context: EngineeringDataContext,
) => {
  switch (callee) {
    case "sumWhere": {
      if (args.length < 1) {
        throw new Error("sumWhere requires a value field");
      }
      return normalizeComputedNumber(
        getNumericFieldValues(context, args[0], args.slice(1)).reduce(
          (sum, value) => sum + value,
          0,
        ),
      );
    }
    case "countWhere":
      return filterRows(context, args).length;
    case "avgWhere": {
      if (args.length < 1) {
        throw new Error("avgWhere requires a value field");
      }
      const values = getNumericFieldValues(context, args[0], args.slice(1));
      if (!values.length) {
        return undefined;
      }
      return normalizeComputedNumber(
        values.reduce((sum, value) => sum + value, 0) / values.length,
      );
    }
    case "minWhere": {
      if (args.length < 1) {
        throw new Error("minWhere requires a value field");
      }
      const values = getNumericFieldValues(context, args[0], args.slice(1));
      if (!values.length) {
        return undefined;
      }
      return normalizeComputedNumber(Math.min(...values));
    }
    case "maxWhere": {
      if (args.length < 1) {
        throw new Error("maxWhere requires a value field");
      }
      const values = getNumericFieldValues(context, args[0], args.slice(1));
      if (!values.length) {
        return undefined;
      }
      return normalizeComputedNumber(Math.max(...values));
    }
    case "round": {
      if (args.length < 1 || args.length > 2) {
        throw new Error("round expects one or two arguments");
      }
      const value = toNumber(args[0]);
      const digits = args[1] === undefined ? 0 : Math.trunc(toNumber(args[1]));
      const factor = 10 ** digits;
      return normalizeComputedNumber(Math.round(value * factor) / factor);
    }
    default:
      throw new Error(`Unsupported function: ${callee}`);
  }
};

const evaluateExpressionNode = (
  node: ExpressionNode,
  context: EngineeringDataContext,
): unknown => {
  switch (node.type) {
    case "number":
      return node.value;
    case "string":
      return node.value;
    case "identifier":
      return resolveExpressionPath(node.path, context);
    case "call":
      return evaluateBuiltInFunction(
        node.callee,
        node.arguments.map((argument) =>
          evaluateExpressionNode(argument, context),
        ),
        context,
      );
    case "unary": {
      const value = toNumber(evaluateExpressionNode(node.argument, context));
      return node.operator === "-" ? -value : value;
    }
    case "binary": {
      const left = toNumber(evaluateExpressionNode(node.left, context));
      const right = toNumber(evaluateExpressionNode(node.right, context));

      switch (node.operator) {
        case "+":
          return normalizeComputedNumber(left + right);
        case "-":
          return normalizeComputedNumber(left - right);
        case "*":
          return normalizeComputedNumber(left * right);
        case "/":
          return normalizeComputedNumber(left / right);
        case "%":
          return normalizeComputedNumber(left % right);
      }
    }
  }
};

const evaluateExpression = (
  expression: string,
  context: EngineeringDataContext,
): unknown => {
  const parser = new ExpressionParser(tokenizeExpression(expression));
  return evaluateExpressionNode(parser.parse(), context);
};

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
      const resolvedValue = evaluateExpression(trimmedExpression, context);
      if (typeof resolvedValue === "undefined") {
        return match;
      }
      return stringifyResolvedValue(resolvedValue);
    } catch {
      return match;
    }
  });
};

const getEngineeringTemplate = (
  element: OrderedExcalidrawElement,
): string | null => {
  if (!isTextElement(element)) {
    return null;
  }

  if (element.originalText.includes("{{")) {
    return element.originalText;
  }

  const storedTemplate = element.customData?.engineeringTemplate;
  const storedRenderedText = element.customData?.engineeringRenderedText;
  if (
    isNonEmptyString(storedTemplate) &&
    ((isNonEmptyString(storedRenderedText) &&
      storedRenderedText === element.originalText) ||
      (!isNonEmptyString(storedRenderedText) &&
        element.originalText === element.text))
  ) {
    return storedTemplate;
  }
  return null;
};

export const applyEngineeringDataToTextElements = (
  elements: readonly OrderedExcalidrawElement[],
  context: EngineeringDataContext,
  options?: {
    skipElementIds?: ReadonlySet<string>;
  },
) => {
  let didChange = false;
  const nextElements = elements.slice();
  const elementsMap = new Map(
    nextElements.map((element) => [element.id, element]),
  );
  const elementIndexById = new Map(
    nextElements.map((element, index) => [element.id, index]),
  );

  nextElements.forEach((element, index) => {
    if (options?.skipElementIds?.has(element.id)) {
      return;
    }

    const template = getEngineeringTemplate(element);
    if (!template || !isTextElement(element)) {
      return;
    }

    const renderedText = renderEngineeringTemplate(template, context);
    const nextCustomData =
      element.customData?.engineeringTemplate === template &&
      element.customData?.engineeringRenderedText === renderedText
        ? element.customData
        : {
            ...element.customData,
            engineeringTemplate: template,
            engineeringRenderedText: renderedText,
          };

    let nextElement = newElementWith(element, {
      originalText: template,
      customData: nextCustomData,
    });

    let container = getContainerElement(nextElement, elementsMap);
    const dimensions = refreshTextDimensions(
      nextElement,
      container,
      elementsMap,
      renderedText,
    );

    if (dimensions) {
      nextElement = newElementWith(nextElement, dimensions);
    }

    if (container) {
      if (!isArrowElement(container)) {
        const targetContainerHeight = computeContainerDimensionForBoundText(
          nextElement.height,
          container.type,
        );

        if (container.height !== targetContainerHeight) {
          const nextContainer = newElementWith(container, {
            height: targetContainerHeight,
          }) as OrderedExcalidrawElement & ExcalidrawTextContainer;
          const containerIndex = elementIndexById.get(container.id);

          if (typeof containerIndex === "number") {
            nextElements[containerIndex] = nextContainer;
            elementsMap.set(nextContainer.id, nextContainer);
            container = nextContainer;
            didChange = true;
          }
        }
      }

      const textContainer = container as ExcalidrawTextContainer;
      nextElement = newElementWith(
        nextElement,
        computeBoundTextPosition(
          textContainer,
          nextElement as ExcalidrawTextElementWithContainer,
          elementsMap,
        ),
      );
    }

    if (nextElement !== element) {
      didChange = true;
      nextElements[index] = nextElement;
      elementsMap.set(nextElement.id, nextElement);
    }
  });

  return didChange ? nextElements : elements;
};

const emitEngineeringData = () => {
  listeners.forEach((listener) => listener(engineeringDataContext));
};

const rebuildEngineeringDataContext = () => {
  engineeringDataSnapshot = [
    ...engineeringDomainDataSnapshot,
    ...engineeringExternalDataSnapshot,
  ];
  engineeringDataContext = createEngineeringDataContext(engineeringDataSnapshot);
};

export const publishEngineeringData = (
  data: EngineeringData | EngineeringData[],
) => {
  engineeringExternalDataSnapshot = Array.isArray(data) ? data : [data];
  rebuildEngineeringDataContext();
  emitEngineeringData();
};

export const publishEngineeringDomainData = (
  data: EngineeringData | EngineeringData[],
) => {
  engineeringDomainDataSnapshot = Array.isArray(data) ? data : [data];
  rebuildEngineeringDataContext();
  emitEngineeringData();
};

export const subscribeEngineeringData = (
  listener: EngineeringDataListener,
  options?: {
    emitCurrent?: boolean;
  },
) => {
  listeners.add(listener);
  if (options?.emitCurrent !== false) {
    listener(engineeringDataContext);
  }

  return () => {
    listeners.delete(listener);
  };
};

export const createMockEngineeringDataFrame = (
  tick: number,
): EngineeringData[] => {
  const pressure = Number((12 + Math.sin(tick / 2) * 3).toFixed(2));
  const current = Number((3 + Math.cos(tick / 3)).toFixed(2));
  const lineLabels = ["08:00", "08:05", "08:10", "08:15", "08:20", "08:25"];
  const lineValues = lineLabels.map((_, index) =>
    Number((13 + Math.sin((tick + index) / 2) * 0.6 + index * 0.02).toFixed(2)),
  );
  const unitPowerLabels = ["1号机", "2号机", "3号机"];
  const unitPowerValues = unitPowerLabels.map((_, index) =>
    Math.round(620 + Math.sin((tick + index) / 3) * 18 + index * 6),
  );
  const auxRateLabels = ["引风机", "给水泵", "循环泵", "一次风机"];
  const auxRateValues = auxRateLabels.map((_, index) =>
    Number((2.5 + Math.cos((tick + index) / 2.4) * 0.25 + index * 0.18).toFixed(2)),
  );
  const fuelMixLabels = ["煤", "天然气", "生物质"];
  const fuelMixCoal = 58 + Math.sin(tick / 5) * 4;
  const fuelMixGas = 27 + Math.cos(tick / 6) * 3;
  const fuelMixBio = 100 - fuelMixCoal - fuelMixGas;
  const fuelMixValues = [fuelMixCoal, fuelMixGas, fuelMixBio].map((value) =>
    Number(value.toFixed(1)),
  );

  return [
    {
      uuid: "550e8400-e29b-41d4-a716-446655440000",
      alias: "pressure",
      name: "pressure",
      value: pressure,
      unit: "kPa",
      description: "Mock inlet pressure",
    },
    {
      uuid: "660e8400-e29b-41d4-a716-446655440000",
      alias: "current",
      name: "current",
      value: current,
      unit: "A",
      description: "Mock motor current",
    },
    {
      uuid: "770e8400-e29b-41d4-a716-446655440000",
      alias: "power",
      name: "power",
      value: Number((pressure * current).toFixed(2)),
      unit: "kW",
      description: "Mock computed power",
    },
    {
      id: "var:chart:main-steam-pressure:labels",
      alias: "plant.boiler.mainSteamPressure.labels",
      name: "mainSteamPressure.labels",
      value: JSON.stringify(lineLabels),
      description: "Mock chart labels for line chart",
    },
    {
      id: "var:chart:main-steam-pressure:values",
      alias: "plant.boiler.mainSteamPressure.values",
      name: "mainSteamPressure.values",
      value: JSON.stringify(lineValues),
      unit: "MPa",
      description: "Mock chart values for line chart",
    },
    {
      id: "var:chart:unit-power:labels",
      alias: "plant.units.power.labels",
      name: "units.power.labels",
      value: JSON.stringify(unitPowerLabels),
      description: "Mock chart labels for bar chart",
    },
    {
      id: "var:chart:unit-power:values",
      alias: "plant.units.power.values",
      name: "units.power.values",
      value: JSON.stringify(unitPowerValues),
      unit: "MW",
      description: "Mock chart values for bar chart",
    },
    {
      id: "var:chart:aux-rate:labels",
      alias: "plant.aux.rate.labels",
      name: "aux.rate.labels",
      value: JSON.stringify(auxRateLabels),
      description: "Mock chart labels for horizontal bar chart",
    },
    {
      id: "var:chart:aux-rate:values",
      alias: "plant.aux.rate.values",
      name: "aux.rate.values",
      value: JSON.stringify(auxRateValues),
      unit: "%",
      description: "Mock chart values for horizontal bar chart",
    },
    {
      id: "var:chart:fuel-mix:labels",
      alias: "plant.fuel.mix.labels",
      name: "fuel.mix.labels",
      value: JSON.stringify(fuelMixLabels),
      description: "Mock chart labels for pie chart",
    },
    {
      id: "var:chart:fuel-mix:values",
      alias: "plant.fuel.mix.values",
      name: "fuel.mix.values",
      value: JSON.stringify(fuelMixValues),
      unit: "%",
      description: "Mock chart values for pie chart",
    },
  ];
};

export const stopMockEngineeringDataFeed = () => {
  if (mockTimerId !== null) {
    window.clearInterval(mockTimerId);
    mockTimerId = null;
  }
};

export const startMockEngineeringDataFeed = (intervalMs = 1000) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  stopMockEngineeringDataFeed();

  let tick = 0;
  publishEngineeringData(createMockEngineeringDataFrame(tick));

  mockTimerId = window.setInterval(() => {
    tick += 1;
    publishEngineeringData(createMockEngineeringDataFrame(tick));
  }, intervalMs);

  return () => {
    stopMockEngineeringDataFeed();
  };
};

export const maybeStartEngineeringDataMockFromUrl = () => {
  if (typeof window === "undefined" || !import.meta.env.DEV) {
    return () => {};
  }

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get(MOCK_QUERY_PARAM) !== "1") {
    return () => {};
  }

  return startMockEngineeringDataFeed();
};

export const registerEngineeringDataDevTools = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.__EXCALIDRAW_ENGINEERING_DATA__ = {
    getSnapshot: () => engineeringDataSnapshot.slice(),
    publish: publishEngineeringData,
    startMock: startMockEngineeringDataFeed,
    stopMock: stopMockEngineeringDataFeed,
  };
};

export const resetEngineeringDataChannelForTests = () => {
  stopMockEngineeringDataFeed();
  engineeringExternalDataSnapshot = [];
  engineeringDomainDataSnapshot = [];
  engineeringDataSnapshot = [];
  engineeringDataContext = createEngineeringDataContext([]);
  listeners.clear();

  if (typeof window !== "undefined") {
    delete window.__EXCALIDRAW_ENGINEERING_DATA__;
  }
};

declare global {
  interface Window {
    __EXCALIDRAW_ENGINEERING_DATA__?: {
      getSnapshot: () => EngineeringData[];
      publish: (data: EngineeringData | EngineeringData[]) => void;
      startMock: (intervalMs?: number) => () => void;
      stopMock: () => void;
    };
  }
}
