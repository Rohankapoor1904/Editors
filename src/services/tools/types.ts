export interface ToolSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  default?: any;
  items?: ToolSchemaProperty;
  properties?: Record<string, ToolSchemaProperty>;
  required?: string[];
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, ToolSchemaProperty>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolSchema;
}

export interface ToolError {
  error: string;
  details?: any;
}

export type ToolExecutor<T = any, R = any> = (args: T) => Promise<R | ToolError>;

export interface RegisteredTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

export class ValidationError extends Error {
  public details: string[];
  constructor(message: string, details: string[]) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}
