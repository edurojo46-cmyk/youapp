import { createClient, SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';

const ALLOWED_TEST_URLS = [
  'http://localhost:54321', // Default local Supabase
  'http://127.0.0.1:54321'
];

/**
 * Validates that the provided Supabase URL is explicitly allowed for tests and scripts
 * that write synthetic data. This prevents accidental pollution of production environments.
 */
export function validateTestDatabaseUrl(url: string | undefined): void {
  if (!url) {
    throw new Error('FATAL: Supabase URL is undefined. Failing closed to prevent accidental production writes.');
  }

  const cleanUrl = url.replace(/\/$/, ''); // Remove trailing slash if present

  if (!ALLOWED_TEST_URLS.includes(cleanUrl)) {
    throw new Error(
      `FATAL: Data Hygiene Guard Triggered!\n` +
      `Attempted to connect a test/synthetic script to a non-allowed database URL: ${url}\n` +
      `Writing synthetic data to production or unknown environments is STRICTLY PROHIBITED.\n` +
      `Please ensure VITE_SUPABASE_URL is set to a local test instance (e.g., http://localhost:54321) when running tests.`
    );
  }
}

/**
 * A drop-in replacement for createClient that enforces the test database guard.
 * Use this in all tests, benchmarks, and data-seeding scripts.
 */
export function createGuardedTestClient<
  Database = any,
  SchemaName extends string & keyof Database = 'public' extends keyof Database
    ? 'public'
    : string & keyof Database,
  Schema extends Record<string, unknown> = Database[SchemaName] extends Record<
    string,
    unknown
  >
    ? Database[SchemaName]
    : any
>(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabaseClientOptions<SchemaName>
): SupabaseClient<Database, SchemaName, Schema> {
  validateTestDatabaseUrl(supabaseUrl);
  return createClient<Database, SchemaName, Schema>(supabaseUrl, supabaseKey, options);
}
