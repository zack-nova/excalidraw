import {
  isArrowElement,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  FixedPoint,
  FixedPointBinding,
} from "@excalidraw/element/types";

import type {
  AnchorEntity,
  ComponentEntity,
  DiagnosticIssue,
  PipeEntity,
  ProjectDocument,
  SceneBindingState,
  TopologyState,
} from "./engineering-domain";

const ENGINEERING_COMPONENT_FLAG = "isEngineeringComponent";
const ENGINEERING_COMPONENT_GROUP_ID = "engineeringComponentGroupId";
const FIXED_POINT_EPSILON = 0.0001;
const DYNAMIC_ANCHOR_KEY_PREFIX = "dynamic:";
const ENGINEERING_COMPONENT_ELEMENT_TYPES = new Set<
  ExcalidrawElement["type"]
>(["image", "rectangle", "diamond", "ellipse"]);

type AnchorDefinition = {
  id: string;
  key: string;
  name?: string;
  direction?: AnchorEntity["direction"];
  medium?: string;
  position: FixedPoint;
};

type StructureTreeItem = {
  entityId: string;
  label: string;
  detail?: string;
  childLabels?: string[];
  elementIds: string[];
};

export interface EngineeringStructureTree {
  components: StructureTreeItem[];
  pipes: StructureTreeItem[];
}

export interface EngineeringModelingProjection {
  scene: SceneBindingState;
  topology: TopologyState;
  structureTree: EngineeringStructureTree;
  diagnostics: DiagnosticIssue[];
}

export type EngineeringTopologyValidationRule = (
  projection: EngineeringModelingProjection,
) => DiagnosticIssue[];

export const ENGINEERING_TOPOLOGY_VALIDATION_RULES: readonly EngineeringTopologyValidationRule[] =
  [];

const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeFixedPoint = (value: unknown): FixedPoint | null => {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const x = toFiniteNumber(value[0]);
  const y = toFiniteNumber(value[1]);

  return x === null || y === null ? null : [x, y];
};

const fixedPointsEqual = (left: FixedPoint, right: FixedPoint) =>
  Math.abs(left[0] - right[0]) <= FIXED_POINT_EPSILON &&
  Math.abs(left[1] - right[1]) <= FIXED_POINT_EPSILON;

const getElementCustomData = (element: ExcalidrawElement) =>
  isRecord(element.customData) ? element.customData : null;

const getComponentRecord = (element: ExcalidrawElement) => {
  const customData = getElementCustomData(element);
  const component = customData?.component;

  return isRecord(component) ? component : null;
};

const getComponentDataRecord = (element: ExcalidrawElement) => {
  const component = getComponentRecord(element);
  const data = component?.data;

  return isRecord(data) ? data : null;
};

const getEngineeringComponentFlag = (element: ExcalidrawElement) => {
  const customData = getElementCustomData(element);
  const component = getComponentRecord(element);

  if (typeof customData?.[ENGINEERING_COMPONENT_FLAG] === "boolean") {
    return customData[ENGINEERING_COMPONENT_FLAG] as boolean;
  }

  if (typeof component?.[ENGINEERING_COMPONENT_FLAG] === "boolean") {
    return component[ENGINEERING_COMPONENT_FLAG] as boolean;
  }

  return false;
};

const getEngineeringComponentGroupId = (element: ExcalidrawElement) => {
  const customData = getElementCustomData(element);
  const component = getComponentRecord(element);

  if (typeof customData?.[ENGINEERING_COMPONENT_GROUP_ID] === "string") {
    return customData[ENGINEERING_COMPONENT_GROUP_ID] as string;
  }

  if (typeof component?.[ENGINEERING_COMPONENT_GROUP_ID] === "string") {
    return component[ENGINEERING_COMPONENT_GROUP_ID] as string;
  }

  return null;
};

const isEngineeringComponentElement = (element: ExcalidrawElement) =>
  !element.isDeleted &&
  ENGINEERING_COMPONENT_ELEMENT_TYPES.has(element.type) &&
  getEngineeringComponentFlag(element);

const getComponentDisplayName = (element: ExcalidrawElement) => {
  const data = getComponentDataRecord(element);

  return (
    data?.name_cn ||
    data?.name ||
    data?.component_type ||
    (element.type !== "image" ? element.type : null) ||
    getComponentRecord(element)?.id ||
    element.id
  );
};

