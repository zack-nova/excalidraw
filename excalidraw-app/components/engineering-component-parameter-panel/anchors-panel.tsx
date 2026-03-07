import { OutputParameterTable } from "./output-panel";
import type { OutputAnchorSection } from "./types";

export const AnchorsPanel = ({
  anchorSections,
}: {
  anchorSections: OutputAnchorSection[];
}) => {
  if (anchorSections.length === 0) {
    return (
      <div className="selected-shape-actions-placeholder">
        No anchor output parameters defined.
      </div>
    );
  }

  return (
    <div className="engineering-parameter-panel__outputSections">
      {anchorSections.map((anchorSection) => (
        <div
          className="engineering-parameter-panel__anchorSection"
          key={anchorSection.anchorId}
        >
          <div className="engineering-parameter-panel__anchorHeader">
            <div className="engineering-parameter-panel__anchorTitle">
              {anchorSection.anchorName}
            </div>
            <div className="engineering-parameter-panel__anchorMaterial">
              {anchorSection.materialType}
            </div>
          </div>
          {anchorSection.status === "loading" ? (
            <div className="selected-shape-actions-placeholder">
              Loading anchor output parameters...
            </div>
          ) : anchorSection.status === "error" ? (
            <div className="selected-shape-actions-placeholder">
              Failed to load anchor output parameters.
            </div>
          ) : anchorSection.parameters.length > 0 ? (
            <OutputParameterTable parameters={anchorSection.parameters} />
          ) : (
            <div className="selected-shape-actions-placeholder">
              No anchor output parameters defined.
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
