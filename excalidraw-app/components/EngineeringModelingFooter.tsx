import { useExcalidrawActionManager } from "@excalidraw/excalidraw/components/App";

import "./EngineeringModelingFooter.scss";

export const EngineeringModelingFooter = () => {
  const actionManager = useExcalidrawActionManager();

  return (
    <div className="engineering-modeling-footer">
      {actionManager.renderAction("toggleEngineeringComponent")}
    </div>
  );
};
