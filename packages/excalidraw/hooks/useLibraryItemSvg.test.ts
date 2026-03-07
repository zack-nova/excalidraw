import { describe, expect, it } from "vitest";

import {
  decorateEngineeringChartLibrarySvg,
  getEngineeringChartLibraryPreviewLabel,
} from "./useLibraryItemSvg";

const SVG_NS = "http://www.w3.org/2000/svg";

const createSvg = () => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 480 320");
  return svg;
};

describe("useLibraryItemSvg engineering chart preview decoration", () => {
  it("maps chart library ids to localized labels", () => {
    expect(
      getEngineeringChartLibraryPreviewLabel(
        "component-library:engineering-chart-material:line",
      ),
    ).toBe("折线图");
    expect(
      getEngineeringChartLibraryPreviewLabel(
        "component-library:engineering-chart-material:bar",
      ),
    ).toBe("柱状图");
    expect(
      getEngineeringChartLibraryPreviewLabel(
        "component-library:engineering-chart-material:hbar",
      ),
    ).toBe("条形图");
    expect(
      getEngineeringChartLibraryPreviewLabel(
        "component-library:engineering-chart-material:pie",
      ),
    ).toBe("饼图");
    expect(
      getEngineeringChartLibraryPreviewLabel("component-library:engineering-table-material"),
    ).toBeNull();
  });

  it("adds preview border and label for engineering chart library item svg", () => {
    const svg = createSvg();

    decorateEngineeringChartLibrarySvg(
      svg,
      "component-library:engineering-chart-material:line",
    );

    const border = svg.querySelector(
      'rect[data-engineering-chart-library-overlay="true"]',
    );
    const label = svg.querySelector(
      'text[data-engineering-chart-library-overlay="true"]',
    );

    expect(border).toBeTruthy();
    expect(border?.getAttribute("rx")).toBe("8");
    expect(border?.getAttribute("stroke-dasharray")).toBe("8 8");
    expect(label?.textContent).toBe("折线图");
    expect(label?.getAttribute("x")).toBe("240");
    expect(label?.getAttribute("y")).toBe("160");
    expect(label?.getAttribute("text-anchor")).toBe("middle");
    expect(label?.getAttribute("dominant-baseline")).toBe("middle");
    expect(label?.getAttribute("font-family")).toContain("Excalifont");
    expect(
      Number.parseFloat(label?.getAttribute("font-size") || "0"),
    ).toBe(160);

    decorateEngineeringChartLibrarySvg(
      svg,
      "component-library:engineering-chart-material:line",
    );
    expect(
      svg.querySelectorAll('rect[data-engineering-chart-library-overlay="true"]'),
    ).toHaveLength(1);
    expect(
      svg.querySelectorAll('text[data-engineering-chart-library-overlay="true"]'),
    ).toHaveLength(1);
  });

  it("does not decorate non-chart library item svg", () => {
    const svg = createSvg();

    decorateEngineeringChartLibrarySvg(
      svg,
      "component-library:engineering-table-material",
    );

    expect(
      svg.querySelector('rect[data-engineering-chart-library-overlay="true"]'),
    ).toBeNull();
    expect(
      svg.querySelector('text[data-engineering-chart-library-overlay="true"]'),
    ).toBeNull();
  });
});
