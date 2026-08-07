import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ThreadId } from "@t3tools/contracts";
import { nextTerminalId, resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import { PlayIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ThreadTerminalDrawer from "~/components/ThreadTerminalDrawer";
import { Button } from "~/components/ui/button";
import { useKnownTerminalSessions } from "~/state/terminalSessions";
import { terminalEnvironment } from "~/state/terminal";
import { useAtomCommand } from "~/state/use-atom-command";
import { primaryServerKeybindingsAtom } from "~/state/server";
import type { PaneDescriptor } from "~/workbench/model";
import { useTerminalPaneRuntimeStore } from "~/workbench/terminalPaneRuntimeStore";

type TerminalPaneDescriptor = Extract<PaneDescriptor, { kind: "terminal" }>;

function commandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TerminalPaneSurface(props: {
  readonly pane: TerminalPaneDescriptor;
  readonly active: boolean;
}) {
  const { pane, active } = props;
  const threadId = useMemo(
    () => pane.threadId ?? ThreadId.make(`workbench-pane:${pane.id}`),
    [pane.id, pane.threadId],
  );
  const threadRef = useMemo(
    () => ({ environmentId: pane.scope.environmentId, threadId }),
    [pane.scope.environmentId, threadId],
  );
  const sessions = useKnownTerminalSessions({
    environmentId: pane.scope.environmentId,
    threadId,
  });
  const terminalIds = useMemo(
    () => sessions.map((session) => session.target.terminalId),
    [sessions],
  );
  const terminalLabelsById = useMemo(
    () =>
      new Map(
        sessions.map((session) => [
          session.target.terminalId,
          resolveTerminalSessionLabel(session.target.terminalId, session.state.summary),
        ]),
      ),
    [sessions],
  );
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const openTerminal = useAtomCommand(terminalEnvironment.open, "workbench terminal open");
  const closeTerminal = useAtomCommand(terminalEnvironment.close, "workbench terminal close");
  const [activeTerminalId, setActiveTerminalId] = useState(pane.terminalId);
  const [splitDirection, setSplitDirection] = useState<"horizontal" | "vertical">("horizontal");
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const launchRequestId = useTerminalPaneRuntimeStore(
    (state) => state.launchRequestByPaneId[pane.id] ?? 0,
  );
  const handledLaunchRequestRef = useRef(0);

  useEffect(() => {
    if (terminalIds.length === 0 || terminalIds.includes(activeTerminalId)) return;
    setActiveTerminalId(terminalIds[0]!);
  }, [activeTerminalId, terminalIds]);

  const startTerminal = useCallback(
    async (terminalIdToStart: string) => {
      setError(null);
      const result = await openTerminal({
        environmentId: pane.scope.environmentId,
        input: {
          threadId,
          terminalId: terminalIdToStart,
          cwd: pane.cwd,
          ...(pane.worktreePath !== null ? { worktreePath: pane.worktreePath } : {}),
          env: {},
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        setError(commandError(squashAtomCommandFailure(result)));
        return;
      }
      setActiveTerminalId(terminalIdToStart);
      setFocusRequestId((value) => value + 1);
    },
    [openTerminal, pane.cwd, pane.scope.environmentId, pane.worktreePath, threadId],
  );

  useEffect(() => {
    if (launchRequestId <= handledLaunchRequestRef.current || terminalIds.length > 0) {
      return;
    }
    handledLaunchRequestRef.current = launchRequestId;
    void startTerminal(pane.terminalId);
  }, [launchRequestId, pane.terminalId, startTerminal, terminalIds.length]);

  const splitTerminal = useCallback(
    (direction: "horizontal" | "vertical") => {
      const terminalIdToStart = nextTerminalId(terminalIds);
      setSplitDirection(direction);
      void startTerminal(terminalIdToStart);
    },
    [startTerminal, terminalIds],
  );

  const removeTerminal = useCallback(
    (terminalIdToClose: string) => {
      void closeTerminal({
        environmentId: pane.scope.environmentId,
        input: { threadId, terminalId: terminalIdToClose },
      });
    },
    [closeTerminal, pane.scope.environmentId, threadId],
  );

  if (terminalIds.length === 0) {
    return (
      <div className="flex size-full items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium">Terminal is not running</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Layout was restored without starting a process. Start it explicitly when ready.
          </p>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          <Button className="mt-4" size="sm" onClick={() => void startTerminal(pane.terminalId)}>
            <PlayIcon />
            Start terminal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ThreadTerminalDrawer
      mode="panel"
      threadRef={threadRef}
      threadId={threadId}
      cwd={pane.cwd}
      worktreePath={pane.worktreePath}
      runtimeEnv={{}}
      visible={active}
      height={0}
      terminalIds={terminalIds}
      activeTerminalId={activeTerminalId}
      terminalGroups={[
        {
          id: `group:${pane.id}`,
          terminalIds,
          ...(splitDirection === "vertical" ? { splitDirection } : {}),
        },
      ]}
      activeTerminalGroupId={`group:${pane.id}`}
      focusRequestId={focusRequestId}
      onSplitTerminal={() => splitTerminal("horizontal")}
      onSplitTerminalVertical={() => splitTerminal("vertical")}
      onNewTerminal={() => void startTerminal(nextTerminalId(terminalIds))}
      onActiveTerminalChange={(terminalId) => {
        setActiveTerminalId(terminalId);
        setFocusRequestId((value) => value + 1);
      }}
      onCloseTerminal={removeTerminal}
      onHeightChange={() => undefined}
      onAddTerminalContext={() => undefined}
      keybindings={keybindings}
      terminalLabelsById={terminalLabelsById}
    />
  );
}
