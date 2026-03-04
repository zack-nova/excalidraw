import { CaptureUpdateAction } from "@excalidraw/element";

import { Switch } from "../components/Switch";
import { t } from "../i18n";

import { register } from "./register";

import type { AppClassProperties, AppState } from "../types";

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

export const actionToggleAnchorEditor = register({
  name: "toggleAnchorEditor",
  label: "labels.anchorEditor.edit",
  trackEvent: {
    category: "element",
  },
  perform(elements, appState, _, app) {
    const selectedRectangle = getSelectedRectangle(appState, app);

    if (!selectedRectangle) {
      return false;
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
      </fieldset>
    );
  },
});
