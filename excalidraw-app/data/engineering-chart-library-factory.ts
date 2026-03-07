import { newElement } from "@excalidraw/element";
import type { LibraryItem } from "@excalidraw/excalidraw/types";
import {
  ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT,
  ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH,
  ENGINEERING_CHART_MATERIAL_META_KEY,
  createDefaultChartMaterial,
  getEngineeringChartTemplateDefinitions,
} from "./engineering-chart-material-model";

const ENGINEERING_CHART_MATERIAL_SOURCE_ID = "engineering-system";
const ENGINEERING_CHART_MATERIAL_SOURCE_NAME = "系统素材";

export const createEngineeringChartMaterialLibraryItems = () =>
  getEngineeringChartTemplateDefinitions().map((definition): LibraryItem => ({
    id: `component-library:engineering-chart-material:${definition.chartType}`,
    status: "unpublished",
    created: Date.now(),
    name: definition.name,
    sourceId: ENGINEERING_CHART_MATERIAL_SOURCE_ID,
    sourceName: ENGINEERING_CHART_MATERIAL_SOURCE_NAME,
    sourceKind: "public",
    componentGroup: "图示",
    searchKeywords: [
      "图示",
      definition.name,
      definition.chartType,
      "chart",
      "vars",
      "{{...}}",
    ],
    elements: [
      newElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH,
        height: ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT,
        customData: {
          [ENGINEERING_CHART_MATERIAL_META_KEY]: createDefaultChartMaterial(
            definition.chartType,
          ),
        },
      }),
    ],
  }));
