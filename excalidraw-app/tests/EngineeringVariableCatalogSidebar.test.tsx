import {
  fireEvent,
  render,
  screen,
  waitFor,
  withExcalidrawDimensions,
} from "@excalidraw/excalidraw/tests/test-utils";
import { vi } from "vitest";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { createProjectDocument } from "../engineering/engineering-domain";
import { engineeringProjectDocumentAtom } from "../engineering/engineering-domain-state";
import { engineeringWorkspaceModeAtom } from "../engineering/engineering-ui-state";

const createProjectWithVariableCatalog = () => {
  const project = createProjectDocument({
    id: "project:variables",
    meta: {
      name: "变量工程",
    },
  });

  project.topology.componentsById = {
    "component:boiler": {
      id: "component:boiler",
      templateKey: "Boiler",
      name: "锅炉",
      anchorIds: ["anchor:boiler:in"],
      props: {},
    },
  };
  project.topology.anchorsById = {
    "anchor:boiler:in": {
      id: "anchor:boiler:in",
      componentId: "component:boiler",
      key: "Inlet",
      name: "入口锚点",
      direction: "inlet",
      medium: "water",
    },
  };
  project.topology.pipesById = {
    "pipe:main-1": {
      id: "pipe:main-1",
      fromAnchorId: "anchor:boiler:in",
      toAnchorId: "anchor:boiler:in",
      name: "主蒸汽管段",
      medium: "steam",
      props: {},
    },
  };

  project.variableCatalog.variablesById = {
    "var:global:ambient": {
      id: "var:global:ambient",
      owner: {
        kind: "project",
        id: project.id,
      },
      key: "ambientTemperature",
      name: "环境温度",
      valueType: "float",
      role: "input",
      stage: "raw",
    },
    "var:component:eff": {
      id: "var:component:eff",
      owner: {
        kind: "component",
        id: "component:boiler",
      },
      key: "efficiency",
      name: "锅炉效率",
      valueType: "float",
      role: "input",
      stage: "raw",
    },
    "var:anchor:q": {
      id: "var:anchor:q",
      owner: {
        kind: "anchor",
        id: "anchor:boiler:in",
      },
      key: "Q",
      name: "入口流量",
      valueType: "float",
      role: "result",
      stage: "backend",
    },
    "var:pipe:dp": {
      id: "var:pipe:dp",
      owner: {
        kind: "pipe",
        id: "pipe:main-1",
      },
      key: "dp",
      name: "管段压降",
      valueType: "float",
      role: "result",
      stage: "backend",
    },
  };

  project.variableCatalog.providersById = {
    "provider:global:manual": {
      id: "provider:global:manual",
      variableId: "var:global:ambient",
      kind: "manual",
      defaultValue: 25,
    },
    "provider:component:sensor": {
      id: "provider:component:sensor",
      variableId: "var:component:eff",
      kind: "sensor",
      measurement: "boiler_efficiency",
      pointName: "boiler.efficiency",
      field: "value",
    },
    "provider:anchor:expression": {
      id: "provider:anchor:expression",
      variableId: "var:anchor:q",
      kind: "expression",
      stage: "postprocess",
      expression: 'ref("var:component:eff") * 1.0',
      dependencyVariableIds: ["var:component:eff"],
    },
    "provider:pipe:backend": {
      id: "provider:pipe:backend",
      variableId: "var:pipe:dp",
      kind: "backend",
    },
  };

  project.variableCatalog.providerIdsByVariableId = {
    "var:global:ambient": ["provider:global:manual"],
    "var:component:eff": ["provider:component:sensor"],
    "var:anchor:q": ["provider:anchor:expression"],
    "var:pipe:dp": ["provider:pipe:backend"],
  };

  return project;
};

