import { CaptureUpdateAction } from "@excalidraw/element";
import { setBindableElementAnchorsWhenUnselected } from "@excalidraw/element";

import { Switch } from "../components/Switch";
import { t } from "../i18n";

import { newElementWith } from "../../element/src/mutateElement";

import { register } from "./register";

import type { AppClassProperties, AppState } from "../types";

type AnchorEditorFormData =
  | {
      name: "showWhenUnselected";
      checked: boolean;
    }
  | undefined;

const getSelectedRectangle = (appState: AppState, app: AppClassProperties) => {
  const selectedElements = app.scene.getSelectedElements(appState);

  if (
    selectedElements.length !== 1 ||
    selectedElements[0].type !== "rectangle"
  ) {
    return null;
  }

  return selectedElements[0];
};

export const actionToggleAnchorEditor = register<AnchorEditorFormData>({
  name: "toggleAnchorEditor",
  label: "labels.anchorEditor.edit",
  trackEvent: {
    category: "element",
  },
  perform(elements, appState, formData, app) {
    const selectedRectangle = getSelectedRectangle(appState, app);

    if (!selectedRectangle) {
      return false;
    }

    if (formData?.name === "showWhenUnselected") {
      return {
        elements: elements.map((element) =>
          element.id === selectedRectangle.id
            ? newElementWith(element, {
                customData: setBindableElementAnchorsWhenUnselected(
                  selectedRectangle,
                  formData.checked,
                ),
              })
            : element,
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    }

    const isEditing = appState.editingAnchorElementId === selectedRectangle.id;

    return {
      appState: {
        editingAnchorElementId: isEditing ? null : selectedRectangle.id,
        selectedAnchorPointIndex: null,
        draggedAnchorPointIndex: null,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, updateData, app }) => {
    const selectedRectangle = getSelectedRectangle(appState, app);

    if (!selectedRectangle) {
      return null;
    }

    const label = t("labels.anchorEditor.edit");
    const name = "editAnchorPoints";
    const showWhenUnselectedLabel = t("labels.anchorEditor.showWhenUnselected");
    const showWhenUnselectedName = "showAnchorPointsWhenUnselected";

    return (
      <fieldset>
        <legend>{t("labels.anchorEditor.label")}</legend>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <label htmlFor={name}>{label}</label>
          <Switch
            name={name}
            title={label}
            checked={appState.editingAnchorElementId === selectedRectangle.id}
            onChange={() => updateData(null)}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginTop: "0.75rem",
          }}
        >
          <label htmlFor={showWhenUnselectedName}>
            {showWhenUnselectedLabel}
          </label>
          <Switch
            name={showWhenUnselectedName}
            title={showWhenUnselectedLabel}
            checked={
              selectedRectangle.customData?.showAnchorsWhenUnselected !== false
            }
            onChange={(checked) =>
              updateData({
                name: "showWhenUnselected",
                checked,
              })
            }
          />
        </div>
      </fieldset>
    );
  },
});
