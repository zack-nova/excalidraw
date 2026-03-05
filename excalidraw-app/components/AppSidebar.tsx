import { DefaultSidebar, Sidebar, THEME } from "@excalidraw/excalidraw";
import {
  gridIcon,
  elementLinkIcon,
  messageCircleIcon,
  presentationIcon,
} from "@excalidraw/excalidraw/components/icons";
import { LinkButton } from "@excalidraw/excalidraw/components/LinkButton";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { EngineeringStructureTreePanel } from "./EngineeringStructureTreePanel";
import { EngineeringVariableCatalogPanel } from "./EngineeringVariableCatalogPanel";

import "./AppSidebar.scss";

export const AppSidebar = () => {
  const { theme, openSidebar } = useUIAppState();

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab="engineering-structure"
          title="结构树"
          data-testid="engineering-structure-sidebar-trigger"
          style={{
            opacity: openSidebar?.tab === "engineering-structure" ? 1 : 0.4,
          }}
        >
          {elementLinkIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="engineering-variables"
          title="变量"
          data-testid="engineering-variables-sidebar-trigger"
          style={{
            opacity: openSidebar?.tab === "engineering-variables" ? 1 : 0.4,
          }}
        >
          {gridIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="comments"
          title="评论"
          data-testid="comments-sidebar-trigger"
          style={{ opacity: openSidebar?.tab === "comments" ? 1 : 0.4 }}
        >
          {messageCircleIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="presentation"
          title="演示"
          data-testid="presentation-sidebar-trigger"
          style={{ opacity: openSidebar?.tab === "presentation" ? 1 : 0.4 }}
        >
          {presentationIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab="engineering-structure" className="app-sidebar-tree-tab">
        <EngineeringStructureTreePanel />
      </Sidebar.Tab>
      <Sidebar.Tab tab="engineering-variables" className="app-sidebar-tree-tab">
        <EngineeringVariableCatalogPanel />
      </Sidebar.Tab>
      <Sidebar.Tab tab="comments">
        <div className="app-sidebar-promo-container">
          <div
            className="app-sidebar-promo-image"
            style={{
              ["--image-source" as any]: `url(/oss_promo_comments_${
                theme === THEME.DARK ? "dark" : "light"
              }.jpg)`,
              opacity: 0.7,
            }}
          />
          <div className="app-sidebar-promo-text">
            Make comments with Excalidraw+
          </div>
          <LinkButton
            href={`${
              import.meta.env.VITE_APP_PLUS_LP
            }/plus?utm_source=excalidraw&utm_medium=app&utm_content=comments_promo#excalidraw-redirect`}
          >
            Sign up now
          </LinkButton>
        </div>
      </Sidebar.Tab>
      <Sidebar.Tab tab="presentation" className="px-3">
        <div className="app-sidebar-promo-container">
          <div
            className="app-sidebar-promo-image"
            style={{
              ["--image-source" as any]: `url(/oss_promo_presentations_${
                theme === THEME.DARK ? "dark" : "light"
              }.svg)`,
              backgroundSize: "60%",
              opacity: 0.4,
            }}
          />
          <div className="app-sidebar-promo-text">
            Create presentations with Excalidraw+
          </div>
          <LinkButton
            href={`${
              import.meta.env.VITE_APP_PLUS_LP
            }/plus?utm_source=excalidraw&utm_medium=app&utm_content=presentations_promo#excalidraw-redirect`}
          >
            Sign up now
          </LinkButton>
        </div>
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
