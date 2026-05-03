export type ServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Persisted auth configuration for MCP HTTP requests (merged into StreamableHTTPClientTransport requestInit). */
export type ServerAuthMethod = 'none' | 'bearer' | 'api_key' | 'basic';

export interface ServerAuth {
  method: ServerAuthMethod;
  /** Authorization: Bearer … */
  bearerToken?: string;
  /** Custom header name (e.g. X-API-Key, Authorization) */
  apiKeyHeader?: string;
  apiKeyValue?: string;
  basicUsername?: string;
  basicPassword?: string;
}

export interface ServerEntry {
  id: string;
  name: string;
  url: string;
  description?: string;
  /** Optional HTTP auth for the MCP endpoint */
  auth?: ServerAuth;
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
