// NEXT_PUBLIC values are included in the browser bundle.
// This is a public address, never a place for passwords or secrets.
const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!configuredUrl) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
}

export const API_BASE_URL = configuredUrl.replace(/\/+$/, "");