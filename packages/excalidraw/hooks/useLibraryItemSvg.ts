import { exportToSvg } from "@excalidraw/utils/export";
import { useEffect, useState } from "react";

import { COLOR_PALETTE, FONT_FAMILY, getFontFamilyString } from "@excalidraw/common";

import { atom, useAtom } from "../editor-jotai";

import type { LibraryItem } from "../types";
import type { BinaryFiles } from "../types";

export type SvgCache = Map<LibraryItem["id"], SVGSVGElement>;

export const libraryItemSvgsCache = atom<SvgCache>(new Map());

const ENGINEERING_CHART_LIBRARY_ITEM_ID_PREFIX =
  "component-library:engineering-chart-material:";

const ENGINEERING_CHART_LIBRARY_LABEL_BY_TYPE: Record<string, string> = {
  line: "折线图",
  bar: "柱状图",
  hbar: "条形图",
  pie: "饼图",
};

const CHART_LIBRARY_OVERLAY_ATTR = "data-engineering-chart-library-overlay";
const CHART_LIBRARY_LABEL_FONT_FAMILY = getFontFamilyString({
  fontFamily: FONT_FAMILY.Excalifont,
});

export const getEngineeringChartLibraryPreviewLabel = (
  itemId: string | null,
) => {
  if (!itemId || !itemId.startsWith(ENGINEERING_CHART_LIBRARY_ITEM_ID_PREFIX)) {
    return null;
  }

  const chartType = itemId.slice(
    ENGINEERING_CHART_LIBRARY_ITEM_ID_PREFIX.length,
  );
  return ENGINEERING_CHART_LIBRARY_LABEL_BY_TYPE[chartType] || null;
};

const getSvgViewportSize = (svg: SVGSVGElement) => {
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseFloat(part))
      .filter((part) => Number.isFinite(part));
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return {
        width: parts[2],
        height: parts[3],
      };
    }
  }

  const width = Number.parseFloat(svg.getAttribute("width") || "");
  const height = Number.parseFloat(svg.getAttribute("height") || "");
  return {
    width: Number.isFinite(width) && width > 0 ? width : 100,
    height: Number.isFinite(height) && height > 0 ? height : 100,
  };
};

export const decorateEngineeringChartLibrarySvg = (
  svg: SVGSVGElement,
  itemId: string | null,
) => {
  const label = getEngineeringChartLibraryPreviewLabel(itemId);
  if (!label) {
    return svg;
  }

  svg
    .querySelectorAll(`[${CHART_LIBRARY_OVERLAY_ATTR}="true"]`)
    .forEach((node) => node.remove());

  const { width, height } = getSvgViewportSize(svg);
  const namespace = "http://www.w3.org/2000/svg";
  const textPadding = 16;
  const availableWidth = Math.max(1, width - textPadding * 2);
  const fontSize = Math.max(24, Math.round(height * 0.5));

  const border = document.createElementNS(namespace, "rect");
  border.setAttribute(CHART_LIBRARY_OVERLAY_ATTR, "true");
  border.setAttribute("x", "2");
  border.setAttribute("y", "2");
  border.setAttribute("width", `${Math.max(0, width - 4)}`);
  border.setAttribute("height", `${Math.max(0, height - 4)}`);
  border.setAttribute("rx", "8");
  border.setAttribute("fill", "none");
  border.setAttribute("stroke", "#1f2430");
  border.setAttribute("stroke-width", "2.5");
  border.setAttribute("stroke-dasharray", "8 8");
  border.setAttribute("stroke-linecap", "round");
  border.setAttribute("stroke-linejoin", "round");

  const text = document.createElementNS(namespace, "text");
  text.setAttribute(CHART_LIBRARY_OVERLAY_ATTR, "true");
  text.setAttribute("x", `${width / 2}`);
  text.setAttribute("y", `${height / 2}`);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("lengthAdjust", "spacingAndGlyphs");
  text.setAttribute("textLength", `${Math.max(1, availableWidth * 0.9)}`);
  text.setAttribute("fill", "#1f2430");
  text.setAttribute("font-family", CHART_LIBRARY_LABEL_FONT_FAMILY);
  text.setAttribute("font-size", `${fontSize}`);
  text.setAttribute("font-weight", "700");
  text.setAttribute("paint-order", "stroke");
  text.setAttribute("stroke", "#ffffff");
  text.setAttribute("stroke-width", `${Math.max(1, fontSize * 0.08)}`);
  text.textContent = label;

  svg.append(border, text);
  return svg;
};

const exportLibraryItemToSvg = async (
  id: LibraryItem["id"] | null,
  elements: LibraryItem["elements"],
  files?: BinaryFiles,
) => {
  // TODO should pass theme (appState.exportWithDark) - we're still using
  // CSS filter here
  const svg = await exportToSvg({
    elements,
    appState: {
      exportBackground: false,
      viewBackgroundColor: COLOR_PALETTE.white,
    },
    files: files || null,
    renderEmbeddables: false,
    skipInliningFonts: true,
  });
  return decorateEngineeringChartLibrarySvg(svg, id);
};

export const useLibraryItemSvg = (
  id: LibraryItem["id"] | null,
  elements: LibraryItem["elements"] | undefined,
  files: LibraryItem["files"] | undefined,
  svgCache: SvgCache,
  ref: React.RefObject<HTMLDivElement | null>,
): SVGSVGElement | undefined => {
  const [svg, setSvg] = useState<SVGSVGElement>();

  useEffect(() => {
    if (elements) {
      if (id) {
        // Try to load cached svg
        const cachedSvg = svgCache.get(id);

        if (cachedSvg) {
          decorateEngineeringChartLibrarySvg(cachedSvg, id);
          setSvg(cachedSvg);
        } else {
          // When there is no svg in cache export it and save to cache
          (async () => {
            const exportedSvg = await exportLibraryItemToSvg(
              id,
              elements,
              files,
            );
            // TODO: should likely be removed for custom fonts
            exportedSvg.querySelector(".style-fonts")?.remove();

            if (exportedSvg) {
              svgCache.set(id, exportedSvg);
              setSvg(exportedSvg);
            }
          })();
        }
      } else {
        // When we have no id (usualy selected items from canvas) just export the svg
        (async () => {
          const exportedSvg = await exportLibraryItemToSvg(
            null,
            elements,
            files,
          );
          setSvg(exportedSvg);
        })();
      }
    }
  }, [id, elements, files, svgCache, setSvg]);

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    if (svg) {
      node.innerHTML = svg.outerHTML;
    }

    return () => {
      node.innerHTML = "";
    };
  }, [svg, ref]);

  return svg;
};

export const useLibraryCache = () => {
  const [svgCache] = useAtom(libraryItemSvgsCache);

  const clearLibraryCache = () => svgCache.clear();

  const deleteItemsFromLibraryCache = (items: LibraryItem["id"][]) => {
    items.forEach((item) => svgCache.delete(item));
  };

  return {
    clearLibraryCache,
    deleteItemsFromLibraryCache,
    svgCache,
  };
};
