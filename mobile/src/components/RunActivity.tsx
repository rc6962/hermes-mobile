import type { RunState } from "../lib/run-state";

interface RunActivityProps {
  state: RunState;
}

export function RunActivity({ state }: RunActivityProps) {
  if (state.tools.length === 0 && state.reasoningText.length === 0) {
    return null;
  }

  const live = ["queued", "running", "waiting_for_approval", "stopping"].includes(state.status);
  const completedTools = state.tools.filter((tool) => tool.status === "completed").length;

  return (
    <details className="run-activity" open={live}>
      <summary>
        {live ? "Live activity" : "Activity"} ({state.tools.length} tool{state.tools.length === 1 ? "" : "s"}
        {completedTools > 0 ? ` · ${completedTools} completed` : ""})
      </summary>
      {state.reasoningText ? <p className="run-activity__reasoning">{state.reasoningText}</p> : null}
      <ul>
        {state.tools.map((tool, index) => (
          <li key={`${tool.name}-${index}`}>
            <strong>{tool.name}</strong>
            <span>{tool.status === "running" ? "Running" : "Completed"}</span>
            {tool.duration !== undefined ? <span>{tool.duration.toFixed(1)}s</span> : null}
            {tool.error ? <em>error</em> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
