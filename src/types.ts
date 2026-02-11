/**
 * Lightweight types mirroring pi-coding-agent's session JSONL schema.
 * We define our own to stay decoupled from pi's install path.
 */

// --- JSONL Entry Types ---

export interface SessionHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
}

export interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface SessionMessageEntry extends SessionEntryBase {
  type: "message";
  message: AgentMessage;
}

export interface ModelChangeEntry extends SessionEntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}

export interface ThinkingLevelChangeEntry extends SessionEntryBase {
  type: "thinking_level_change";
  thinkingLevel: string;
}

export type FileEntry = SessionHeader | SessionMessageEntry | ModelChangeEntry | ThinkingLevelChangeEntry | SessionEntryBase;

// --- Message Types ---

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  text: string;
}

export interface UserMessage {
  role: "user";
  content: string | (TextContent)[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: string;
  timestamp: number;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent)[];
  isError: boolean;
  timestamp: number;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  timestamp: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | BashExecutionMessage | { role: string; timestamp?: number };

// --- Aggregated Stats Types ---

export interface ToolStats {
  name: string;
  calls: number;
  errors: number;
  sessionIds: Set<string>;
  lastUsed: Date | null;
  extension?: string;
}

export interface ModelStats {
  model: string;
  provider: string;
  calls: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
}

export interface SessionStats {
  id: string;
  cwd: string;
  project: string;
  startTime: Date;
  endTime: Date;
  duration: number; // ms
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  toolErrors: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  tools: Map<string, { calls: number; errors: number }>;
  models: Map<string, { calls: number; tokens: number; cost: number }>;
}

export interface AggregatedStats {
  period: { from: Date; to: Date; label: string };
  sessions: SessionStats[];
  totalSessions: number;
  totalMessages: number;
  totalUserMessages: number;
  totalAssistantMessages: number;
  totalToolCalls: number;
  totalToolErrors: number;
  totalTokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  totalCost: number;
  tools: Map<string, ToolStats>;
  models: Map<string, ModelStats>;
  projects: Map<string, { sessions: number; messages: number; toolCalls: number; tokens: number }>;
}

// --- Filter Types ---

export type PeriodName = "today" | "week" | "month" | "quarter" | "year" | "all";

export interface FilterOptions {
  period: PeriodName;
  from?: Date;
  to?: Date;
  project?: string;
}
