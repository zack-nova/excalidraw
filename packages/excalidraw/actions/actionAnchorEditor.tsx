import { CaptureUpdateAction } from "@excalidraw/element";
import {
  isBindableElement,
  setBindableElementAnchorsWhenUnselected,
  supportsBindableElementAnchorPoints,
} from "@excalidraw/element";

import type {
  ExcalidrawBindableElement,
  ExcalidrawElement,
} from "@excalidraw/element/types";

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

const isAnchorEditableElement = (
  element: ExcalidrawElement | null | undefined,
): element is ExcalidrawBindableElement =>
  isBindableElement(element) && supportsBindableElementAnchorPoints(element);

const getSelectedAnchorElements = (
  appState: AppState,
  app: AppClassProperties,
) => app.scene.getSelectedElements(appState).filter(isAnchorEditableElement);

const getSelectedAnchorEditingElement = (
  appState: AppState,
  app: AppClassProperties,
) => {
  const selectedElements = app.scene.getSelectedElements(appState);

  if (
    selectedElements.length !== 1 ||
    !isAnchorEditableElement(selectedElements[0])
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
    if (formData?.name === "showWhenUnselected") {
      const selectedAnchorElements = getSelectedAnchorElements(appState, app);

      if (selectedAnchorElements.length === 0) {
        return false;
      }

      const selectedAnchorElementsById = new Map(
        selectedAnchorElements.map((element) => [element.id, element]),
      );

      return {
        elements: elements.map((element) =>
          selectedAnchorElementsById.has(element.id)
            ? (() => {
                const customData = setBindableElementAnchorsWhenUnselected(
                  selectedAnchorElementsById.get(element.id)!,
                  formData.checked,
                );

                return newElementWith(
                  element,
                  { customData },
                  customData === undefined && element.customData !== undefined,
                );
              })()
            : element,
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    }

    const selectedAnchorEditingElement = getSelectedAnchorEditingElement(
      appState,
      app,
    );

    if (!selectedAnchorEditingElement) {
      return false;
    }

    const isEditing =
      appState.editingAnchorElementId === selectedAnchorEditingElement.id;

    return {
      appState: {
        editingAnchorElementId: isEditing
          ? null
          : selectedAnchorEditingElement.id,
        selectedAnchorPointIndex: null,
        draggedAnchorPointIndex: null,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, updateData, app }) => {
    const selectedAnchorElements = getSelectedAnchorElements(appState, app);
    const selectedAnchorEditingElement = getSelectedAnchorEditingElement(
      appState,
      app,
    );

    if (selectedAnchorElements.length === 0) {
      return null;
    }

    const label = t("labels.anchorEditor.edit");
    const name = "editAnchorPoints";
    const showWhenUnselectedLabel = t("labels.anchorEditor.showWhenUnselected");
    const showWhenUnselectedName = "showAnchorPointsWhenUnselected";

    return (
      <fieldset>
        <legend>{t("labels.anchorEditor.label")}</legend>
        {selectedAnchorEditingElement ? (
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
              checked={
                appState.editingAnchorElementId ===
                selectedAnchorEditingElement.id
              }
              onChange={() => updateData(null)}
            />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginTop: selectedAnchorEditingElement ? "0.75rem" : 0,
          }}
        >
          <label htmlFor={showWhenUnselectedName}>
            {showWhenUnselectedLabel}
          </label>
          <Switch
            name={showWhenUnselectedName}
            title={showWhenUnselectedLabel}
            checked={selectedAnchorElements.every(
              (element) =>
                element.customData?.showAnchorsWhenUnselected !== false,
            )}
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
