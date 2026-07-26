import type { HermesApi } from "../lib/hermes-api";

export interface MessageBubbleProps {
  role: "user" | "assistant";
  children: React.ReactNode;
}

export function MessageBubble({ role, children }: MessageBubbleProps) {
  return (
    <article className={`message-bubble message-bubble--${role}`} aria-label={`${role} message`}>
      <span className="message-bubble__role">{role === "user" ? "You" : "Hermes"}</span>
      <div className="message-bubble__content">{children}</div>
    </article>
  );
}

export type ChatApi = Pick<HermesApi, "startRun" | "subscribeToRun" | "stopRun">;
