import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defense for a malformed document that normalizeLoomDocument
 * didn't anticipate — without this, an uncaught render error unmounts the
 * whole tree to a blank white page with no way back short of a manual
 * reload. There's nothing worth trying to salvage from a crashed render, so
 * recovery is just "start over": the app holds no persisted state, so a
 * reload always lands back on the bundled default document.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Loom crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>読み込みエラー</h1>
          <p>ドキュメントの読み込み中に問題が発生しました。データの形式に問題がある可能性があります。</p>
          <pre className="error-boundary-detail">{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()}>ページを再読み込み</button>
        </div>
      );
    }
    return this.props.children;
  }
}
