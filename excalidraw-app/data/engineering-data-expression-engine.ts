import type { EngineeringDataContext } from "./engineeringData";

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

const IDENTIFIER_START = /^[$_\p{L}]$/u;
const IDENTIFIER_PART = /^[$_\p{L}\p{N}]$/u;

const isIdentifierStart = (char: string) => IDENTIFIER_START.test(char);
const isIdentifierPart = (char: string) => IDENTIFIER_PART.test(char);

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

export const evaluateEngineeringExpression = (
  expression: string,
  context: EngineeringDataContext,
): unknown => {
  const parser = new ExpressionParser(tokenizeExpression(expression));
  return evaluateExpressionNode(parser.parse(), context);
};
