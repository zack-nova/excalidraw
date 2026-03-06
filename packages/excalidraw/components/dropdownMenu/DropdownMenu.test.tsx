import React from "react";

import { KEYS } from "@excalidraw/common";

import { Excalidraw, MainMenu } from "../../index";
import { Keyboard } from "../../tests/helpers/ui";
import {
  render,
  waitFor,
  getByTestId,
  fireEvent,
} from "../../tests/test-utils";

describe("Test <DropdownMenu/>", () => {
  it("should", async () => {
    const { container } = await render(<Excalidraw />);

    expect(window.h.state.openMenu).toBe(null);

    fireEvent.click(getByTestId(container, "main-menu-trigger"));
    expect(window.h.state.openMenu).toBe("canvas");

    await waitFor(() => {
      Keyboard.keyDown(KEYS.ESCAPE);
      expect(window.h.state.openMenu).toBe(null);
    });
  });

  it("opens the main menu aligned to the trigger end when docked on the right", async () => {
    const { container } = await render(<Excalidraw />);

    fireEvent.click(getByTestId(container, "main-menu-trigger"));

    await waitFor(() => {
      expect(getByTestId(container, "dropdown-menu")).toHaveAttribute(
        "data-align",
        "end",
      );
    });
  });

  it("opens the preferences submenu to the left when main menu is on the right", async () => {
    const { container } = await render(
      <Excalidraw>
        <MainMenu>
          <MainMenu.DefaultItems.Preferences />
        </MainMenu>
      </Excalidraw>,
    );

    fireEvent.click(getByTestId(container, "main-menu-trigger"));
    const preferencesTrigger = container.querySelector(
      ".dropdown-menu__submenu-trigger",
    );
    if (!preferencesTrigger) {
      throw new Error("Preferences submenu trigger was not found");
    }
    fireEvent.click(preferencesTrigger);

    await waitFor(() => {
      expect(
        container.querySelector(".excalidraw-main-menu-preferences-submenu"),
      ).toHaveAttribute("data-side", "left");
    });
  });
});
