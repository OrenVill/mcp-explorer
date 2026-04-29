export type ServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ServerEntry {
  id: string;
  name: string;
  url: string;
  description?: string;
  status: ServerStatus;
  error?: string;
  tools?: ToolDef[];
  custom?: boolean;
}

export interface ToolDef {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
}

export interface ToolContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}
