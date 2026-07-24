import ReactDOM from "react-dom/client";
import App from "./App";
import { useThemeStore } from "./store/themeStore";
import { applyTokens } from "./theme/themes";
import "./theme.css";

// 首屏同步注入初始主题，避免 FOUC
applyTokens(useThemeStore.getState().tokens);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
