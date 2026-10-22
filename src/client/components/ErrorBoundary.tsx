import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/** Contains render errors to one page so the shell (and the user's data) stays intact. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error("LEVEL ONE view crashed:", error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-20 max-w-md rounded-xl border border-border bg-surface p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-danger" />
        <h2 className="mt-3 font-medium">This view hit an error</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your data is safe. {this.state.error.message}</p>
        <button className="mt-5 h-9 rounded-md border border-border px-4 text-sm hover:bg-surface-2" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