const getComponentTemplateKey = (element: ExcalidrawElement) =>
  getComponentDataRecord(element)?.component_type;

const getAnchorDefinitionsFromComponent = (
  element: ExcalidrawElement,
): AnchorDefinition[] => {
  const data = getComponentDataRecord(element);
  const anchors = Array.isArray(data?.anchors) ? data.anchors : [];

  const anchorDefinitions = anchors.flatMap((anchor, index) => {
    if (!isRecord(anchor) || !isRecord(anchor.position) || !isRecord(anchor.data)) {
      return [];
    }

    const x = toFiniteNumber(anchor.position.x);
    const y = toFiniteNumber(anchor.position.y);

    if (x === null || y === null) {
      return [];
    }

    const direction: AnchorEntity["direction"] =
      anchor.data.connection_type === "inlet"
        ? "inlet"
        : anchor.data.connection_type === "outlet"
        ? "outlet"
        : "bidirectional";

    return [
      {
        id:
          (typeof anchor.uuid === "string" && anchor.uuid) ||
          (typeof anchor.id === "string" && anchor.id) ||
          `${index}`,
        key:
          (typeof anchor.data.interface_type === "string" &&
            anchor.data.interface_type) ||
          `${index}`,
        name:
          (typeof anchor.data.name_cn === "string" && anchor.data.name_cn) ||
          (typeof anchor.data.name === "string" && anchor.data.name) ||
          undefined,
        direction,
        medium:
          typeof anchor.data.material_type === "string"
            ? anchor.data.material_type
            : undefined,
        position: [x, y] as FixedPoint,
      },
    ];
  });

  if (anchorDefinitions.length > 0) {
    return anchorDefinitions;
  }

  const customData = getElementCustomData(element);
  const anchorPoints = Array.isArray(customData?.anchorPoints)
    ? customData.anchorPoints
    : [];

  return anchorPoints.flatMap((anchorPoint, index) => {
    const fixedPoint = normalizeFixedPoint(anchorPoint);

    return fixedPoint
      ? [
          {
            id: `${index}`,
            key: `${index}`,
            name: `Anchor ${index + 1}`,
            direction: "bidirectional" as const,
            position: fixedPoint,
          },
        ]
      : [];
  });
};

const resolveAnchorIdFromBinding = (
  componentAnchors: AnchorDefinition[],
  binding: FixedPointBinding | null | undefined,
) => {
  if (!binding) {
    return null;
  }

  const anchor = componentAnchors.find((candidate) =>
    fixedPointsEqual(candidate.position, binding.fixedPoint),
  );

  return anchor ? anchor.id : null;
};

const getDynamicAnchorId = (elementId: string, point: FixedPoint) =>
  `${DYNAMIC_ANCHOR_KEY_PREFIX}${elementId}:${point[0].toFixed(4)}:${point[1].toFixed(4)}`;

export const isDynamicEngineeringAnchor = (
  anchor: Pick<AnchorEntity, "key"> | null | undefined,
) =>
  typeof anchor?.key === "string" &&
  anchor.key.startsWith(DYNAMIC_ANCHOR_KEY_PREFIX);

const mergeDynamicAnchors = (
  element: ExcalidrawElement,
  anchorDefinitions: AnchorDefinition[],
  dynamicAnchorPoints: readonly FixedPoint[],
) => {
  const merged = [...anchorDefinitions];

  dynamicAnchorPoints.forEach((point) => {
    if (merged.some((anchor) => fixedPointsEqual(anchor.position, point))) {
      return;
    }

    merged.push({
      id: getDynamicAnchorId(element.id, point),
      key: `dynamic:${point[0].toFixed(4)}:${point[1].toFixed(4)}`,
      name: undefined,
      direction: "bidirectional",
      position: point,
    });
  });

  return merged;
};

const getComponentOwnerKey = (element: ExcalidrawElement) => {
  const engineeringGroupId = getEngineeringComponentGroupId(element);

  return engineeringGroupId ? `group:${engineeringGroupId}` : element.id;
};

