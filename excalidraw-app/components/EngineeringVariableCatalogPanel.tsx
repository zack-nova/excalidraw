import { useState } from "react";

import { useAtomValue, useSetAtom } from "../app-jotai";
import type {
  EntityKind,
  ProjectDocument,
  ValueProvider,
  VariableDef,
} from "../engineering-domain";
import {
  applyEngineeringProjectMutationAtom,
  engineeringProjectDocumentAtom,
} from "../engineering-domain-state";

import "./EngineeringVariableCatalogPanel.scss";

const VARIABLE_INSPECTOR_PATH = "/engineering-variable-catalog-inspector";
const VARIABLE_INSPECTOR_STORAGE_KEY_PREFIX =
  "engineering-variable-catalog-inspector:";

type OwnerFilter = "all" | "global" | "component" | "anchor" | "pipe";
type SourceFilter = "all" | "sensor" | "manual" | "expression" | "backend";

type OwnerFilterKind = Exclude<OwnerFilter, "all">;
type SourceFilterKind = Exclude<SourceFilter, "all">;

type VariableCatalogRow = {
  variable: VariableDef;
  ownerFilterKind: OwnerFilterKind;
  ownerLabel: string;
  sourceKinds: ValueProvider["kind"][];
  sourceLabel: string;
};

const OWNER_FILTER_LABELS: Record<OwnerFilterKind, string> = {
  global: "全局",
  component: "组件",
  anchor: "锚点",
  pipe: "管段",
};

const SOURCE_FILTER_LABELS: Record<SourceFilterKind, string> = {
  sensor: "测点",
  manual: "手输",
  expression: "前端公式",
  backend: "后端结果",
};

const SOURCE_ORDER: SourceFilterKind[] = [
  "sensor",
  "manual",
  "expression",
  "backend",
];

