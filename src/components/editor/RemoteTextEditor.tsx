import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { emitTo } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlertTriangle,
  Check,
  FileCode2,
  LoaderCircle,
  RefreshCw,
  Save,
  WrapText,
} from "lucide-react";
import {
  readRemoteText,
  saveRemoteText,
  SftpTextConflictError,
  type RemoteTextDocument,
} from "../../api/sftpText";
import {
  REMOTE_TEXT_SAVED_EVENT,
  type RemoteEditorTarget,
  type RemoteTextSavedEvent,
} from "../../services/editorWindowService";
import { useThemeStore } from "../../store/themeStore";
import { WindowTitleBar } from "../common/WindowTitleBar";

interface Props {
  target: RemoteEditorTarget;
}

type RequestState = "loading" | "ready" | "saving" | "saved" | "error" | "conflict";

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(size < 1024 * 100 ? 1 : 0)} KB`;
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

async function closeCurrentWindow() {
  if (isTauri()) {
    await getCurrentWindow().destroy();
    return;
  }
  window.close();
}

export function RemoteTextEditor({ target }: Props) {
  const themeMode = useThemeStore((state) => state.mode);
  const [documentInfo, setDocumentInfo] = useState<RemoteTextDocument | null>(null);
  const [value, setValue] = useState("");
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [languageName, setLanguageName] = useState("纯文本");
  const [languageExtension, setLanguageExtension] = useState<Extension[]>([]);
  const contentRef = useRef("");
  const documentRef = useRef<RemoteTextDocument | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const closingRef = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);

  const setDirtyState = useCallback((nextDirty: boolean) => {
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
  }, []);

  const loadDocument = useCallback(async (confirmDiscard: boolean) => {
    if (
      confirmDiscard &&
      dirtyRef.current &&
      !window.confirm("当前修改尚未保存，确定要重新加载远程文件吗？")
    ) {
      return;
    }

    setRequestState("loading");
    setErrorMessage(null);
    try {
      const loaded = await readRemoteText(target.connectionId, target.path);
      documentRef.current = loaded;
      contentRef.current = loaded.content;
      setDocumentInfo(loaded);
      setValue(loaded.content);
      setDirtyState(false);
      setRequestState("ready");
    } catch (reason) {
      setRequestState("error");
      setErrorMessage(messageOf(reason));
    }
  }, [setDirtyState, target.connectionId, target.path]);

  useEffect(() => {
    void loadDocument(false);
  }, [loadDocument]);

  useEffect(() => {
    let cancelled = false;
    const description = LanguageDescription.matchFilename(languages, target.fileName);
    if (!description) {
      setLanguageName("纯文本");
      setLanguageExtension([]);
      return;
    }
    setLanguageName(description.name);
    void description.load()
      .then((support) => {
        if (!cancelled) setLanguageExtension([support]);
      })
      .catch(() => {
        if (!cancelled) {
          setLanguageName("纯文本");
          setLanguageExtension([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target.fileName]);

  const handleSave = useCallback(async () => {
    const currentDocument = documentRef.current;
    if (!currentDocument || savingRef.current || !dirtyRef.current) return;

    const savingContent = contentRef.current;
    savingRef.current = true;
    setRequestState("saving");
    setErrorMessage(null);
    try {
      const saved = await saveRemoteText({
        connectionId: target.connectionId,
        path: target.path,
        content: savingContent,
        version: currentDocument.version,
        encoding: currentDocument.encoding,
        lineEnding: currentDocument.lineEnding,
      });
      documentRef.current = saved;
      setDocumentInfo(saved);
      const unchangedWhileSaving = contentRef.current === savingContent;
      setDirtyState(!unchangedWhileSaving);
      setRequestState(unchangedWhileSaving ? "saved" : "ready");

      if (isTauri()) {
        const payload: RemoteTextSavedEvent = {
          connectionId: target.connectionId,
          path: target.path,
          size: saved.size,
          modifiedAt: saved.modifiedAt,
        };
        await emitTo("main", REMOTE_TEXT_SAVED_EVENT, payload);
      }
    } catch (reason) {
      const conflict = reason instanceof SftpTextConflictError;
      setRequestState(conflict ? "conflict" : "error");
      setErrorMessage(messageOf(reason));
    } finally {
      savingRef.current = false;
    }
  }, [setDirtyState, target.connectionId, target.path]);

  saveRef.current = handleSave;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (!dirtyRef.current || closingRef.current) return;
      event.preventDefault();
      if (!window.confirm("当前修改尚未保存，确定要关闭编辑器吗？")) return;
      closingRef.current = true;
      dirtyRef.current = false;
      await getCurrentWindow().destroy();
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const title = `${dirty ? "● " : ""}${target.fileName} - CrowSSH`;
    document.title = title;
    if (isTauri()) void getCurrentWindow().setTitle(title);
  }, [dirty, target.fileName]);

  const editorTheme = useMemo(
    () => EditorView.theme(
      {
        "&": { height: "100%", backgroundColor: "var(--bg-terminal)", color: "var(--fg)" },
        ".cm-content": { caretColor: "var(--fg)", fontFamily: "var(--font-mono)" },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--fg)" },
        ".cm-gutters": {
          backgroundColor: "var(--bg-island)",
          color: "var(--fg-disabled)",
          borderRight: "1px solid var(--border-subtle)",
        },
        ".cm-activeLine": { backgroundColor: "var(--bg-hover)" },
        ".cm-activeLineGutter": { backgroundColor: "var(--bg-hover)", color: "var(--fg-muted)" },
        "&.cm-focused .cm-selectionBackground, ::selection": {
          backgroundColor: "var(--bg-selected)",
        },
        ".cm-selectionMatch": { backgroundColor: "var(--bg-selected-soft)" },
        ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
        ".cm-panels": { backgroundColor: "var(--bg-elevated)", color: "var(--fg)" },
        ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
        ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--warning) 35%, transparent)" },
      },
      { dark: themeMode !== "light" },
    ),
    [themeMode],
  );

  const extensions = useMemo(() => {
    const base: Extension[] = [
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({ "aria-label": `编辑 ${target.fileName}` }),
      editorTheme,
      ...languageExtension,
    ];
    if (wrapLines) base.push(EditorView.lineWrapping);
    return base;
  }, [editorTheme, languageExtension, target.fileName, wrapLines]);

  const handleEditorUpdate = useCallback((update: ViewUpdate) => {
    if (!update.selectionSet && !update.docChanged) return;
    const head = update.state.selection.main.head;
    const line = update.state.doc.lineAt(head);
    setCursor({ line: line.number, column: head - line.from + 1 });
  }, []);

  const statusLabel = requestState === "saving"
    ? "正在保存"
    : dirty
      ? "未保存"
      : requestState === "saved"
        ? "已保存"
        : "已同步";

  return (
    <main
      className={`remote-editor${
        documentInfo ? (errorMessage ? " has-notice" : "") : " document-unavailable"
      }`}
    >
      <WindowTitleBar className="editor-toolbar">
        <div className="editor-file-heading" title={target.path}>
          <FileCode2 size={16} />
          <div className="editor-file-copy">
            <strong>{target.fileName}</strong>
            <span>{target.serverName} · {target.path}</span>
          </div>
        </div>
        {documentInfo && (
          <div className="editor-toolbar-actions">
            <span className={`editor-save-state ${dirty ? "dirty" : ""}`}>
              {requestState === "saving" ? (
                <LoaderCircle size={13} className="spin" />
              ) : (
                <Check size={13} />
              )}
              {statusLabel}
            </span>
            <button
              className={`icon-btn${wrapLines ? " active" : ""}`}
              type="button"
              title="自动换行"
              aria-pressed={wrapLines}
              onClick={() => setWrapLines((current) => !current)}
            >
              <WrapText size={16} />
            </button>
            <button
              className="icon-btn"
              type="button"
              title="重新加载"
              disabled={requestState === "saving" || requestState === "loading"}
              onClick={() => void loadDocument(true)}
            >
              <RefreshCw
                size={16}
                className={requestState === "loading" ? "spin" : undefined}
              />
            </button>
            <button
              className="icon-btn editor-save-button"
              type="button"
              title="保存"
              disabled={!dirty || requestState === "saving"}
              onClick={() => void handleSave()}
            >
              <Save size={16} />
            </button>
          </div>
        )}
      </WindowTitleBar>

      {!documentInfo ? (
        requestState === "loading" ? (
          <section className="editor-loading">
            <LoaderCircle size={28} className="spin" />
            <span>正在读取 {target.fileName}</span>
          </section>
        ) : (
          <section className="editor-load-error">
            <AlertTriangle size={30} />
            <h1>无法打开 {target.fileName}</h1>
            <p>{errorMessage || "读取远程文件失败"}</p>
            <div className="editor-error-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void loadDocument(false)}
              >
                <RefreshCw size={14} /> 重试
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void closeCurrentWindow().catch((reason) => {
                    setErrorMessage(`无法关闭编辑器窗口：${messageOf(reason)}`);
                  });
                }}
              >
                关闭
              </button>
            </div>
          </section>
        )
      ) : (
        <>
          {errorMessage && (
            <div
              className={`editor-notice ${requestState === "conflict" ? "conflict" : "error"}`}
              role="alert"
            >
              <AlertTriangle size={15} />
              <span>{errorMessage}</span>
              {requestState === "conflict" && (
                <button type="button" onClick={() => void loadDocument(true)}>
                  重新加载
                </button>
              )}
            </div>
          )}

          <section className="editor-surface">
            <CodeMirror
              value={value}
              height="100%"
              theme="none"
              extensions={extensions}
              basicSetup
              autoFocus
              indentWithTab
              onChange={(nextValue) => {
                contentRef.current = nextValue;
                setValue(nextValue);
                setDirtyState(true);
                if (requestState !== "saving") setRequestState("ready");
                if (requestState !== "conflict") setErrorMessage(null);
              }}
              onUpdate={handleEditorUpdate}
            />
          </section>

          <footer className="editor-statusbar">
            <span>行 {cursor.line}，列 {cursor.column}</span>
            <div>
              <span>{languageName}</span>
              <span>{documentInfo.encoding}</span>
              <span>{documentInfo.lineEnding}</span>
              <span>{formatSize(documentInfo.size)}</span>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
