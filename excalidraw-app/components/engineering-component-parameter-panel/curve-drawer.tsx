export type CurveTarget = {
  id: string;
  name: string;
};

export const CurveDrawer = ({
  curveTarget,
  curveStatus,
  curveSummary,
  onClose,
}: {
  curveTarget: CurveTarget;
  curveStatus: "idle" | "loading" | "ready" | "error" | undefined;
  curveSummary: string | null;
  onClose: () => void;
}) => (
  <div className="selected-shape-actions-card engineering-parameter-panel__drawer">
    <div className="selected-shape-actions-card__title">曲线面板</div>
    <div className="selected-shape-actions-card__meta">
      当前参数：{curveTarget.name}
    </div>
    <div className="selected-shape-actions-card__meta">
      状态：
      {curveStatus === "loading"
        ? "加载中"
        : curveStatus === "ready"
          ? "已加载"
          : curveStatus === "error"
            ? "加载失败"
            : "未加载"}
      {curveSummary ? ` · ${curveSummary}` : ""}
    </div>
    <div className="selected-shape-actions-data-row engineering-parameter-panel__row">
      <span />
      <button
        className="engineering-parameter-panel__button"
        onClick={onClose}
        type="button"
      >
        关闭曲线面板
      </button>
    </div>
  </div>
);
