/**
 * Shared API configuration for VERA frontend.
 * Resolves the base URL for the FastAPI backend service.
 */
export function getApiBaseUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_API_URL is required in production but was not set."
      );
    }
    return "http://localhost:8000";
  }

  return apiUrl;
}
