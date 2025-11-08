import { z } from 'zod';
import { tool } from '@openai/agents';
import { TrendyolClient, TrendyolResponse } from './trendyolClient';

const QuerySchema = z
  .record(z.union([z.string(), z.number(), z.boolean()]))
  .describe('Optional query string parameters appended to the request URL.')
  .optional();

const ReadParameters = z.object({
  path: z
    .string()
    .min(
      1,
      'Provide the Trendyol API path, for example `/suppliers/{supplierId}/products`.',
    )
    .describe(
      'Relative Trendyol API path. Use `{supplierId}` as a placeholder if needed.',
    ),
  query: QuerySchema,
});

const MutateParameters = z.object({
  method: z
    .enum(['POST', 'PUT', 'PATCH', 'DELETE'])
    .describe('HTTP method for the mutation request.'),
  path: z
    .string()
    .min(
      1,
      'Provide the Trendyol API path, for example `/suppliers/{supplierId}/products`.',
    )
    .describe(
      'Relative Trendyol API path. Use `{supplierId}` as a placeholder if needed.',
    ),
  summary: z
    .string()
    .min(3, 'Add a short reason for the mutation request.')
    .describe('Short explanation that will appear in the approval prompt.'),
  query: QuerySchema,
  body: z
    .any()
    .optional()
    .describe('Optional JSON body to send with the mutation.'),
});

type ReadParametersInput = z.infer<typeof ReadParameters>;
type MutateParametersInput = z.infer<typeof MutateParameters>;

export function createTrendyolTools(client: TrendyolClient) {
  const readTool = tool({
    name: 'trendyol_read',
    description:
      'Call read-only Trendyol Supplier API endpoints. Use it to inspect products, orders, campaigns, or reports before making changes.',
    parameters: ReadParameters,
    execute: async ({ path, query }: ReadParametersInput) => {
      const response = await client.get(
        expandPath(path, client.supplierId),
        query,
      );
      return sanitizeResponse(response);
    },
  });

  const mutateTool = tool({
    name: 'trendyol_mutation',
    description:
      'Call mutating Trendyol Supplier API endpoints (POST/PUT/PATCH/DELETE). Always confirm the intent in `summary` and prefer batching related updates into one request.',
    parameters: MutateParameters,
    needsApproval: async (_ctx: unknown, params: MutateParametersInput) => {
      if (params.method === 'DELETE') {
        return true;
      }

      const budget = findLargestNumber(params.body, [
        'budget',
        'dailyBudget',
        'totalBudget',
      ]);
      if (budget !== null && budget > client.autoApproveMaxBudget) {
        return true;
      }

      const quantity = findLargestNumber(params.body, [
        'quantity',
        'quantityChange',
        'availableStock',
        'stock',
      ]);
      if (quantity !== null && quantity > client.autoApproveMaxQuantity) {
        return true;
      }

      return false;
    },
    execute: async ({ method, path, query, body }: MutateParametersInput) => {
      const response = await client.mutate(
        method,
        expandPath(path, client.supplierId),
        body,
        query,
      );
      return sanitizeResponse(response);
    },
  });

  return { readTool, mutateTool } as const;
}

function expandPath(path: string, supplierId: string): string {
  return path.split('{supplierId}').join(supplierId);
}

function sanitizeResponse<T>(response: TrendyolResponse<T>) {
  return {
    status: response.status,
    headers: response.headers,
    data: response.data,
  };
}

function findLargestNumber(
  payload: unknown,
  candidateKeys: string[],
): number | null {
  const numbers: number[] = [];

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  for (const key of candidateKeys) {
    const directValue = (payload as Record<string, unknown>)[key];
    const numeric = toNumber(directValue);
    if (numeric !== null) {
      numbers.push(numeric);
    }
  }

  if (Array.isArray((payload as Record<string, unknown>).items)) {
    for (const item of (payload as Record<string, unknown>)
      .items as unknown[]) {
      const nested = findLargestNumber(item, candidateKeys);
      if (nested !== null) {
        numbers.push(nested);
      }
    }
  }

  if (numbers.length === 0) {
    return null;
  }

  return Math.max(...numbers);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}
