/**
 * CANONICAL PRODUCT CONFIGURATION & NEUTRAL URL RESOLVER
 * @packages/config/products.ts
 * 
 * Provides safe, unified public routing across the 3 products:
 * - ATLAS (Central Platform Hub & CRM)
 * - INDUSTRIAL (Commercial B2B Vertical)
 * - YOUAPP (Independent Streaming & Multimedia Product)
 * 
 * Invariants:
 * - No hardcoded hostnames, ports, or future public domains.
 * - Dynamic resolution based on environment config or local development fallbacks.
 * - Clean path normalization and SSO query string binding.
 */

export type ProductId = 'ATLAS' | 'INDUSTRIAL' | 'YOUAPP';

function getEnvValue(key: string, viteKey: string, fallback: string): string {
  // Vite client-side
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
    return import.meta.env[viteKey];
  }
  // Node / SSR
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]!;
  }
  return fallback;
}

export const PRODUCT_CONFIG: Record<ProductId, { name: string; defaultPort: number; envKey: string; viteKey: string }> = {
  ATLAS: {
    name: 'Atlas Platform',
    defaultPort: 5175,
    envKey: 'ATLAS_PUBLIC_URL',
    viteKey: 'VITE_ATLAS_PUBLIC_URL'
  },
  INDUSTRIAL: {
    name: 'Busca Industrial',
    defaultPort: 5176,
    envKey: 'INDUSTRIAL_PUBLIC_URL',
    viteKey: 'VITE_INDUSTRIAL_PUBLIC_URL'
  },
  YOUAPP: {
    name: 'YouApp TV',
    defaultPort: 5173,
    envKey: 'YOUAPP_PUBLIC_URL',
    viteKey: 'VITE_YOUAPP_PUBLIC_URL'
  }
};

/**
 * Returns the base public URL for a given product
 */
export function getProductBaseUrl(product: ProductId): string {
  const meta = PRODUCT_CONFIG[product];
  const devDefault = `http://localhost:${meta.defaultPort}`;
  const url = getEnvValue(meta.envKey, meta.viteKey, devDefault);
  // Ensure no trailing slash on base URL
  return url.replace(/\/+$/, '');
}

export interface ProductUrlOptions {
  sso?: boolean;
  params?: Record<string, string>;
}

/**
 * Resolves canonical URL for cross-product navigation
 */
export function getProductUrl(product: ProductId, path: string = '/', options?: ProductUrlOptions): string {
  const baseUrl = getProductBaseUrl(product);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const targetUrl = new URL(normalizedPath, baseUrl);

  if (options?.sso) {
    targetUrl.searchParams.set('sso', 'atlas');
  }

  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      targetUrl.searchParams.set(key, value);
    }
  }

  return targetUrl.toString();
}

export const getAtlasUrl = (path: string = '/', options?: ProductUrlOptions) => getProductUrl('ATLAS', path, options);
export const getIndustrialUrl = (path: string = '/', options?: ProductUrlOptions) => getProductUrl('INDUSTRIAL', path, options);
export const getYouAppUrl = (path: string = '/', options?: ProductUrlOptions) => getProductUrl('YOUAPP', path, options);

/**
 * Detects the current product based on runtime origin / port
 */
export function getCurrentProduct(): ProductId {
  if (typeof window === 'undefined') return 'ATLAS';
  const port = window.location.port;
  if (port === '5176') return 'INDUSTRIAL';
  if (port === '5173') return 'YOUAPP';
  return 'ATLAS';
}
