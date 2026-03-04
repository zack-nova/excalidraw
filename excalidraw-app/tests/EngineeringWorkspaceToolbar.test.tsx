import {
  fireEvent,
  render,
  screen,
  waitFor,
  withExcalidrawDimensions,
} from "@excalidraw/excalidraw/tests/test-utils";

import ExcalidrawApp from "../App";

describe("Engineering workspace toolbar", () => {
  it("renders a single workspace icon before the lock button with the same medium size", async () => {
    const { container } = await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const toolbar = container.querySelector(".App-toolbar") as HTMLElement;
      const workspaceTrigger = screen.getByTestId(
        "engineering-workspace-trigger",
      );
      const lockButton = toolbar.querySelector(
        "[data-testid='toolbar-lock']",
      ) as HTMLElement | null;

      expect(lockButton).not.toBeNull();
      expect(
        workspaceTrigger.compareDocumentPosition(lockButton!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
      expect(workspaceTrigger).toHaveAttribute("aria-label", "建模");
      expect(workspaceTrigger).toHaveAttribute("title", "建模");
      expect(workspaceTrigger).toHaveClass("ToolIcon_size_medium");
    });
  });

  it("cycles through modeling, data, and analysis when the user clicks the workspace icon", async () => {
    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const workspaceTrigger = screen.getByTestId(
        "engineering-workspace-trigger",
      );

      fireEvent.click(workspaceTrigger);
      await waitFor(() => {
        expect(workspaceTrigger).toHaveAttribute("aria-label", "数据");
      });

      fireEvent.click(workspaceTrigger);
      await waitFor(() => {
        expect(workspaceTrigger).toHaveAttribute("aria-label", "分析");
      });

      fireEvent.click(workspaceTrigger);
      await waitFor(() => {
        expect(workspaceTrigger).toHaveAttribute("aria-label", "建模");
      });
    });
  });

  it("renders the calculate icon at the end of the desktop toolbar after extra tools", async () => {
    const { container } = await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const topMenu = container.querySelector(".App-menu_top") as HTMLElement;
      const toolbar = topMenu.querySelector(".App-toolbar") as HTMLElement;
      const rightPanel = topMenu.lastElementChild as HTMLElement;
      const extraToolsTrigger = toolbar.querySelector(
        ".App-toolbar__extra-tools-trigger",
      ) as HTMLElement | null;
      const calculateTrigger = screen.getByTestId(
        "engineering-calculate-trigger",
      );

      expect(extraToolsTrigger).not.toBeNull();
      expect(toolbar.contains(calculateTrigger)).toBe(true);
      expect(rightPanel.contains(calculateTrigger)).toBe(false);
      expect(
        extraToolsTrigger!.compareDocumentPosition(calculateTrigger) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
      expect(calculateTrigger).toHaveAttribute("aria-label", "计算");
      expect(calculateTrigger).toHaveAttribute("title", "计算");
      expect(calculateTrigger).toHaveClass("ToolIcon_size_medium");
    });
  });
});
