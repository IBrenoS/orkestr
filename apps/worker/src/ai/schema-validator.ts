/**
 * Orkestr — Schema Validator (Sprint 2)
 *
 * Validates AI output against a defined OutputSchema.
 * Lightweight — no external JSON Schema library needed for MVP.
 */
import { OutputSchema } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a data object against an OutputSchema.
 * Checks: required fields present, field types match.
 */
export function validateOutputSchema(
  data: Record<string, unknown>,
  schema: OutputSchema,
): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['Response is not a JSON object'] };
  }

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data) || data[field] === undefined || data[field] === null) {
        errors.push(`Missing required field: "${field}"`);
      }
    }
  }

  // Check field types
  for (const [field, def] of Object.entries(schema.properties)) {
    if (!(field in data)) continue; // only validate present fields

    const value = data[field];
    const expectedType = def.type;

    if (!matchesType(value, expectedType)) {
      errors.push(
        `Field "${field}" expected type "${expectedType}" but got "${typeof value}"`,
      );
    }

    // Check enum constraint
    if (def.enum && !def.enum.includes(String(value))) {
      errors.push(
        `Field "${field}" value "${value}" not in allowed values: [${def.enum.join(', ')}]`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

function matchesType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true; // unknown type → pass
  }
}
