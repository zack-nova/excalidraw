import type { ComponentSpecParameter } from "../../component-spec-store";
import {
  getParameterDescription,
  getParameterIdentity,
  getParameterTitle,
  groupParametersByGroup,
  toStringValue,
} from "./panel-utils";

export const OutputParameterTable = ({
  parameters,
}: {
  parameters: ComponentSpecParameter[];
}) => {
  const groups = groupParametersByGroup(parameters);

  return (
    <div className="engineering-parameter-panel__table engineering-parameter-panel__table--output">
      <div className="engineering-parameter-panel__tableHeader">
        <div>属性名</div>
        <div>值</div>
        <div>单位</div>
      </div>
      {groups.map((group) => (
        <div className="engineering-parameter-panel__group" key={group.name}>
          <div className="engineering-parameter-panel__groupRow">{group.name}</div>
          {group.items.map(({ parameter, index }) => (
            <div
              className="engineering-parameter-panel__tableRow"
              key={getParameterIdentity(parameter, index)}
            >
              <div className="engineering-parameter-panel__nameCell">
                <div className="engineering-parameter-panel__name">
                  {getParameterTitle(parameter)}
                </div>
                {getParameterDescription(parameter).length > 0 ? (
                  <div className="engineering-parameter-panel__meta">
                    {getParameterDescription(parameter).join(" · ")}
                  </div>
                ) : null}
              </div>
              <div className="engineering-parameter-panel__outputValue">
                {toStringValue(parameter.defaultValue) || "--"}
              </div>
              <div className="engineering-parameter-panel__unitCell">
                {parameter.unit || "--"}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const OutputParameterPanel = ({
  parameters,
}: {
  parameters: ComponentSpecParameter[];
}) => {
  if (parameters.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">
        No output parameters defined.
      </div>
    );
  }

  return <OutputParameterTable parameters={parameters} />;
};
