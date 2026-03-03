import {
  computeBoundTextPosition,
  getContainerElement,
  isTextElement,
  newElementWith,
  refreshTextDimensions,
} from "@excalidraw/element";

import type {
  ExcalidrawTextElementWithContainer,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

type EngineeringPrimitive = number | string | boolean | null | undefined;

export interface EngineeringData {
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
  data: Record<string, EngineeringData>;
  items: Record<string, EngineeringData>;
  values: Record<string, EngineeringPrimitive>;
};

type ExpressionNode =
  | {
      type: "number";
      value: number;
    }
  | {
      type: "identifier";
      path: string[];
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
      type: "bracket";
      value: string;
    };

type EngineeringDataListener = (context: EngineeringDataContext) => void;

const TEMPLATE_PATTERN = /\{\{([\s\S]+?)\}\}/g;
const IDENTIFIER_START = /^[$_\p{L}]$/u;
const IDENTIFIER_PART = /^[$_\p{L}\p{N}]$/u;
const MOCK_QUERY_PARAM = "engineeringDataMock";

let engineeringDataSnapshot: EngineeringData[] = [];
let engineeringDataContext: EngineeringDataContext = {
  data: {},
  items: {},
  values: {},
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

const collectAliases = (item: EngineeringData) => {
  const aliases = new Set<string>();
  const candidates = [
    item.alias,
    item.name,
    item.name_cn,
    item.tpis_key,
    item.point_name,
    item.physical_entity_id,
    item.component_id,
    item.anchor_id,
    item.uuid,
  ];

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
  const context: EngineeringDataContext = {
    data: {},
    items: {},
    values: {},
  };

  items.forEach((item) => {
    if (isNonEmptyString(item.uuid)) {
      context.data[item.uuid] = item;
    }
    collectAliases(item).forEach((alias) => {
      context.items[alias] = item;
      context.values[alias] = item.value;
    });
  });

  return context;
};

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

    if (token.type === "identifier") {
      this.consume();
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

const evaluateExpressionNode = (
  node: ExpressionNode,
  context: EngineeringDataContext,
): unknown => {
  switch (node.type) {
    case "number":
      return node.value;
    case "identifier":
      return resolveExpressionPath(node.path, context);
    case "unary": {
      const value = toNumber(evaluateExpressionNode(node.argument, context));
      return node.operator === "-" ? -value : value;
    }
    case "binary": {
      const left = toNumber(evaluateExpressionNode(node.left, context));
      const right = toNumber(evaluateExpressionNode(node.right, context));

      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
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
  const elementsMap = new Map(elements.map((element) => [element.id, element]));

  const nextElements = elements.map((element) => {
    if (options?.skipElementIds?.has(element.id)) {
      return element;
    }

    const template = getEngineeringTemplate(element);
    if (!template || !isTextElement(element)) {
      return element;
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

    const container = getContainerElement(nextElement, elementsMap);
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
      nextElement = newElementWith(
        nextElement,
        computeBoundTextPosition(
          container,
          nextElement as ExcalidrawTextElementWithContainer,
          elementsMap,
        ),
      );
    }

    if (nextElement !== element) {
      didChange = true;
    }

    return nextElement;
  });

  return didChange ? nextElements : elements;
};

const emitEngineeringData = () => {
  listeners.forEach((listener) => listener(engineeringDataContext));
};

export const publishEngineeringData = (
  data: EngineeringData | EngineeringData[],
) => {
  engineeringDataSnapshot = Array.isArray(data) ? data : [data];
  engineeringDataContext = createEngineeringDataContext(engineeringDataSnapshot);
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

const createMockEngineeringDataFrame = (tick: number): EngineeringData[] => {
  const pressure = Number((12 + Math.sin(tick / 2) * 3).toFixed(2));
  const current = Number((3 + Math.cos(tick / 3)).toFixed(2));

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
