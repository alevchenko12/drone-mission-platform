import type {
  MissionCreate,
  MissionDetail,
  MissionSummary,
} from "../types/mission";

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
    // Keep the fallback message if the response is not valid JSON.
  }

  throw new Error(message);
}

export async function saveMission(
  payload: MissionCreate,
): Promise<MissionDetail> {
  const response = await fetch(`${API_BASE_URL}/missions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  await checkResponse(response, "Could not save the mission.");

  return response.json();
}

export async function listMissions(
  limit = 20,
  offset = 0,
): Promise<MissionSummary[]> {
  const parameters = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const response = await fetch(
    `${API_BASE_URL}/missions?${parameters}`,
  );

  await checkResponse(response, "Could not load saved missions.");

  return response.json();
}

export async function getMission(
  missionId: string,
): Promise<MissionDetail> {
  const response = await fetch(
    `${API_BASE_URL}/missions/${encodeURIComponent(missionId)}`,
  );

  await checkResponse(response, "Could not load the mission.");

  return response.json();
}

export async function deleteMission(
  missionId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/missions/${encodeURIComponent(missionId)}`,
    {
      method: "DELETE",
    },
  );

  await checkResponse(response, "Could not delete the mission.");
}