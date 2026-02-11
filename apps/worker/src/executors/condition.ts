/**
 * Orkestr — Condition Executor (DSL)
 *
 * Evaluates a deterministic rule against the step input using a safe,
 * typed DSL — no vm.runInNewContext, no eval, no sandbox escapes.
 *
 * Supported rule formats:
 *
 * 1. DSL object (preferred):
 *    { field: "amount", operator: "greater_than", value: 100 }
 *
 * 2. Compound (AND/OR):
 *    { and: [ { field: "amount", operator: "gte", value: 100 }, { field: "status", operator: "equals", value: "overdue" } ] }
 *    { or: [ ... ] }
 *
 * Routes: true → next step linearly, false → config.onFalse or '__end__'.
 */
import { StepContext, StepResult } from './types';

// ─── Supported operators ─────────────────────────────────────

type Operator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'gt'
  | 'greater_than_or_equal' | 'gte'
  | 'less_than' | 'lt'
  | 'less_than_or_equal' | 'lte'
  | 'contains' | 'not_contains'
  | 'in' | 'not_in'
  | 'exists' | 'not_exists';

interface SingleRule {
  field: string;
  operator: Operator;
  value?: unknown;
}

interface CompoundRule {
  and?: ConditionRule[];
  or?: ConditionRule[];
}

type ConditionRule = SingleRule | CompoundRule;

// ─── Field resolver (supports dot notation) ──────────────────

function resolveField(data: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Single rule evaluator ───────────────────────────────────

function evaluateSingle(rule: SingleRule, data: Record<string, unknown>): boolean {
  const fieldValue = resolveField(data, rule.field);

  switch (rule.operator) {
    case 'equals':
      return fieldValue === rule.value;
    case 'not_equals':
      return fieldValue !== rule.value;
    case 'greater_than':
    case 'gt':
      return Number(fieldValue) > Number(rule.value);
    case 'greater_than_or_equal':
    case 'gte':
      return Number(fieldValue) >= Number(rule.value);
    case 'less_than':
    case 'lt':
      return Number(fieldValue) < Number(rule.value);
    case 'less_than_or_equal':
    case 'lte':
      return Number(fieldValue) <= Number(rule.value);
    case 'contains':
      return typeof fieldValue === 'string' && typeof rule.value === 'string'
        ? fieldValue.includes(rule.value)
        : Array.isArray(fieldValue) && fieldValue.includes(rule.value);
    case 'not_contains':
      return typeof fieldValue === 'string' && typeof rule.value === 'string'
        ? !fieldValue.includes(rule.value)
        : Array.isArray(fieldValue) && !fieldValue.includes(rule.value);
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(fieldValue);
    case 'not_in':
      return Array.isArray(rule.value) && !rule.value.includes(fieldValue);
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    case 'not_exists':
      return fieldValue === undefined || fieldValue === null;
    default:
      throw new Error(`Unknown operator: ${rule.operator}`);
  }
}

// ─── Recursive compound evaluator ────────────────────────────

function evaluateRule(rule: ConditionRule, data: Record<string, unknown>): boolean {
  if ('and' in rule && Array.isArray(rule.and)) {
    return rule.and.every((r) => evaluateRule(r, data));
  }
  if ('or' in rule && Array.isArray(rule.or)) {
    return rule.or.some((r) => evaluateRule(r, data));
  }
  if ('field' in rule && 'operator' in rule) {
    return evaluateSingle(rule as SingleRule, data);
  }
  throw new Error(`Invalid condition rule: ${JSON.stringify(rule)}`);
}

// ─── Validate rule structure at execution time ───────────────

const VALID_OPERATORS = new Set<string>([
  'equals', 'not_equals',
  'greater_than', 'gt', 'greater_than_or_equal', 'gte',
  'less_than', 'lt', 'less_than_or_equal', 'lte',
  'contains', 'not_contains',
  'in', 'not_in',
  'exists', 'not_exists',
]);

function validateRule(rule: ConditionRule): void {
  if ('and' in rule && Array.isArray(rule.and)) {
    rule.and.forEach(validateRule);
    return;
  }
  if ('or' in rule && Array.isArray(rule.or)) {
    rule.or.forEach(validateRule);
    return;
  }
  const single = rule as SingleRule;
  if (!single.field || typeof single.field !== 'string') {
    throw new Error(`Condition rule missing "field": ${JSON.stringify(rule)}`);
  }
  if (!single.operator || !VALID_OPERATORS.has(single.operator)) {
    throw new Error(
      `Invalid operator "${single.operator}" in condition rule. ` +
      `Valid: ${[...VALID_OPERATORS].join(', ')}`,
    );
  }
}

// ─── Main executor ───────────────────────────────────────────

export async function executeCondition(ctx: StepContext): Promise<StepResult> {
  const rule = ctx.config.rule as ConditionRule | undefined;
  if (!rule) {
    throw new Error(`Condition step "${ctx.stepKey}" missing "rule" in config`);
  }

  validateRule(rule);
  const result = evaluateRule(rule, ctx.input);

  console.log(
    `[Condition] "${ctx.stepKey}": rule=${JSON.stringify(rule)} → ${result}`,
  );

  return {
    output: {
      result,
      rule,
      evaluatedWith: ctx.input,
    },
    nextStepKey: result ? undefined : ((ctx.config.onFalse as string) || '__end__'),
  };
}
