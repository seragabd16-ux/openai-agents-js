import { URL } from 'node:url';

export interface TrendyolClientOptions {
  baseUrl?: string;
  supplierId: string;
  apiKey: string;
  apiSecret: string;
  autoApproveMaxBudget: number;
  autoApproveMaxQuantity: number;
}

export interface TrendyolRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}

export interface TrendyolResponse<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
  rawBody: string;
}

const DEFAULT_BASE_URL = 'https://api.trendyol.com/sapigw';
const DEFAULT_AUTO_APPROVE_MAX_BUDGET = 500;
const DEFAULT_AUTO_APPROVE_MAX_QUANTITY = 10;

export class TrendyolApiError extends Error {
  constructor(
    readonly method: TrendyolRequest['method'],
    readonly url: string,
    readonly status: number,
    readonly response: unknown,
    readonly rawBody: string,
  ) {
    super(
      `Trendyol API responded with status ${status} for ${method} ${url}. Raw response: ${truncate(rawBody, 400)}`,
    );
  }
}

export class TrendyolClient {
  static fromEnv(): TrendyolClient {
    const supplierId = getRequiredEnv('TRENDYOL_SUPPLIER_ID');
    const apiKey = getRequiredEnv('TRENDYOL_API_KEY');
    const apiSecret = getRequiredEnv('TRENDYOL_API_SECRET');
    const baseUrl = process.env.TRENDYOL_BASE_URL ?? DEFAULT_BASE_URL;
    const autoApproveMaxBudget = getNumberEnv(
      'TRENDYOL_AUTO_APPROVE_MAX_BUDGET',
      DEFAULT_AUTO_APPROVE_MAX_BUDGET,
    );
    const autoApproveMaxQuantity = getNumberEnv(
      'TRENDYOL_AUTO_APPROVE_MAX_QUANTITY',
      DEFAULT_AUTO_APPROVE_MAX_QUANTITY,
    );

    return new TrendyolClient({
      baseUrl,
      supplierId,
      apiKey,
      apiSecret,
      autoApproveMaxBudget,
      autoApproveMaxQuantity,
    });
  }

  readonly baseUrl: string;
  readonly supplierId: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly autoApproveMaxBudget: number;
  readonly autoApproveMaxQuantity: number;

  constructor(options: TrendyolClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.supplierId = options.supplierId;
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.autoApproveMaxBudget = options.autoApproveMaxBudget;
    this.autoApproveMaxQuantity = options.autoApproveMaxQuantity;
  }

  async get<T>(
    path: string,
    query?: TrendyolRequest['query'],
  ): Promise<TrendyolResponse<T>> {
    return this.request<T>({ method: 'GET', path, query });
  }

  async mutate<T>(
    method: Exclude<TrendyolRequest['method'], 'GET'>,
    path: string,
    body?: unknown,
    query?: TrendyolRequest['query'],
  ): Promise<TrendyolResponse<T>> {
    return this.request<T>({ method, path, body, query });
  }

  async request<T>(request: TrendyolRequest): Promise<TrendyolResponse<T>> {
    const url = this.buildUrl(request.path, request.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: this.buildAuthorizationHeader(),
    };

    const init: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.body !== undefined && request.body !== null) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(request.body);
    }

    const response = await fetch(url, init);
    const rawBody = await response.text();
    const data = parseJsonSafe(rawBody) as T;
    const headersRecord: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersRecord[key] = value;
    });

    if (!response.ok) {
      throw new TrendyolApiError(
        request.method,
        url,
        response.status,
        data,
        rawBody,
      );
    }

    return {
      status: response.status,
      data,
      headers: headersRecord,
      rawBody,
    };
  }

  private buildAuthorizationHeader(): string {
    const token = Buffer.from(
      `${this.apiKey}:${this.apiSecret}`,
      'utf-8',
    ).toString('base64');
    return `Basic ${token}`;
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    const normalizedPath = normalizePath(path);
    const url = new URL(normalizedPath, ensureTrailingSlash(this.baseUrl));

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

function ensureTrailingSlash(input: string): string {
  if (input.endsWith('/')) {
    return input;
  }
  return `${input}/`;
}

function parseJsonSafe(payload: string): unknown {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch (_error) {
    console.warn(
      'Failed to parse Trendyol response as JSON. Returning raw body.',
    );
    return payload;
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number.`);
  }
  return parsed;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}
