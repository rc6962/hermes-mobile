# Mobile frontend

The React/TypeScript mobile frontend will be implemented here and packaged for Android with Capacitor.

Initial scope:

1. local backend health check;
2. bearer-authenticated Hermes API client;
3. one streaming chat run;
4. stop/reconnect handling.

Reuse candidates from Hermes' web workspace include the design system, themes, Markdown renderer, and session-list patterns. The full dashboard `ChatPage` should not be copied wholesale because it is built around xterm and the `/api/pty` TUI bridge.