const getVisibleAnchorIds = (
  component: ComponentEntity,
  topology: TopologyState,
) =>
  component.anchorIds.filter((anchorId) => {
    const anchorEntity = topology.anchorsById[anchorId];
    return !!anchorEntity && !isDynamicEngineeringAnchor(anchorEntity);
  });

const createStructureTree = (topology: TopologyState): EngineeringStructureTree => {
  const components = Object.values(topology.componentsById).map((component) => {
    const visibleAnchorIds = getVisibleAnchorIds(component, topology);

    return {
      entityId: component.id,
      label: component.name || component.templateKey || component.id,
      detail: `${visibleAnchorIds.length} anchors`,
      childLabels: visibleAnchorIds.map((anchorId) => {
        const anchor = topology.anchorsById[anchorId];

        return anchor?.name || anchor?.key || anchorId;
      }),
      elementIds: Array.isArray(component.props.elementIds)
        ? (component.props.elementIds as string[]).filter(Boolean)
        : typeof component.props.elementId === "string"
          ? [component.props.elementId]
          : [],
    };
  });
  const pipes = Object.values(topology.pipesById).map((pipe) => {
    const sourceAnchor = topology.anchorsById[pipe.fromAnchorId];
    const targetAnchor = topology.anchorsById[pipe.toAnchorId];
    const sourceComponent = sourceAnchor
      ? topology.componentsById[sourceAnchor.componentId]
      : null;
    const targetComponent = targetAnchor
      ? topology.componentsById[targetAnchor.componentId]
      : null;

    return {
      entityId: pipe.id,
      label: pipe.name || pipe.id,
      detail: `${sourceComponent?.name || sourceComponent?.id || "Unknown"} -> ${
        targetComponent?.name || targetComponent?.id || "Unknown"
      }`,
      childLabels: [
        sourceAnchor?.name || sourceAnchor?.key || pipe.fromAnchorId,
        targetAnchor?.name || targetAnchor?.key || pipe.toAnchorId,
      ],
      elementIds:
        typeof pipe.props.elementId === "string" ? [pipe.props.elementId] : [],
    };
  });

  return {
    components,
    pipes,
  };
};

export const validateEngineeringTopology = (
  projection: EngineeringModelingProjection,
  rules: readonly EngineeringTopologyValidationRule[] = ENGINEERING_TOPOLOGY_VALIDATION_RULES,
) => rules.flatMap((rule) => rule(projection));

