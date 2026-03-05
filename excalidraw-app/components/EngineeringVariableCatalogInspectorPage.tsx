import { useMemo } from "react";

import "./EngineeringVariableCatalogInspectorPage.scss";

const VARIABLE_INSPECTOR_STORAGE_KEY_PREFIX =
  "engineering-variable-catalog-inspector:";

type InspectorSnapshot = {
  version: number;
  generatedAt: number;
  project: {
    id: string;
    meta: {
      name: string;
      createdAt: number;
      updatedAt: number;
    };
    revisions: {
      modelVersion: number;
      schemaVersion: number;
      displayVersion: number;
    };
    topology: unknown;
    variableCatalog: unknown;
  };
};

type LoadedSnapshot =
  | {
      key: string;
      snapshot: InspectorSnapshot;
    }
  | {
      key: string | null;
      error: string;
    };

const formatTime = (value: number) =>
  Number.isFinite(value)
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "--";

const loadSnapshotFromStorage = (): LoadedSnapshot => {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("snapshotKey");

  if (!key) {
    return {
      key: null,
      error: "缺少 snapshotKey，无法读取变量快照。",
    };
  }

  const rawValue = localStorage.getItem(
    `${VARIABLE_INSPECTOR_STORAGE_KEY_PREFIX}${key}`,
  );

  if (!rawValue) {
    return {
      key,
      error:
        "未找到对应的快照数据，可能是浏览器本地存储被清理，或从其他设备打开了链接。",
    };
  }

  try {
    const snapshot = JSON.parse(rawValue) as InspectorSnapshot;
    return {
      key,
      snapshot,
    };
  } catch (error) {
    return {
      key,
      error: "快照解析失败，数据格式不正确。",
    };
  }
};

export const EngineeringVariableCatalogInspectorPage = () => {
  const loadedSnapshot = useMemo(loadSnapshotFromStorage, []);

  return (
    <main
      className="engineering-variable-inspector-page"
      data-testid="engineering-variable-inspector-page"
    >
      <header className="engineering-variable-inspector-page__header">
        <h1>变量完整字段查看（临时）</h1>
        <a
          className="engineering-variable-inspector-page__back"
          href="/"
          rel="noreferrer"
        >
          返回画布
        </a>
      </header>

      {"error" in loadedSnapshot ? (
        <section className="engineering-variable-inspector-page__card">
          <h2>快照加载失败</h2>
          <p>{loadedSnapshot.error}</p>
          <p>snapshotKey: {loadedSnapshot.key || "--"}</p>
        </section>
      ) : (
        <>
          <section className="engineering-variable-inspector-page__card">
            <h2>快照信息</h2>
            <div>
              <strong>projectId:</strong> {loadedSnapshot.snapshot.project.id}
            </div>
            <div>
              <strong>projectName:</strong> {loadedSnapshot.snapshot.project.meta.name}
            </div>
            <div>
              <strong>generatedAt:</strong>{" "}
              {formatTime(loadedSnapshot.snapshot.generatedAt)}
            </div>
            <div>
              <strong>snapshotKey:</strong> {loadedSnapshot.key}
            </div>
          </section>

          <section className="engineering-variable-inspector-page__card">
            <h2>variableCatalog.variablesById（完整字段）</h2>
            <pre className="engineering-variable-inspector-page__json">
              {JSON.stringify(
                (loadedSnapshot.snapshot.project.variableCatalog as any)
                  .variablesById,
                null,
                2,
              )}
            </pre>
          </section>

          <section className="engineering-variable-inspector-page__card">
            <h2>variableCatalog.providersById（完整字段）</h2>
            <pre className="engineering-variable-inspector-page__json">
              {JSON.stringify(
                (loadedSnapshot.snapshot.project.variableCatalog as any)
                  .providersById,
                null,
                2,
              )}
            </pre>
          </section>

          <section className="engineering-variable-inspector-page__card">
            <h2>variableCatalog.providerIdsByVariableId（完整字段）</h2>
            <pre className="engineering-variable-inspector-page__json">
              {JSON.stringify(
                (loadedSnapshot.snapshot.project.variableCatalog as any)
                  .providerIdsByVariableId,
                null,
                2,
              )}
            </pre>
          </section>

          <section className="engineering-variable-inspector-page__card">
            <h2>topology（完整字段）</h2>
            <pre className="engineering-variable-inspector-page__json">
              {JSON.stringify(loadedSnapshot.snapshot.project.topology, null, 2)}
            </pre>
          </section>
        </>
      )}
    </main>
  );
};
