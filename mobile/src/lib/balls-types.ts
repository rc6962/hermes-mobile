export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

export interface CapabilitiesResponse {
  object?: string;
  platform?: string;
  model?: string;
  auth?: { type?: string; required?: boolean };
  features?: Record<string, boolean>;
  attachments?: {
    image_types?: string[];
    document_types?: string[];
    max_file_bytes?: number;
    max_document_text_chars?: number;
    document_intake?: Record<string, boolean>;
  };
  endpoints?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RunStarted {
  runId: string;
  status: string;
}

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export type RunInput = string | Array<TextContentPart | ImageContentPart>;

export interface RunSubmissionInput {
  input: RunInput;
  sessionId?: string;
  attachmentIds?: string[];
}

export type ApprovalChoice = "once" | "session" | "always" | "deny";

export interface ApprovalDecision {
  choice: ApprovalChoice;
  resolveAll?: boolean;
}

export interface SessionCreateInput {
  id?: string;
  title?: string;
  model?: string;
  systemPrompt?: string;
}

export interface SessionSummary {
  id: string;
  [key: string]: unknown;
}

export interface SessionListResponse {
  object?: string;
  data: SessionSummary[];
  limit?: number;
  offset?: number;
  has_more?: boolean;
  [key: string]: unknown;
}

export interface SessionMessagesResponse {
  object?: string;
  session_id: string;
  data: unknown[];
  [key: string]: unknown;
}

export interface ApprovalResponse {
  run_id: string;
  choice: ApprovalChoice;
  resolved?: number;
  [key: string]: unknown;
}

export interface RunControlResponse {
  run_id: string;
  status: string;
  [key: string]: unknown;
}
