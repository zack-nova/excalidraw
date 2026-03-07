import { useState } from "react";

import type { ComponentSpecParameter } from "../../component-spec-store";
import type { EngineeringValue } from "../../engineering-domain";
import {
  getEnumOptions,
  getInputType,
  getParameterDescription,
  getParameterIdentity,
  getParameterTitle,
  groupParametersByGroup,
  toInputFieldValue,
  toManualInputValue,
  toStringValue,
} from "./panel-utils";
import type { InputType, ResolvedInputParameterBinding } from "./types";

const SensorBindingIcon = () => (
  <svg
    aria-hidden="true"
    className="engineering-parameter-panel__buttonIcon"
    viewBox="0 0 16 16"
  >
    <path d="M4.6 5.1a2.3 2.3 0 0 1 3.3 0l.9.9-.9.9-.9-.9a1 1 0 0 0-1.4 1.4l.9.9-.9.9-.9-.9a2.3 2.3 0 0 1 0-3.2Z" />
    <path d="M11.4 10.9a2.3 2.3 0 0 1-3.3 0l-.9-.9.9-.9.9.9a1 1 0 1 0 1.4-1.4l-.9-.9.9-.9.9.9a2.3 2.3 0 0 1 0 3.2Z" />
    <path d="m6.6 9.4 2.8-2.8.9.9-2.8 2.8-.9-.9Z" />
  </svg>
);

export const InputParameterPanel = ({
  componentEntityId,
  componentType,
  parameters,
  onOpenBindingPanel,
  onOpenCurvePanel,
  resolveStoredBinding,
  onPersistValue,
}: {
  componentEntityId: string | null;
  componentType: string;
  parameters: ComponentSpecParameter[];
  onOpenBindingPanel: (parameter: ComponentSpecParameter, index: number) => void;
  onOpenCurvePanel: (parameter: ComponentSpecParameter, index: number) => void;
  resolveStoredBinding: (
    parameter: ComponentSpecParameter,
    index: number,
  ) => ResolvedInputParameterBinding | null;
  onPersistValue: (
    parameter: ComponentSpecParameter,
    index: number,
    inputValue: EngineeringValue | undefined,
    inputType: InputType,
  ) => void;
}) => {
  const [draftValuesByParameterId, setDraftValuesByParameterId] = useState<
    Record<string, string | boolean>
  >({});

  if (parameters.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">
        No input parameters defined.
      </div>
    );
  }

  const groups = groupParametersByGroup(parameters);

  return (
    <div className="engineering-parameter-panel__table engineering-parameter-panel__table--input">
      <div className="engineering-parameter-panel__tableHeader">
        <div>属性名</div>
        <div>值</div>
        <div>单位</div>
        <div>测点</div>
      </div>
      {groups.map((group) => (
        <div className="engineering-parameter-panel__group" key={group.name}>
          <div className="engineering-parameter-panel__groupRow">{group.name}</div>
          {group.items.map(({ parameter, index }) => {
            const parameterId = getParameterIdentity(parameter, index);
            const parameterDraftKey = `${
              componentEntityId || componentType
            }:${parameterId}`;
            const parameterTitle = getParameterTitle(parameter);
            const description = getParameterDescription(parameter);
            const inputType = getInputType(parameter);
            const draftValue = draftValuesByParameterId[parameterDraftKey];
            const persistedBinding = resolveStoredBinding(parameter, index);
            const persistedValue =
              typeof persistedBinding?.snapshotValue !== "undefined"
                ? persistedBinding.snapshotValue
                : (parameter.defaultValue as EngineeringValue | undefined);

            const persistInputValue = (nextRawValue: string | boolean) => {
              const nextValue = toManualInputValue(inputType, nextRawValue);
              onPersistValue(parameter, index, nextValue, inputType);
            };

            return (
              <div className="engineering-parameter-panel__tableRow" key={parameterId}>
                <div className="engineering-parameter-panel__nameCell">
                  <div className="engineering-parameter-panel__name">
                    {parameterTitle}
                  </div>
                  {description.length > 0 ? (
                    <div className="engineering-parameter-panel__meta">
                      {description.join(" · ")}
                    </div>
                  ) : null}
                </div>
                <div className="engineering-parameter-panel__valueCell">
                  {inputType === "enum" ? (
                    <select
                      className="engineering-parameter-panel__field"
                      aria-label={`参数输入-${componentType}-${parameterId}`}
                      onChange={(event) => {
                        setDraftValuesByParameterId((current) => ({
                          ...current,
                          [parameterDraftKey]: event.target.value,
                        }));
                        persistInputValue(event.target.value);
                      }}
                      value={
                        typeof draftValue === "string"
                          ? draftValue
                          : toStringValue(toInputFieldValue(inputType, persistedValue))
                      }
                    >
                      {getEnumOptions(parameter).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : inputType === "boolean" ? (
                    <input
                      className="engineering-parameter-panel__checkbox"
                      aria-label={`参数输入-${componentType}-${parameterId}`}
                      checked={
                        typeof draftValue === "boolean"
                          ? draftValue
                          : Boolean(toInputFieldValue(inputType, persistedValue))
                      }
                      onChange={(event) => {
                        setDraftValuesByParameterId((current) => ({
                          ...current,
                          [parameterDraftKey]: event.target.checked,
                        }));
                        persistInputValue(event.target.checked);
                      }}
                      type="checkbox"
                    />
                  ) : inputType === "curve" ? (
                    <button
                      aria-label={`打开曲线面板-${parameterTitle}`}
                      className="engineering-parameter-panel__button engineering-parameter-panel__button--ghost"
                      onClick={() => onOpenCurvePanel(parameter, index)}
                      type="button"
                    >
                      打开曲线面板
                    </button>
                  ) : (
                    <input
                      className="engineering-parameter-panel__field"
                      aria-label={`参数输入-${componentType}-${parameterId}`}
                      onChange={(event) => {
                        setDraftValuesByParameterId((current) => ({
                          ...current,
                          [parameterDraftKey]: event.target.value,
                        }));
                        persistInputValue(event.target.value);
                      }}
                      type={inputType === "number" ? "number" : "text"}
                      value={
                        typeof draftValue === "string"
                          ? draftValue
                          : toStringValue(toInputFieldValue(inputType, persistedValue))
                      }
                    />
                  )}
                </div>
                <div className="engineering-parameter-panel__unitCell">
                  {parameter.unit || "--"}
                </div>
                <div className="engineering-parameter-panel__measureCell">
                  <button
                    aria-label={`绑定测点-${parameterTitle}`}
                    className="engineering-parameter-panel__button engineering-parameter-panel__button--binding"
                    onClick={() => onOpenBindingPanel(parameter, index)}
                    type="button"
                  >
                    <SensorBindingIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