export const buildEngineeringModelingProjection = (
  project: ProjectDocument,
  elements: readonly ExcalidrawElement[],
): EngineeringModelingProjection => {
  const componentsById: Record<string, ComponentEntity> = {};
  const anchorsById: Record<string, AnchorEntity> = {};
  const pipesById: Record<string, PipeEntity> = {};
  const elementBindings: SceneBindingState["elementBindings"] = {};
  const anchorsByElementId: Record<
    string,
    {
      ownerKey: string;
      anchors: AnchorDefinition[];
    }
  > = {};
  const componentElementsByOwnerKey = new Map<string, ExcalidrawElement[]>();
  const componentOwnerKeyByElementId: Record<string, string> = {};
  const dynamicAnchorPointsByElementId: Record<string, FixedPoint[]> = {};

  for (const element of elements) {
    if (!isEngineeringComponentElement(element)) {
      continue;
    }

    const ownerKey = getComponentOwnerKey(element);
    const currentElements = componentElementsByOwnerKey.get(ownerKey) || [];

    currentElements.push(element);
    componentElementsByOwnerKey.set(ownerKey, currentElements);
    componentOwnerKeyByElementId[element.id] = ownerKey;
  }

  const registerDynamicAnchorPoint = (
    binding: FixedPointBinding | null | undefined,
  ) => {
    if (!binding || !componentOwnerKeyByElementId[binding.elementId]) {
      return;
    }

    const currentPoints = dynamicAnchorPointsByElementId[binding.elementId] || [];

    if (
      currentPoints.some((candidate) =>
        fixedPointsEqual(candidate, binding.fixedPoint),
      )
    ) {
      return;
    }

    dynamicAnchorPointsByElementId[binding.elementId] = [
      ...currentPoints,
      binding.fixedPoint,
    ];
  };

  for (const element of elements) {
    if (!isArrowElement(element)) {
      continue;
    }

    registerDynamicAnchorPoint(element.startBinding);
    registerDynamicAnchorPoint(element.endBinding);
  }

  for (const [ownerKey, ownerElements] of componentElementsByOwnerKey.entries()) {
    const primaryElement = ownerElements[0];
    const componentId = `component:${ownerKey}`;
    const componentName = ownerElements
      .map((element) => getComponentDisplayName(element))
      .find(Boolean);
    const templateKey = ownerElements
      .map((element) => getComponentTemplateKey(element))
      .find(Boolean);
    const anchorIds: string[] = [];
    const engineeringGroupId = getEngineeringComponentGroupId(primaryElement);

    componentsById[componentId] = {
      id: componentId,
      templateKey,
      name: componentName,
      anchorIds,
      props: {
        elementId: primaryElement.id,
        elementIds: ownerElements.map((element) => element.id),
        ...(engineeringGroupId
          ? {
              groupId: engineeringGroupId,
            }
          : {}),
        [ENGINEERING_COMPONENT_FLAG]: true,
      },
    };

    ownerElements.forEach((element) => {
      const anchorDefinitions = mergeDynamicAnchors(
        element,
        getAnchorDefinitionsFromComponent(element),
        dynamicAnchorPointsByElementId[element.id] || [],
      );

      anchorsByElementId[element.id] = {
        ownerKey,
        anchors: anchorDefinitions,
      };
      elementBindings[element.id] = {
        elementId: element.id,
        target: {
          kind: "component",
          id: componentId,
        },
      };

      anchorDefinitions.forEach((anchor, index) => {
        const anchorId = `anchor:${ownerKey}:${element.id}:${anchor.id}`;

        anchorsById[anchorId] = {
          id: anchorId,
          componentId,
          key: anchor.key || `${index}`,
          name: anchor.name,
          direction: anchor.direction,
          medium: anchor.medium,
        };
        anchorIds.push(anchorId);
      });
    });
  }

  for (const element of elements) {
    if (!isArrowElement(element)) {
      continue;
    }

    const startBinding = element.startBinding;
    const endBinding = element.endBinding;

    if (!startBinding || !endBinding) {
      continue;
    }

    const sourceAnchors = anchorsByElementId[startBinding.elementId];
    const targetAnchors = anchorsByElementId[endBinding.elementId];

    if (!sourceAnchors || !targetAnchors) {
      continue;
    }

    const fromAnchorKey = resolveAnchorIdFromBinding(
      sourceAnchors.anchors,
      startBinding,
    );
    const toAnchorKey = resolveAnchorIdFromBinding(targetAnchors.anchors, endBinding);

    if (!fromAnchorKey || !toAnchorKey) {
      continue;
    }

    const pipeId = `pipe:${element.id}`;
    const fromAnchorId = `anchor:${sourceAnchors.ownerKey}:${startBinding.elementId}:${fromAnchorKey}`;
    const toAnchorId = `anchor:${targetAnchors.ownerKey}:${endBinding.elementId}:${toAnchorKey}`;

    pipesById[pipeId] = {
      id: pipeId,
      fromAnchorId,
      toAnchorId,
      name: pipeId,
      medium:
        anchorsById[fromAnchorId]?.medium || anchorsById[toAnchorId]?.medium,
      props: {
        elementId: element.id,
      },
    };
    elementBindings[element.id] = {
      elementId: element.id,
      target: {
        kind: "pipe",
        id: pipeId,
      },
    };
  }

  const topology: TopologyState = {
    projectNode: project.topology.projectNode,
    environmentNode: project.topology.environmentNode,
    componentsById,
    anchorsById,
    pipesById,
  };
  const projection: EngineeringModelingProjection = {
    scene: {
      sceneId: project.scene.sceneId,
      elementBindings,
    },
    topology,
    structureTree: createStructureTree(topology),
    diagnostics: [],
  };

  return {
    ...projection,
    diagnostics: validateEngineeringTopology(projection),
  };
};

export const isEngineeringModelingProjectionInSync = (
  project: ProjectDocument,
  projection: EngineeringModelingProjection,
) =>
  JSON.stringify(project.scene) === JSON.stringify(projection.scene) &&
  JSON.stringify(project.topology) === JSON.stringify(projection.topology);
