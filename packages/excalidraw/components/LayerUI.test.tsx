import React from "react";

import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
} from "@excalidraw/common";

import { Excalidraw, WelcomeScreen } from "../index";
import { UI } from "../tests/helpers/ui";
import { render, waitFor, withExcalidrawDimensions } from "../tests/test-utils";

describe("LayerUI desktop layout", () => {
  it("renders the default sidebar trigger on the left and the main menu on the right", async () => {
    const { container } = await render(<Excalidraw />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const topMenu = container.querySelector(".App-menu_top") as HTMLElement;
      const leftPanel = topMenu.firstElementChild as HTMLElement;
      const rightPanel = topMenu.lastElementChild as HTMLElement;

      expect(leftPanel.querySelector(".default-sidebar-trigger")).not.toBeNull();
      expect(
        leftPanel.querySelector("[data-testid='main-menu-trigger']"),
      ).toBeNull();

      expect(
        rightPanel.querySelector("[data-testid='main-menu-trigger']"),
      ).not.toBeNull();
      expect(rightPanel.querySelector(".default-sidebar-trigger")).toBeNull();
    });
  });

  it("renders selected shape actions in the right panel and right-aligns them", async () => {
    const { container } = await render(<Excalidraw />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      UI.clickTool("rectangle");

      await waitFor(() => {
        const topMenu = container.querySelector(".App-menu_top") as HTMLElement;
        const leftPanel = topMenu.firstElementChild as HTMLElement;
        const rightPanel = topMenu.lastElementChild as HTMLElement;

        expect(
          leftPanel.querySelector(".selected-shape-actions-container"),
        ).toBeNull();

        const actionsContainer = rightPanel.querySelector(
          ".selected-shape-actions-container",
        ) as HTMLElement | null;
        const actionsPanel = actionsContainer?.querySelector(
          ".App-menu__left",
        ) as HTMLElement | null;
        const rightPanelStyle = rightPanel.getAttribute("style") || "";

        expect(actionsContainer).not.toBeNull();
        expect(
          actionsContainer?.querySelector(".selected-shape-actions"),
        ).not.toBeNull();
        expect(actionsPanel).not.toBeNull();
        expect(actionsPanel).toHaveClass("App-menu__left--docked-right");
        expect(getComputedStyle(rightPanel).alignItems).toBe("flex-end");
        expect(rightPanelStyle).toContain("justify-self: end;");
        expect(rightPanelStyle).toContain(
          "max-width: calc(100vw - (var(--editor-container-padding) * 2));",
        );
      });
    });
  });

  it("reserves space on the left when the docked default sidebar is open", async () => {
    const { container } = await render(<Excalidraw initialData={{
      appState: {
        openSidebar: {
          name: DEFAULT_SIDEBAR.name,
          tab: CANVAS_SEARCH_TAB,
        },
      },
    }} />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const sidebar = container.querySelector(".sidebar") as HTMLElement;
      const layerUIWrapper = container.querySelector(
        ".layer-ui__wrapper",
      ) as HTMLElement;

      expect(sidebar).toHaveClass("default-sidebar");
      expect(layerUIWrapper).toHaveClass(
        "layer-ui__wrapper--default-sidebar-docked",
      );
    });
  });

  it("renders the welcome-screen menu hint with a right-docked variant", async () => {
    const { container } = await render(
      <Excalidraw
        initialData={{
          appState: {
            showWelcomeScreen: true,
          },
        }}
      >
        <WelcomeScreen />
      </Excalidraw>,
    );

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const menuHint = container.querySelector(
        ".welcome-screen-decor-hint--menu",
      ) as HTMLElement | null;

      expect(menuHint).not.toBeNull();
      expect(menuHint?.closest(".App-menu_top__right")).not.toBeNull();
      expect(menuHint).toHaveClass("welcome-screen-decor-hint--menu-right");
      expect(menuHint).toHaveStyle({
        "--welcome-screen-menu-hint-right-offset": "6rem",
      });
    });
  });
});
