import { Component, type ReactNode } from "react";

interface Props {
  fallback?: (msg: string) => ReactNode;
  children: ReactNode;
}
interface State {
  hasError: boolean;
  msg: string;
}

/** 隔离子树运行时错误，避免单点崩溃拖垮整个工作台 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, msg: "" };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ? (
        this.props.fallback(this.state.msg)
      ) : (
        <div className="empty-state">
          <div className="empty-title">加载失败</div>
          <div className="empty-hint">{this.state.msg}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
