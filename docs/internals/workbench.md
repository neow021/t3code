# Workbench beta architecture and compatibility gates

Workbench is a client-local composition layer for the Web/Desktop UI. It projects one navigation
tree (`Machine → Repo → Worktree`) into scoped Windows whose Agent, Terminal, Files, Diff, Git
Graph, and Browser surfaces are peer Panes.

## Hard compatibility constraints

These are release blockers, not follow-up work:

1. Desktop browser Web, mobile browser Web, and the Desktop app renderer are one responsive
   Workbench surface. Narrow browser viewports may show one active Pane at a time, but retain the
   same Window and Pane lifecycle; they must never fall back to the legacy ChatView because of
   viewport width. The official native Mobile app remains a separate, unchanged UI and must
   continue to connect and use Projects, threads, Agent turns, files, diffs, and terminals.
2. T3 Connect must continue to use the existing relay, DPoP/auth, environment identity, and shell
   protocols. Workbench state never becomes relay or server ownership.
3. Direct/LAN, Tailscale HTTPS, and SSH-launched environments continue to resolve to the same
   `environmentId`. Access method is not part of Machine, Window, or Pane identity.
4. New server contracts are additive. New capability fields decode as optional, and a new Web client
   sends `vcs.listCommitGraph` only when `gitCommitGraph === true`.
5. Existing clients do not need to know Workbench. An older/upstream client can use a new server;
   a new client renders a recoverable unavailable state against an older server.
6. The Beta flag is a release-channel rollout, not a per-origin product fork. Dev and Nightly
   default to Workbench on every Web origin and viewport; Alpha and Latest default off. An explicit
   user choice overrides the channel default. Disabling it returns to the upstream legacy shell
   without writing v2 state backward or dual-writing legacy placement while Workbench is active.

## Responsive Web composition

Window tabs remain horizontally scrollable at every Web viewport. Compact Web adds a second
horizontal Pane tab strip and renders the selected Pane below it. Create, activate, switch, and
close actions are touch-safe and do not depend on hover. Add Pane opens the same launcher used by
an empty Window; Files, Diff, Git Graph, and Terminal remain peer Pane types rather than Sidebar
destinations.

Composition persistence stays browser-local. Two browsers may arrange their Windows and Panes
differently, but clients on the same release channel receive the same default shell and the same
capabilities.

Workbench persists only composition descriptors. Terminal processes, browser tabs, thread data,
file state, Git data, connections, and authentication remain in their existing runtime stores.

## Additive Git Graph boundary

`vcs.listCommitGraph` is an authenticated, read-scoped, environment-routed, paginated RPC. The
Machine runs Git; the Web client receives topology, parents, refs, author/time, subject/body,
pagination, and freshness. Worktree inventory remains a separate physical-topology contract.

The Graph Pane checks the optional capability before constructing its query. This is important:
merely handling an unknown-method response would still regress old servers with noisy requests.

## Legacy migration

The first reveal of a legacy Agent imports only the currently visible composition: Agent, active
right-panel tenant, and an open terminal surface. A per-Agent marker makes this one-way operation
idempotent. Existing runtime identities are retained, including thread-bound terminal session IDs.
Historical right-panel records do not create background Windows.

Malformed or future Workbench payloads are quarantined. Structurally valid Panes whose runtime
resource is offline or unavailable retain their place and render a recoverable placeholder.

## Compatibility verification

Automated gates run before this Beta can become default-on. The 2026-08-06 implementation
checkpoint passed:

- Contracts: 229 tests, including old capability decoding and new Git Graph schema round-trips.
- Client Runtime: 533 tests; focused registry/resolver/supervisor transport identity suite: 57 tests.
- Web: 1,835 tests plus production build and lint.
- Server: 1,855 tests, including Git parser/driver/RPC/auth integration.
- Desktop: 447 tests and typecheck.
- Official Mobile: 614 tests and typecheck.
- Mobile native static harness ran; SwiftLint, ktlint, and detekt require the documented macOS tools
  and were unavailable in the Linux development environment.

### Required hands-on release matrix

Automation does not replace transport/device smoke testing. Every applicable cell below must verify
connect/reconnect, Project and thread listing, an Agent turn, supported files/diff/terminal flows,
and stable Machine identity after switching access method.

| Client          | Direct/LAN | Tailscale | T3 Connect | SSH                                       |
| --------------- | ---------- | --------- | ---------- | ----------------------------------------- |
| Web             | required   | required  | required   | forwarded endpoint when applicable        |
| Desktop         | required   | required  | required   | required                                  |
| Official Mobile | required   | required  | required   | connect to the resulting reachable server |

Also test a new client with an old server and an upstream/old client with the new server. Any
Mobile, T3 Connect, Tailscale, Direct/LAN, or SSH regression blocks default-on.
