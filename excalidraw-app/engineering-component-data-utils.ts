export type ParsedEngineeringAnchor = {
  id: string;
  name: string;
  materialType: string | null;
  position: {
    x: number;
    y: number;
  } | null;
};

export type ParsedEngineeringComponent = {
  componentType: string;
  name: string | null;
  nameCn: string | null;
  anchors: ParsedEngineeringAnchor[];
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const getFirstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
};

export const normalizeLookupKey = (value: string) => value.trim().toLowerCase();

export const parseEngineeringAnchor = (
  anchorValue: unknown,
  index: number,
): ParsedEngineeringAnchor | null => {
  if (!isRecord(anchorValue)) {
    return null;
  }

  const anchorData = isRecord(anchorValue.data) ? anchorValue.data : {};
  const anchorId =
    getFirstNonEmptyString(anchorValue.id, anchorValue.uuid) ||
    `anchor:${index + 1}`;
  const anchorName =
    getFirstNonEmptyString(
      anchorData.name_cn,
      anchorData.name,
      anchorValue.name_cn,
      anchorValue.name,
      anchorId,
    ) || `Anchor ${index + 1}`;
  const materialType = getFirstNonEmptyString(anchorData.material_type);
  const position =
    isRecord(anchorValue.position) &&
    typeof anchorValue.position.x === "number" &&
    typeof anchorValue.position.y === "number"
      ? {
          x: anchorValue.position.x,
          y: anchorValue.position.y,
        }
      : null;

  return {
    id: anchorId,
    name: anchorName,
    materialType,
    position,
  };
};

export const parseEngineeringComponent = (
  componentValue: unknown,
): ParsedEngineeringComponent | null => {
  if (!isRecord(componentValue) || !isRecord(componentValue.data)) {
    return null;
  }

  const data = componentValue.data;
  const componentType = getFirstNonEmptyString(
    data.componentType,
    data.component_type,
  );
  if (!componentType) {
    return null;
  }

  const anchors = Array.isArray(data.anchors)
    ? data.anchors
        .map((anchor, index) => parseEngineeringAnchor(anchor, index))
        .filter((anchor): anchor is ParsedEngineeringAnchor => !!anchor)
    : [];

  return {
    componentType,
    name: getFirstNonEmptyString(data.name),
    nameCn: getFirstNonEmptyString(data.nameCn, data.name_cn),
    anchors,
  };
};
