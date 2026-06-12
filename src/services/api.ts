// ============================================================
// API Service Layer - HTTP client for backend communication
// ============================================================

const API_BASE = import.meta.env.VITE_API_URL || '';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface RequestOptions {
  body?: unknown;
  params?: Record<string, string>;
  signal?: AbortSignal;
}

class ApiService {
  private tokenProvider: (() => Promise<string | null>) | null = null;

  setTokenProvider(provider: () => Promise<string | null>) {
    this.tokenProvider = provider;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.tokenProvider) {
      const token = await this.tokenProvider();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, API_BASE);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
  }

  async request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T> {
    const headers = await this.getHeaders();
    const url = this.buildUrl(path, options?.params);

    const response = await fetch(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(
        errorBody.message || errorBody.error || `HTTP ${response.status}`,
        response.status,
        errorBody
      );
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) return undefined as T;

    return response.json();
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, { ...options, body });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PUT', path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>('DELETE', path, options);
  }
}

export class ApiError extends Error {
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Singleton API service instance
export const api = new ApiService();
