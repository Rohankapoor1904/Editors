import { ToolDefinition, ToolExecutor, RegisteredTool, ToolError, ValidationError, ToolSchemaProperty } from './types';

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register<T = any, R = any>(definition: ToolDefinition, executor: ToolExecutor<T, R>): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool ${definition.name} is already registered`);
    }
    this.tools.set(definition.name, { definition, executor });
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  private validateProperty(value: any, property: ToolSchemaProperty, path: string): string[] {
    const errors: string[] = [];

    if (value === undefined) {
      if (property.default !== undefined) {
        // Handled at extraction, but checking here
        return errors;
      }
      return errors; // Required checks are done at the object level
    }

    if (property.type === 'string' && typeof value !== 'string') {
      errors.push(`Invalid type for ${path}: expected string, got ${typeof value}`);
    } else if (property.type === 'number' && typeof value !== 'number') {
      errors.push(`Invalid type for ${path}: expected number, got ${typeof value}`);
    } else if (property.type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`Invalid type for ${path}: expected integer, got ${value}`);
      }
    } else if (property.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Invalid type for ${path}: expected boolean, got ${typeof value}`);
    } else if (property.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`Invalid type for ${path}: expected array, got ${typeof value}`);
      } else if (property.items) {
        value.forEach((item: any, index: number) => {
          errors.push(...this.validateProperty(item, property.items!, `${path}[${index}]`));
        });
      }
    } else if (property.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`Invalid type for ${path}: expected object, got ${typeof value}`);
      } else if (property.properties) {
        if (property.required) {
          for (const req of property.required) {
             if (value[req] === undefined) {
               errors.push(`Missing required property: ${path}.${req}`);
             }
          }
        }
        for (const key of Object.keys(value)) {
          if (property.properties[key]) {
             errors.push(...this.validateProperty(value[key], property.properties[key], `${path}.${key}`));
          }
        }
      }
    }

    if (property.enum && !property.enum.includes(value)) {
      errors.push(`Invalid value for ${path}: must be one of [${property.enum.join(', ')}]`);
    }

    return errors;
  }

  private validateArgs(args: any, definition: ToolDefinition): any {
    const validatedArgs = { ...args };
    const schema = definition.parameters;
    const errors: string[] = [];

    if (schema.type !== 'object') {
       throw new Error(`Root schema must be an object`);
    }

    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      errors.push(`Arguments must be an object`);
      throw new ValidationError('Schema validation failed', errors);
    }

    if (schema.required) {
      for (const req of schema.required) {
        if (validatedArgs[req] === undefined) {
           errors.push(`Missing required argument: ${req}`);
        }
      }
    }

    for (const key of Object.keys(schema.properties)) {
      const prop = schema.properties[key];
      if (validatedArgs[key] === undefined && prop.default !== undefined) {
        validatedArgs[key] = prop.default;
      }

      if (validatedArgs[key] !== undefined) {
         errors.push(...this.validateProperty(validatedArgs[key], prop, key));
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Schema validation failed', errors);
    }

    return validatedArgs;
  }

  async execute<R = any>(name: string, args: any): Promise<R | ToolError> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { error: `Tool not found: ${name}` };
    }

    try {
      const validatedArgs = this.validateArgs(args, tool.definition);
      return await tool.executor(validatedArgs);
    } catch (e: any) {
      if (e instanceof ValidationError) {
        return { error: 'validation_error', details: e.details };
      }
      return { error: 'execution_error', details: e.message || String(e) };
    }
  }
}

export const globalToolRegistry = new ToolRegistry();

import {
  probe_media_def, probe_media_executor,
  transcribe_and_align_def, transcribe_and_align_executor,
  detect_silence_def, detect_silence_executor,
  cut_and_arrange_timeline_def, cut_and_arrange_timeline_executor
} from './timelineTools';

globalToolRegistry.register(probe_media_def, probe_media_executor);
globalToolRegistry.register(transcribe_and_align_def, transcribe_and_align_executor);

globalToolRegistry.register(detect_silence_def, detect_silence_executor);
globalToolRegistry.register(cut_and_arrange_timeline_def, cut_and_arrange_timeline_executor);


import {
  add_subtitles_def, add_subtitles_executor,
  add_audio_track_def, add_audio_track_executor,
  render_video_def, render_video_executor,
  sequence_set_aspect_ratio_def, sequence_set_aspect_ratio_executor,
  video_apply_auto_reframe_def, video_apply_auto_reframe_executor,
  transcript_filter_tokens_def, transcript_filter_tokens_executor,
  captions_generate_karaoke_def, captions_generate_karaoke_executor,
  timeline_remove_silence_def, timeline_remove_silence_executor
} from './effectsTools';

globalToolRegistry.register(add_subtitles_def, add_subtitles_executor);
globalToolRegistry.register(add_audio_track_def, add_audio_track_executor);
globalToolRegistry.register(render_video_def, render_video_executor);

globalToolRegistry.register(sequence_set_aspect_ratio_def, sequence_set_aspect_ratio_executor);
globalToolRegistry.register(video_apply_auto_reframe_def, video_apply_auto_reframe_executor);

globalToolRegistry.register(transcript_filter_tokens_def, transcript_filter_tokens_executor);
globalToolRegistry.register(captions_generate_karaoke_def, captions_generate_karaoke_executor);
globalToolRegistry.register(timeline_remove_silence_def, timeline_remove_silence_executor);
