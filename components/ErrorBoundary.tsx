"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="state-box error">
          <div className="state-box-title">Something broke in {this.props.label ?? "this view"}</div>
          <p>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
