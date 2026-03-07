import { useEffect, useState } from "react";

import {
  ENGINEERING_TABLE_MATERIAL_MAX_SIZE,
  type EngineeringTableMaterialResizeOperation,
} from "../../data/engineeringTableMaterial";
import {
  collectEngineeringChartVariableKeys,
  type EngineeringChartMaterial,
  type EngineeringChartMaterialBindings,
  type EngineeringChartMaterialPatch,
  type EngineeringChartMode,
} from "../../data/engineeringChartMaterial";
import type { SelectedShapeVariableBinding } from "./types";

const getChartTypeLabel = (chartType: string) => {
  if (chartType === "line") {
    return "折线图";
  }
  if (chartType === "bar") {
    return "柱状图";
  }
  if (chartType === "hbar") {
    return "条状图";
  }
  if (chartType === "pie") {
    return "饼图";
  }
  return "图示";
};

export const EngineeringTableMaterialActionsPanel = ({
  rows,
  cols,
  onResize,
}: {
  rows: number;
  cols: number;
  onResize?: (operation: EngineeringTableMaterialResizeOperation) => void;
}) => {
  const canAddRow = rows < ENGINEERING_TABLE_MATERIAL_MAX_SIZE;
  const canRemoveRow = rows > 1;
  const canAddCol = cols < ENGINEERING_TABLE_MATERIAL_MAX_SIZE;
  const canRemoveCol = cols > 1;

  return (
    <div className="selected-shape-actions__stack engineering-parameter-panel">
      <div className="selected-shape-actions-card engineering-parameter-panel__drawer">
        <div className="selected-shape-actions-card__title">表格素材</div>
        <div className="selected-shape-actions-card__meta">
          当前尺寸：{rows} 行 × {cols} 列（上限 {ENGINEERING_TABLE_MATERIAL_MAX_SIZE}
          ×{ENGINEERING_TABLE_MATERIAL_MAX_SIZE}）
        </div>
        <div className="engineering-parameter-panel__tableMaterialActions">
          <button
            className="engineering-parameter-panel__button"
            disabled={!onResize || !canAddRow}
            onClick={() => onResize?.("addRow")}
            type="button"
          >
            + 行
          </button>
          <button
            className="engineering-parameter-panel__button engineering-parameter-panel__button--ghost"
            disabled={!onResize || !canRemoveRow}
            onClick={() => onResize?.("removeRow")}
            type="button"
          >
            - 行
          </button>
          <button
            className="engineering-parameter-panel__button"
            disabled={!onResize || !canAddCol}
            onClick={() => onResize?.("addColumn")}
            type="button"
          >
            + 列
          </button>
          <button
            className="engineering-parameter-panel__button engineering-parameter-panel__button--ghost"
            disabled={!onResize || !canRemoveCol}
            onClick={() => onResize?.("removeColumn")}
            type="button"
          >
            - 列
          </button>
        </div>
        <div className="selected-shape-actions-card__meta">
          单元格支持普通文本与变量模板（例如 <code>{"{{data[var:ambient].value}}"}</code>
          ）。
        </div>
      </div>
    </div>
  );
};

