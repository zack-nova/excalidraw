export type BindingTarget = {
  id: string;
  name: string;
  variableId: string | null;
};

export type PointBindingDraft = {
  measurement: string;
  pointName: string;
  field: string;
};

export const BindingDrawer = ({
  bindingTarget,
  bindingDraft,
  onBindingDraftChange,
  onSave,
  onClose,
}: {
  bindingTarget: BindingTarget;
  bindingDraft: PointBindingDraft;
  onBindingDraftChange: (nextDraft: PointBindingDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) => (
  <div className="selected-shape-actions-card engineering-parameter-panel__drawer">
    <div className="selected-shape-actions-card__title">测点绑定</div>
    <div className="selected-shape-actions-card__meta">
      当前参数：{bindingTarget.name}
    </div>
    <div className="selected-shape-actions-data-list engineering-parameter-panel__grid">
      <label className="selected-shape-actions-data-row engineering-parameter-panel__row">
        <span>measurement</span>
        <input
          aria-label="measurement-input"
          className="engineering-parameter-panel__field"
          onChange={(event) =>
            onBindingDraftChange({
              ...bindingDraft,
              measurement: event.target.value,
            })
          }
          placeholder="measurement"
          type="text"
          value={bindingDraft.measurement}
        />
      </label>
      <label className="selected-shape-actions-data-row engineering-parameter-panel__row">
        <span>pointName</span>
        <input
          aria-label="point-name-input"
          className="engineering-parameter-panel__field"
          onChange={(event) =>
            onBindingDraftChange({
              ...bindingDraft,
              pointName: event.target.value,
            })
          }
          placeholder="pointName"
          type="text"
          value={bindingDraft.pointName}
        />
      </label>
      <label className="selected-shape-actions-data-row engineering-parameter-panel__row">
        <span>field</span>
        <input
          aria-label="field-input"
          className="engineering-parameter-panel__field"
          onChange={(event) =>
            onBindingDraftChange({
              ...bindingDraft,
              field: event.target.value,
            })
          }
          placeholder="field"
          type="text"
          value={bindingDraft.field}
        />
      </label>
    </div>
    <div className="selected-shape-actions-data-row engineering-parameter-panel__row">
      <span />
      <button
        className="engineering-parameter-panel__button"
        onClick={onSave}
        type="button"
      >
        保存绑定
      </button>
      <button
        className="engineering-parameter-panel__button"
        onClick={onClose}
        type="button"
      >
        关闭绑定面板
      </button>
    </div>
  </div>
);
