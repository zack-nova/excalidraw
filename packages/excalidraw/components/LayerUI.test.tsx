import React from "react";

import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
} from "@excalidraw/common";

import { CaptureUpdateAction, Excalidraw, WelcomeScreen } from "../index";
import { API } from "../tests/helpers/api";
import { UI } from "../tests/helpers/ui";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  withExcalidrawDimensions,
  within,
} from "../tests/test-utils";

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

  it("renders a five-tab card above the properties panel and defaults to the properties tab", async () => {
    const { container } = await render(<Excalidraw />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      UI.clickTool("rectangle");

      await waitFor(() => {
        const topMenu = container.querySelector(".App-menu_top") as HTMLElement;
        const rightPanel = topMenu.lastElementChild as HTMLElement;
        const actionsContainer = rightPanel.querySelector(
          ".selected-shape-actions-container",
        ) as HTMLElement | null;

        expect(actionsContainer).not.toBeNull();
      });

      const tablist = screen.getByRole("tablist", {
        name: "Properties sections",
      });
      const tabs = screen.getAllByRole("tab");

      expect(tablist).not.toBeNull();
      expect(tabs).toHaveLength(5);
      expect(
        screen.getByRole("tab", {
          name: "Properties",
        }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        within(screen.getByRole("tabpanel")).getByText("Layers"),
      ).toBeVisible();
    });
  });

  it("switches between input, output, anchors, data, and properties tabs for component elements", async () => {
    const componentElement = API.createElement({
      type: "image",
      width: 120,
      height: 80,
    });

    (componentElement as typeof componentElement & {
      customData: Record<string, unknown>;
    }).customData = {
      component: {
        id: "boiler-feed-pump",
        uuid: "component-001",
        type: "component",
        position: { x: 0, y: 0 },
        measured: { width: 120, height: 80 },
        data: {
          name: "Boiler feed pump",
          name_cn: "给水泵",
          component_type: "Pump",
          anchors: [
            {
              id: "anchor-inlet",
              uuid: "anchor-inlet",
              node_id: "node-inlet",
              position: { x: 0.1, y: 0.5 },
              data: {
                name: "Feedwater inlet",
                name_cn: "给水入口",
                interface_type: "InWater",
                connection_type: "inlet",
                is_connected: true,
                is_visible: true,
                allow_not_display: false,
                material_type: "water",
                tpis_extra_info: null,
              },
            },
            {
              id: "anchor-outlet",
              uuid: "anchor-outlet",
              node_id: "node-outlet",
              position: { x: 0.9, y: 0.5 },
              data: {
                name: "Steam outlet",
                name_cn: "蒸汽出口",
                interface_type: "OutSteam",
                connection_type: "outlet",
                is_connected: false,
                is_visible: true,
                allow_not_display: false,
                material_type: "steam",
                tpis_extra_info: null,
              },
            },
            {
              id: "anchor-bypass",
              uuid: "anchor-bypass",
              node_id: "node-bypass",
              position: { x: 0.5, y: 0.1 },
              data: {
                name: "Bypass connection",
                name_cn: "旁路接口",
                interface_type: "N3",
                connection_type: "both",
                is_connected: false,
                is_visible: true,
                allow_not_display: true,
                material_type: "mixed",
                tpis_extra_info: null,
              },
            },
          ],
        },
      },
      engineering: {
        component_id: "component-001",
        anchor_id: "anchor-outlet",
        point_name: "main.pump.outlet.pressure",
        value: 2.1,
        unit: "MPa",
      },
    };

    await render(<Excalidraw />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      API.updateScene({
        appState: {
          selectedElementIds: {
            [componentElement.id]: true,
          },
        },
        captureUpdate: CaptureUpdateAction.NEVER,
        elements: [componentElement],
      });

      await waitFor(() => {
        expect(
          screen.getByRole("tab", {
            name: "Properties",
          }),
        ).toHaveAttribute("aria-selected", "true");
      });

      fireEvent.click(
        screen.getByRole("tab", {
          name: "Input",
        }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("tab", {
            name: "Input",
          }),
        ).toHaveAttribute("aria-selected", "true");
      });
      expect(
        within(screen.getByRole("tabpanel")).getByText("Feedwater inlet"),
      ).toBeVisible();
      expect(
        within(screen.getByRole("tabpanel")).queryByText("Steam outlet"),
      ).toBeNull();

      fireEvent.click(
        screen.getByRole("tab", {
          name: "Output",
        }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("tab", {
            name: "Output",
          }),
        ).toHaveAttribute("aria-selected", "true");
      });
      expect(
        within(screen.getByRole("tabpanel")).getByText("Steam outlet"),
      ).toBeVisible();
      expect(
        within(screen.getByRole("tabpanel")).queryByText("Feedwater inlet"),
      ).toBeNull();

      fireEvent.click(
        screen.getByRole("tab", {
          name: "Anchors",
        }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("tab", {
            name: "Anchors",
          }),
        ).toHaveAttribute("aria-selected", "true");
      });
      expect(
        within(screen.getByRole("tabpanel")).getByText("Bypass connection"),
      ).toBeVisible();
      expect(
        within(screen.getByRole("tabpanel")).getByText("Feedwater inlet"),
      ).toBeVisible();
      expect(
        within(screen.getByRole("tabpanel")).getByText("Steam outlet"),
      ).toBeVisible();

      fireEvent.click(
        screen.getByRole("tab", {
          name: "Data",
        }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("tab", {
            name: "Data",
          }),
        ).toHaveAttribute("aria-selected", "true");
      });
      expect(
        within(screen.getByRole("tabpanel")).getByText("Boiler feed pump"),
      ).toBeVisible();
      expect(
        within(screen.getByRole("tabpanel")).getByText(
          "main.pump.outlet.pressure",
        ),
      ).toBeVisible();
      expect(within(screen.getByRole("tabpanel")).queryByText("Layers")).toBeNull();

      fireEvent.click(
        screen.getByRole("tab", {
          name: "Properties",
        }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("tab", {
            name: "Properties",
          }),
        ).toHaveAttribute("aria-selected", "true");
      });
      expect(
        within(screen.getByRole("tabpanel")).getByText("Layers"),
      ).toBeVisible();
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
