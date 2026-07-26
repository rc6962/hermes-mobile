export type RunStatus =
  | "idle"
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled";

export interface ToolActivity {
  name: string;
  preview?: string;
  status: "running" | "completed";
  duration?: number;
  error?: boolean;
}

export interface ApprovalRequest {
  command?: string;
  choices: string[];
}

export interface RunState {
  status: RunStatus;
  assistantText: string;
  reasoningText: string;
  tools: ToolActivity[];
  approval?: ApprovalRequest;
  error?: string;
  terminalEvent?: Record<string, unknown>;
}

export type RunEvent = Record<string, unknown>;

const terminalStatuses = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export function initialRunState(): RunState {
  return {
    status: "idle",
    assistantText: "",
    reasoningText: "",
    tools: [],
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function eventName(event: RunEvent): string | undefined {
  return stringValue(event.event) ?? stringValue(event.type);
}

export function reduceRunEvent(state: RunState, event: RunEvent): RunState {
  if (terminalStatuses.has(state.status)) {
    return state;
  }

  switch (eventName(event)) {
    case "run.queued":
      return { ...state, status: "queued" };
    case "run.started":
      return { ...state, status: "running" };
    case "run.stopping":
      return { ...state, status: "stopping" };
    case "message.delta": {
      const delta = stringValue(event.delta) ?? stringValue(event.text) ?? "";
      return {
        ...state,
        status: state.status === "idle" || state.status === "queued" ? "running" : state.status,
        assistantText: state.assistantText + delta,
      };
    }
    case "reasoning.available": {
      const text = stringValue(event.text) ?? "";
      return { ...state, reasoningText: state.reasoningText + text };
    }
    case "tool.started": {
      const name = stringValue(event.tool) ?? "unknown tool";
      const preview = stringValue(event.preview);
      return {
        ...state,
        status: "running",
        tools: [
          ...state.tools,
          {
            name,
            ...(preview ? { preview } : {}),
            status: "running",
          },
        ],
      };
    }
    case "tool.completed": {
      const name = stringValue(event.tool) ?? "unknown tool";
      const index = [...state.tools]
        .map((tool, toolIndex) => ({ tool, toolIndex }))
        .reverse()
        .find(({ tool }) => tool.name === name && tool.status === "running")?.toolIndex;
      const duration = typeof event.duration === "number" ? event.duration : undefined;
      const error = typeof event.error === "boolean" ? event.error : undefined;

      if (index === undefined) {
        return {
          ...state,
          tools: [
            ...state.tools,
            {
              name,
              status: "completed",
              ...(duration !== undefined ? { duration } : {}),
              ...(error !== undefined ? { error } : {}),
            },
          ],
        };
      }

      const tools = state.tools.slice();
      tools[index] = {
        ...tools[index],
        status: "completed",
        ...(duration !== undefined ? { duration } : {}),
        ...(error !== undefined ? { error } : {}),
      };
      return { ...state, tools };
    }
    case "approval.request": {
      const choices = Array.isArray(event.choices)
        ? event.choices.filter((choice): choice is string => typeof choice === "string")
        : [];
      const command = stringValue(event.command);
      return {
        ...state,
        status: "waiting_for_approval",
        approval: {
          ...(command ? { command } : {}),
          choices,
        },
      };
    }
    case "approval.responded":
      return { ...state, status: "running", approval: undefined };
    case "run.completed": {
      const output = stringValue(event.output);
      return {
        ...state,
        status: "completed",
        assistantText: state.assistantText || output || "",
        terminalEvent: event,
      };
    }
    case "run.failed":
      return {
        ...state,
        status: "failed",
        error: stringValue(event.error) ?? "Hermes run failed",
        terminalEvent: event,
      };
    case "run.cancelled":
      return { ...state, status: "cancelled", terminalEvent: event };
    default:
      return state;
  }
}
