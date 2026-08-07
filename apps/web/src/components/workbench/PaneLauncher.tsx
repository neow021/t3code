export function PaneLauncher() {
  return (
    <div className="flex size-full items-center justify-center p-6 text-center">
      <div>
        <p className="text-sm font-medium">Empty Window</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Open an Agent, Terminal, Files, Diff, Git Graph, or Browser Pane from the Sidebar or
          command palette.
        </p>
      </div>
    </div>
  );
}