const getFirstNonEmptyString = (...values: (string | undefined)[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const mapOwnerKindToFilterKind = (ownerKind: EntityKind): OwnerFilterKind => {
  switch (ownerKind) {
    case "component":
      return "component";
    case "anchor":
      return "anchor";
    case "pipe":
      return "pipe";
    default:
      return "global";
  }
};

const getOwnerTargetName = (project: ProjectDocument, variable: VariableDef) => {
  switch (variable.owner.kind) {
    case "project":
      return getFirstNonEmptyString(
        project.meta.name,
        project.topology.projectNode.name,
        variable.owner.id,
      );
    case "environment":
      return getFirstNonEmptyString(
        project.topology.environmentNode.name,
        variable.owner.id,
      );
    case "component":
      return getFirstNonEmptyString(
        project.topology.componentsById[variable.owner.id]?.name,
        variable.owner.id,
      );
    case "anchor":
      return getFirstNonEmptyString(
        project.topology.anchorsById[variable.owner.id]?.name,
        project.topology.anchorsById[variable.owner.id]?.key,
        variable.owner.id,
      );
    case "pipe":
      return getFirstNonEmptyString(
        project.topology.pipesById[variable.owner.id]?.name,
        variable.owner.id,
      );
    default:
      return getFirstNonEmptyString(variable.owner.id);
  }
};

const getProviderKindsForVariable = (
  project: ProjectDocument,
  variableId: string,
) => {
  const catalog = project.variableCatalog;
  const explicitProviderIds = catalog.providerIdsByVariableId[variableId] ?? [];
  const fallbackProviderIds = Object.values(catalog.providersById)
    .filter((provider) => provider.variableId === variableId)
    .map((provider) => provider.id);
  const providerIds =
    explicitProviderIds.length > 0 ? explicitProviderIds : fallbackProviderIds;

  const providerKinds = new Set<ValueProvider["kind"]>();

  providerIds.forEach((providerId) => {
    const provider = catalog.providersById[providerId];
    if (!provider || provider.disabled) {
      return;
    }
    providerKinds.add(provider.kind);
  });

  return SOURCE_ORDER.filter((kind) => providerKinds.has(kind));
};

const getSourceLabel = (sourceKinds: ValueProvider["kind"][]) => {
  if (sourceKinds.length === 0) {
    return "未配置";
  }

  return sourceKinds
    .map((sourceKind) => SOURCE_FILTER_LABELS[sourceKind as SourceFilterKind])
    .join(" / ");
};

const buildVariableCatalogRows = (project: ProjectDocument): VariableCatalogRow[] =>
  Object.values(project.variableCatalog.variablesById)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((variable) => {
      const ownerFilterKind = mapOwnerKindToFilterKind(variable.owner.kind);
      const ownerTargetName = getOwnerTargetName(project, variable);
      const sourceKinds = getProviderKindsForVariable(project, variable.id);

      return {
        variable,
        ownerFilterKind,
        ownerLabel: ownerTargetName
          ? `${OWNER_FILTER_LABELS[ownerFilterKind]} · ${ownerTargetName}`
          : OWNER_FILTER_LABELS[ownerFilterKind],
        sourceKinds,
        sourceLabel: getSourceLabel(sourceKinds),
      };
    });

const buildInspectorUrl = (snapshotKey: string) => {
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = VARIABLE_INSPECTOR_PATH;
  nextUrl.search = "";
  nextUrl.hash = "";
  nextUrl.searchParams.set("snapshotKey", snapshotKey);
  return nextUrl.toString();
};

const persistVariableInspectorSnapshot = (
  project: ProjectDocument,
  snapshotKey: string,
) => {
  const snapshotPayload = {
    version: 1,
    generatedAt: Date.now(),
    project: {
      id: project.id,
      meta: project.meta,
      revisions: project.revisions,
      topology: project.topology,
      variableCatalog: project.variableCatalog,
    },
  };

  localStorage.setItem(
    `${VARIABLE_INSPECTOR_STORAGE_KEY_PREFIX}${snapshotKey}`,
    JSON.stringify(snapshotPayload),
  );
};

export const EngineeringVariableCatalogPanel = () => {
  const project = useAtomValue(engineeringProjectDocumentAtom);
  const applyProjectMutation = useSetAtom(applyEngineeringProjectMutationAtom);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [draftNameByVariableId, setDraftNameByVariableId] = useState<
    Record<string, string>
  >({});

  const variableRows = buildVariableCatalogRows(project);
  const filteredRows = variableRows.filter((row) => {
    const ownerMatches =
      ownerFilter === "all" || row.ownerFilterKind === ownerFilter;
    if (!ownerMatches) {
      return false;
    }

    if (sourceFilter === "all") {
      return true;
    }

    return row.sourceKinds.includes(sourceFilter);
  });

  const saveVariableName = (variableId: string) => {
    const currentVariable = project.variableCatalog.variablesById[variableId];
    if (!currentVariable) {
      return;
    }

    const nextName = draftNameByVariableId[variableId] ?? currentVariable.name;
    if (nextName === currentVariable.name) {
      return;
    }

    applyProjectMutation({
      scope: "schema",
      updater: (current) => {
        const targetVariable = current.variableCatalog.variablesById[variableId];
        if (!targetVariable) {
          return current;
        }

        return {
          ...current,
          variableCatalog: {
            ...current.variableCatalog,
            variablesById: {
              ...current.variableCatalog.variablesById,
              [variableId]: {
                ...targetVariable,
                name: nextName,
              },
            },
          },
        };
      },
    });
  };

  const openFullFieldInspector = () => {
    const snapshotKey = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    try {
      persistVariableInspectorSnapshot(project, snapshotKey);
    } catch (error) {
      // If storage is unavailable, still open the inspector page.
    }

    window.open(buildInspectorUrl(snapshotKey), "_blank", "noopener");
  };

  return (
    <div
      className="engineering-variable-catalog"
      data-testid="engineering-variable-catalog"
    >
      <div className="engineering-variable-catalog__header">
        <h3 className="engineering-variable-catalog__title">变量列表</h3>
        <div className="engineering-variable-catalog__headerActions">
          <span className="engineering-variable-catalog__summary">
            {filteredRows.length} / {variableRows.length}
          </span>
          <button
            aria-label="打开变量完整字段页面"
            className="engineering-variable-catalog__inspectorButton"
            data-testid="engineering-variable-open-inspector"
            onClick={openFullFieldInspector}
            type="button"
          >
            查看完整字段
          </button>
        </div>
      </div>

      <div className="engineering-variable-catalog__filters">
        <label className="engineering-variable-catalog__filter">
          <span>所属对象</span>
          <select
            aria-label="变量筛选-所属对象"
            className="engineering-variable-catalog__select"
            value={ownerFilter}
            onChange={(event) =>
              setOwnerFilter(event.target.value as OwnerFilter)
            }
          >
            <option value="all">全部</option>
            <option value="global">全局</option>
            <option value="component">组件</option>
            <option value="anchor">锚点</option>
            <option value="pipe">管段</option>
          </select>
        </label>
        <label className="engineering-variable-catalog__filter">
          <span>来源</span>
          <select
            aria-label="变量筛选-来源"
            className="engineering-variable-catalog__select"
            value={sourceFilter}
            onChange={(event) =>
              setSourceFilter(event.target.value as SourceFilter)
            }
          >
            <option value="all">全部</option>
            <option value="sensor">测点</option>
            <option value="manual">手输</option>
            <option value="expression">前端公式</option>
            <option value="backend">后端结果</option>
          </select>
        </label>
      </div>

      <div className="engineering-variable-catalog__table">
        <div className="engineering-variable-catalog__tableHeader">
          <div>变量名</div>
          <div>所属对象</div>
          <div>来源</div>
          <div>编辑</div>
        </div>
        {filteredRows.length > 0 ? (
          filteredRows.map((row) => {
            const draftName =
              draftNameByVariableId[row.variable.id] ?? row.variable.name;

            return (
              <div
                className="engineering-variable-catalog__tableRow"
                data-testid={`engineering-variable-row-${row.variable.id}`}
                key={row.variable.id}
              >
                <div className="engineering-variable-catalog__name">
                  {row.variable.name}
                </div>
                <div className="engineering-variable-catalog__owner">
                  {row.ownerLabel}
                </div>
                <div className="engineering-variable-catalog__source">
                  {row.sourceLabel}
                </div>
                <div className="engineering-variable-catalog__editor">
                  <input
                    aria-label={`变量名称输入-${row.variable.id}`}
                    className="engineering-variable-catalog__input"
                    onChange={(event) =>
                      setDraftNameByVariableId((current) => ({
                        ...current,
                        [row.variable.id]: event.target.value,
                      }))
                    }
                    type="text"
                    value={draftName}
                  />
                  <button
                    aria-label={`保存变量-${row.variable.id}`}
                    className="engineering-variable-catalog__saveButton"
                    onClick={() => saveVariableName(row.variable.id)}
                    type="button"
                  >
                    保存
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="engineering-variable-catalog__empty">暂无变量</div>
        )}
      </div>
    </div>
  );
};
