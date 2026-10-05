import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightCode } from "@lezer/highlight";

// 已加载的语言解析器缓存，避免每个代码块重复异步加载
const supportCache = new Map<string, Promise<LanguageSupport | null>>();

function loadLanguage(name: string) {
  const key = name.toLowerCase();
  let pending = supportCache.get(key);
  if (!pending) {
    const description = LanguageDescription.matchLanguageName(languages, key, true);
    pending = description ? description.load().catch(() => null) : Promise.resolve(null);
    supportCache.set(key, pending);
  }
  return pending;
}

function useLanguageSupport(language?: string) {
  const [support, setSupport] = useState<LanguageSupport | null>(null);
  useEffect(() => {
    setSupport(null);
    if (!language) return;
    let cancelled = false;
    void loadLanguage(language).then((loaded) => {
      if (!cancelled) setSupport(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);
  return support;
}

function renderHighlighted(code: string, support: LanguageSupport | null): ReactNode {
  if (!support) return code;
  const nodes: ReactNode[] = [];
  const tree = support.language.parser.parse(code);
  highlightCode(
    code,
    tree,
    classHighlighter,
    (text, classes) => {
      nodes.push(classes ? <span key={nodes.length} className={classes}>{text}</span> : text);
    },
    () => nodes.push("\n"),
  );
  return nodes;
}

interface Props {
  code: string;
  language?: string;
  /** 头部左侧显示的标签，默认使用语言名 */
  label?: string;
  className?: string;
}

export const CodeBlock = memo(function CodeBlock({ code, language, label, className }: Props) {
  const support = useLanguageSupport(language);
  const highlighted = useMemo(() => renderHighlighted(code, support), [code, support]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1500);
  };

  const copyLabel = copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制";

  return (
    <div className={`code-block${className ? ` ${className}` : ""}`}>
      <div className="code-block-header">
        <span className="code-block-lang">{label ?? language ?? "text"}</span>
        <button
          type="button"
          className={`code-block-copy ${copyState}`}
          title="复制代码"
          aria-label={copyLabel}
          onClick={() => void copy()}
        >
          {copyState === "copied" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          <span aria-live="polite">{copyLabel}</span>
        </button>
      </div>
      <pre><code>{highlighted}</code></pre>
    </div>
  );
});
