/**
 * SHARED API CLIENT PACKAGE
 * @packages/api-client
 * 
 * Standard HTTP client for communicating with Atlas / Platform backend services.
 * Automatically injects Supabase session tokens and enforces standardized error handling.
 */

import { getAuthHeaders } from '../auth/index.ts';

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiError extends Error {
  public status: number;
  public data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers: customHeaders, ...customOptions } = options;

  let url = endpoint;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const authHeaders = await getAuthHeaders();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...((customHeaders as Record<string, string>) || {})
  };

  const response = await fetch(url, {
    ...customOptions,
    headers
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }
    const message = (errorData && typeof errorData === 'object' && errorData.error)
      ? errorData.error
      : `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(message, response.status, errorData);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export const apiClient = {
  get: <T = any>(url: string, options?: RequestOptions) => 
    request<T>(url, { ...options, method: 'GET' }),

  post: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined
    }),

  put: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined
    }),

  patch: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined
    }),

  del: <T = any>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'DELETE' })
};

export default apiClient;
