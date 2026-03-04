import { CaptureUpdateAction } from "@excalidraw/element";
import { isImageElement } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Switch } from "../components/Switch";
import { t } from "../i18n";

import { newElementWith } from "../../element/src/mutateElement";

import { register } from "./register";
import "./actionEngineeringComponent.scss";

import type { AppClassProperties, AppState } from "../types";

type EngineeringComponentFormData =
  | {
      checked: boolean;
    }
  | undefined;

const ENGINEERING_COMPONENT_FLAG = "isEngineeringComponent";
const ENGINEERING_COMPONENT_GROUP_ID = "engineeringComponentGroupId";

const isEngineeringComponentEditableElement = (
  element: ExcalidrawElement | null | undefined,
) =>
  !!element &&
  (isImageElement(element) ||
    element.type === "rectangle" ||
    element.type === "diamond" ||
    element.type === "ellipse");

const getSelectedEngineeringComponentElements = (
  appState: AppState,
  app: AppClassProperties,
) =>
  app.scene
    .getSelectedElements(appState)
    .filter(isEngineeringComponentEditableElement);

const setEngineeringComponentCustomData = (
  element: ExcalidrawElement,
  checked: boolean,
  engineeringComponentGroupId?: string | null,
) => {
  const customData =
    element.customData && typeof element.customData === "object"
      ? { ...element.customData }
      : {};
  const component =
    customData.component && typeof customData.component === "object"
      ? { ...customData.component }
      : null;

  customData[ENGINEERING_COMPONENT_FLAG] = checked;

  if (checked && engineeringComponentGroupId) {
    customData[ENGINEERING_COMPONENT_GROUP_ID] = engineeringComponentGroupId;
  } else {
    delete customData[ENGINEERING_COMPONENT_GROUP_ID];
  }

  if (component) {
    component[ENGINEERING_COMPONENT_FLAG] = checked;

    if (checked && engineeringComponentGroupId) {
      component[ENGINEERING_COMPONENT_GROUP_ID] = engineeringComponentGroupId;
    } else {
      delete component[ENGINEERING_COMPONENT_GROUP_ID];
    }

    customData.component = component;
  }

  return customData;
};

const getSharedEngineeringGroupId = (
  selectedElements: readonly ExcalidrawElement[],
) => {
  if (selectedElements.length < 2) {
    return null;
  }

  const sharedGroupIds = selectedElements[0].groupIds.filter((groupId) =>
    selectedElements.every((element) => element.groupIds.includes(groupId)),
  );

  return sharedGroupIds.at(-1) ?? null;
};

export const actionToggleEngineeringComponent =
  register<EngineeringComponentFormData>({
    name: "toggleEngineeringComponent",
    label: "labels.engineeringComponent.toggle",
    trackEvent: {
      category: "element",
    },
    perform(elements, appState, formData, app) {
      const selectedElements = getSelectedEngineeringComponentElements(
        appState,
        app,
      );

      if (!formData || selectedElements.length === 0) {
        return false;
      }

      const selectedIds = new Set(selectedElements.map((element) => element.id));
      const engineeringComponentGroupId = formData.checked
        ? getSharedEngineeringGroupId(selectedElements)
        : null;

      return {
        elements: elements.map((element) =>
          selectedIds.has(element.id)
            ? newElementWith(element, {
                customData: setEngineeringComponentCustomData(
                  element,
                  formData.checked,
                  engineeringComponentGroupId,
                ),
              })
            : element,
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    },
    PanelComponent: ({ appState, updateData, app }) => {
      const selectedElements = getSelectedEngineeringComponentElements(
        appState,
        app,
      );

      if (selectedElements.length === 0) {
        return null;
      }

      const label = t("labels.engineeringComponent.toggle");

      return (
        <fieldset className="engineering-component-fieldset">
          <legend>{t("labels.engineeringComponent.label")}</legend>
          <div className="engineering-component-row">
            <label
              className="engineering-component-label"
              htmlFor="engineering-component-toggle"
            >
              {label}
            </label>
            <Switch
              className="engineering-component-switch Switch--compact"
              name="engineering-component-toggle"
              title={label}
              checked={selectedElements.every((element) => {
                const customData =
                  element.customData && typeof element.customData === "object"
                    ? element.customData
                    : null;
                const component =
                  customData?.component &&
                  typeof customData.component === "object"
                    ? customData.component
                    : null;

                return (
                  customData?.[ENGINEERING_COMPONENT_FLAG] === true ||
                  component?.[ENGINEERING_COMPONENT_FLAG] === true
                );
              })}
              onChange={(checked) => updateData({ checked })}
              testId="engineering-component-toggle"
            />
          </div>
        </fieldset>
      );
    },
  });