describe("Engineering variable catalog sidebar", () => {
  it("renders a variable tab trigger between structure tree and comments", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
    appJotaiStore.set(
      engineeringProjectDocumentAtom,
      createProjectWithVariableCatalog(),
    );

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-structure",
        },
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("engineering-structure-sidebar-trigger"),
        ).toBeVisible();
      });

      const structureTrigger = screen.getByTestId(
        "engineering-structure-sidebar-trigger",
      );
      const variablesTrigger = screen.getByTestId(
        "engineering-variables-sidebar-trigger",
      );
      const commentsTrigger = screen.getByTestId("comments-sidebar-trigger");

      expect(
        structureTrigger.compareDocumentPosition(variablesTrigger) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
      expect(
        variablesTrigger.compareDocumentPosition(commentsTrigger) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
    });
  });

  it("filters by owner/source and supports inline variable name editing", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
    appJotaiStore.set(
      engineeringProjectDocumentAtom,
      createProjectWithVariableCatalog(),
    );

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-variables",
        },
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("engineering-variable-catalog"),
        ).toBeVisible();
      });

      expect(screen.getByText("环境温度")).toBeVisible();
      expect(screen.getByText("锅炉效率")).toBeVisible();
      expect(screen.getByText("入口流量")).toBeVisible();
      expect(screen.getByText("管段压降")).toBeVisible();

      fireEvent.change(screen.getByLabelText("变量筛选-所属对象"), {
        target: { value: "anchor" },
      });
      await waitFor(() => {
        expect(screen.getByText("入口流量")).toBeVisible();
      });
      expect(screen.queryByText("环境温度")).toBeNull();
      expect(screen.queryByText("锅炉效率")).toBeNull();
      expect(screen.queryByText("管段压降")).toBeNull();

      fireEvent.change(screen.getByLabelText("变量筛选-所属对象"), {
        target: { value: "all" },
      });
      fireEvent.change(screen.getByLabelText("变量筛选-来源"), {
        target: { value: "backend" },
      });
      await waitFor(() => {
        expect(screen.getByText("管段压降")).toBeVisible();
      });
      expect(screen.queryByText("环境温度")).toBeNull();
      expect(screen.queryByText("锅炉效率")).toBeNull();
      expect(screen.queryByText("入口流量")).toBeNull();

      fireEvent.change(screen.getByLabelText("变量筛选-来源"), {
        target: { value: "all" },
      });
      await waitFor(() => {
        expect(screen.getByText("管段压降")).toBeVisible();
      });

      fireEvent.change(screen.getByLabelText("变量名称输入-var:pipe:dp"), {
        target: { value: "主蒸汽压降" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存变量-var:pipe:dp" }));

      expect(
        appJotaiStore.get(engineeringProjectDocumentAtom).variableCatalog
          .variablesById["var:pipe:dp"].name,
      ).toBe("主蒸汽压降");
    });
  });

  it("opens full field inspector page and persists snapshot data", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
    appJotaiStore.set(
      engineeringProjectDocumentAtom,
      createProjectWithVariableCatalog(),
    );
    window.localStorage.clear();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-variables",
        },
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("engineering-variable-open-inspector"),
        ).toBeVisible();
      });

      fireEvent.click(screen.getByTestId("engineering-variable-open-inspector"));

      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledTimes(1);
      });

      const openedUrl = String(openSpy.mock.calls[0][0]);
      const parsedUrl = new URL(openedUrl);
      expect(parsedUrl.pathname).toBe("/engineering-variable-catalog-inspector");

      const snapshotKey = parsedUrl.searchParams.get("snapshotKey");
      expect(snapshotKey).toBeTruthy();

      const snapshotRaw = window.localStorage.getItem(
        `engineering-variable-catalog-inspector:${snapshotKey}`,
      );
      expect(snapshotRaw).toBeTruthy();

      const snapshot = JSON.parse(snapshotRaw as string) as {
        project: {
          variableCatalog: {
            variablesById: Record<string, { name: string }>;
          };
        };
      };
      expect(snapshot.project.variableCatalog.variablesById["var:pipe:dp"].name).toBe(
        "管段压降",
      );
    });

    openSpy.mockRestore();
  });
});
