import type { CurrentUser, LoginRequest } from "../types/auth";

const API_BASE_URL = "http://localhost:8000";

async function checkResponse(
  response: Response,
  fallbackMessage: string,
): Promise<void> {
  if (response.ok) {
    return;
  }

  let message = fallbackMessage;

  try {
    const data: unknown = await response.json();

    if (
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof data.detail === "string"
    ) {
      message = data.detail;
    }
  } catch {
    // Keep the fallback message.
  }

  throw new Error(message);
}

export async function login(
  payload: LoginRequest,
): Promise<CurrentUser> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  await checkResponse(response, "Could not log in.");

  return response.json();
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  await checkResponse(response, "Could not check your session.");

  return response.json();
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  await checkResponse(response, "Could not log out.");
}