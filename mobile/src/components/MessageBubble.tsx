import type { BallsApi } from "../lib/balls-api";

export interface MessageBubbleProps {
  role: "user" | "assistant";
  children: React.ReactNode;
}

export function MessageBubble({ role, children }: MessageBubbleProps) {
  return (
    <article className={`message-bubble message-bubble--${role}`} aria-label={`${role} message`}>
      <span className="message-bubble__role">{role === "user" ? "You" : "Balls"}</span>
      <div className="message-bubble__content">{children}</div>
    </article>
  );
}

export type ChatApi = Pick<BallsApi, "startRun" | "subscribeToRun" | "stopRun">;
