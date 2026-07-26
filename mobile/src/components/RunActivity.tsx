import type { RunState } from "../lib/run-state";

interface RunActivityProps {
  state: RunState;
}

export function RunActivity({ state }: RunActivityProps) {
  if (state.tools.length === 0 && state.reasoningText.length === 0) {
    return null;
  }

  return (
    <details className="run-activity">
      <summary>Activity ({state.tools.length} tool{state.tools.length === 1 ? "" : "s"})</summary>
      {state.reasoningText ? <p className="run-activity__reasoning">{state.reasoningText}</p> : null}
      <ul>
        {state.tools.map((tool, index) => (
          <li key={`${tool.name}-${index}`}>
            <strong>{tool.name}</strong>
            <span>{tool.status === "running" ? "Running" : "Completed"}</span>
            {tool.preview ? <code>{tool.preview}</code> : null}
            {tool.error ? <em>error</em> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
