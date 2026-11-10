// vendored until the SDK is published; replace with @light-launcher/plugin-sdk
/** tiny shared cache-entry shape (kept apart to avoid import cycles) */
export interface CacheEntry {
  etag: string | null;
  lastModified: string | null;
  fetchedAt: string;
}