export const EngineeringChartMaterialActionsPanel = ({
  chartElementId,
  chartMaterial,
  onApply,
}: {
  chartElementId: string;
  chartMaterial: EngineeringChartMaterial;
  onApply?: (patch: EngineeringChartMaterialPatch) => void;
}) => {
  const [mode, setMode] = useState<EngineeringChartMode>(
    chartMaterial.mode,
  );
  const [title, setTitle] = useState(chartMaterial.title);
  const [legendShow, setLegendShow] = useState(chartMaterial.legend.show);
  const [xName, setXName] = useState(chartMaterial.axis.xName);
  const [yName, setYName] = useState(chartMaterial.axis.yName);
  const [color, setColor] = useState(chartMaterial.color);
  const [labelsBinding, setLabelsBinding] = useState(
    chartMaterial.bindings.labels,
  );
  const [valuesBinding, setValuesBinding] = useState(
    chartMaterial.bindings.values,
  );
  const [code, setCode] = useState(chartMaterial.code);

  useEffect(() => {
    setMode(chartMaterial.mode);
    setTitle(chartMaterial.title);
    setLegendShow(chartMaterial.legend.show);
    setXName(chartMaterial.axis.xName);
    setYName(chartMaterial.axis.yName);
    setColor(chartMaterial.color);
    setLabelsBinding(chartMaterial.bindings.labels);
    setValuesBinding(chartMaterial.bindings.values);
    setCode(chartMaterial.code);
  }, [
    chartElementId,
    chartMaterial.mode,
    chartMaterial.title,
    chartMaterial.legend.show,
    chartMaterial.axis.xName,
    chartMaterial.axis.yName,
    chartMaterial.color,
    chartMaterial.bindings.labels,
    chartMaterial.bindings.values,
    chartMaterial.code,
  ]);

  return (
    <div className="selected-shape-actions__stack engineering-parameter-panel">
      <div className="selected-shape-actions-card engineering-parameter-panel__drawer">
        <div className="selected-shape-actions-card__title">图示素材</div>
        <div className="selected-shape-actions-card__meta">
          当前类型：{getChartTypeLabel(chartMaterial.chartType)}（默认尺寸：480×320）
        </div>
        <div className="engineering-parameter-panel__tableMaterialActions">
          <label className="engineering-parameter-panel__chartField">
            <span>模式</span>
            <select
              aria-label="图示模式"
              className="engineering-parameter-panel__field"
              onChange={(event) =>
                setMode(event.target.value as EngineeringChartMode)
              }
              value={mode}
            >
              <option value="form">表单模式</option>
              <option value="code">代码模式</option>
            </select>
          </label>
          <label className="engineering-parameter-panel__chartField">
            <span>主色</span>
            <input
              aria-label="图示主色"
              className="engineering-parameter-panel__field"
              onChange={(event) => setColor(event.target.value)}
              value={color}
            />
          </label>
          <label className="engineering-parameter-panel__chartField engineering-parameter-panel__chartField--full">
            <span>标题</span>
            <input
              aria-label="图示标题"
              className="engineering-parameter-panel__field"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label className="engineering-parameter-panel__chartField">
            <span>X 轴标题</span>
            <input
              aria-label="图示X轴标题"
              className="engineering-parameter-panel__field"
              onChange={(event) => setXName(event.target.value)}
              value={xName}
            />
          </label>
          <label className="engineering-parameter-panel__chartField">
            <span>Y 轴标题</span>
            <input
              aria-label="图示Y轴标题"
              className="engineering-parameter-panel__field"
              onChange={(event) => setYName(event.target.value)}
              value={yName}
            />
          </label>
          <label className="engineering-parameter-panel__chartField engineering-parameter-panel__chartField--full">
            <span>图示分类变量</span>
            <input
              aria-label="图示分类变量"
              className="engineering-parameter-panel__field"
              onChange={(event) => setLabelsBinding(event.target.value)}
              value={labelsBinding}
            />
          </label>
          <label className="engineering-parameter-panel__chartField engineering-parameter-panel__chartField--full">
            <span>图示数值变量</span>
            <input
              aria-label="图示数值变量"
              className="engineering-parameter-panel__field"
              onChange={(event) => setValuesBinding(event.target.value)}
              value={valuesBinding}
            />
          </label>
          <label className="engineering-parameter-panel__chartField engineering-parameter-panel__chartField--full">
            <span>代码函数（(vars) =&gt; option）</span>
            <textarea
              aria-label="图示代码函数"
              className="engineering-parameter-panel__field engineering-parameter-panel__field--code"
              onChange={(event) => setCode(event.target.value)}
              rows={4}
              value={code}
            />
          </label>
          <label className="engineering-parameter-panel__chartLegendToggle">
            <input
              aria-label="图示显示图例"
              checked={legendShow}
              onChange={(event) => setLegendShow(event.target.checked)}
              type="checkbox"
            />
            <span>显示图例</span>
          </label>
        </div>
        <div className="engineering-parameter-panel__chartActions">
          <button
            className="engineering-parameter-panel__button"
            disabled={!onApply}
            onClick={() =>
              onApply?.({
                mode,
                title,
                color,
                code,
                legendShow,
                axis: {
                  xName,
                  yName,
                },
                bindings: {
                  labels: labelsBinding,
                  values: valuesBinding,
                },
              })
            }
            type="button"
          >
            应用图示配置
          </button>
        </div>
      </div>
    </div>
  );
};

export const NormalShapeOperationsPanel = () => (
  <div className="selected-shape-actions-placeholder">
    当前图元暂无可用操作。
  </div>
);

export const EngineeringChartMaterialDataPanel = ({
  bindings,
  warnings,
  lastErrorSummary,
}: {
  bindings: EngineeringChartMaterialBindings;
  warnings: string[];
  lastErrorSummary: string | null;
}) => {
  const variableKeys = collectEngineeringChartVariableKeys(bindings);

  return (
    <div className="selected-shape-actions-data engineering-parameter-panel__chartDataPanel">
      <div className="selected-shape-actions-card">
        <div className="selected-shape-actions-card__title">图示绑定变量</div>
        {variableKeys.length > 0 ? (
          <div className="selected-shape-actions-card__meta">
            {variableKeys.join(", ")}
          </div>
        ) : (
          <div className="selected-shape-actions-card__meta">
            当前图示尚未配置变量绑定。
          </div>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="selected-shape-actions-card engineering-parameter-panel__warningCard">
          <div className="selected-shape-actions-card__title">变量告警</div>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {lastErrorSummary && (
        <div className="selected-shape-actions-card engineering-parameter-panel__warningCard">
          <div className="selected-shape-actions-card__title">代码错误摘要</div>
          <div className="selected-shape-actions-card__meta">{lastErrorSummary}</div>
        </div>
      )}
    </div>
  );
};

export const NormalShapeDataPanel = ({
  bindings,
}: {
  bindings: SelectedShapeVariableBinding[];
}) => {
  if (bindings.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">
        当前图元未绑定变量。
      </div>
    );
  }

  return (
    <div className="selected-shape-actions-data">
      <dl className="selected-shape-actions-data-list">
        {bindings.map((binding) => (
          <div className="selected-shape-actions-data-row" key={binding.id}>
            <dt>{binding.expression}</dt>
            <dd>
              {binding.variableTokens.length > 0
                ? binding.variableTokens.join(", ")
                : "表达式未识别变量"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
