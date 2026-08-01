import ReactDOM from "react-dom/client";
import { RemoteTextEditor } from "./components/editor/RemoteTextEditor";
import { useThemeStore } from "./store/themeStore";
import { applyTokens } from "./theme/themes";
import type { RemoteEditorTarget } from "./services/editorWindowService";
import "./theme.css";
import "./components/editor/editor.css";

applyTokens(useThemeStore.getState().tokens);

function readTarget(): RemoteEditorTarget | null {
  const params = new URLSearchParams(window.location.search);
  const connectionId = params.get("connectionId")?.trim();
  const path = params.get("path")?.trim();
  const fileName = params.get("fileName")?.trim();
  const serverName = params.get("serverName")?.trim();
  if (!connectionId || !path || !fileName || !serverName) return null;
  return { connectionId, path, fileName, serverName };
}

const target = readTarget();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  target ? (
    <RemoteTextEditor target={target} />
  ) : (
    <main className="editor-invalid">
      <h1>无法打开远程文件</h1>
      <p>编辑器窗口缺少必要的文件信息。</p>
    </main>
  ),
);
