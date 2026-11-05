import { HttpError } from "../middleware/errorHandler";
import type { DateRange } from "./occurrences";

// Talks to the auth service. This service never reads auth's tables directly.

export interface Org {
  id: string;
  name: string;
  timezone: string;
}

export interface Member {
  membershipId: string;
  userId: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  birthday: string | null;
  showBirthday: boolean;
  groupIds: string[];
  unavailability: DateRange[];
}

async function callAuth<T>(path: string): Promise<T> {
  const url = process.env.AUTH_SERVICE_URL;
  if (!url) {
    throw new Error("AUTH_SERVICE_URL is not set");
  }

  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      headers: { "x-internal-key": process.env.INTERNAL_KEY ?? "" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new HttpError(503, "The auth service is unavailable, please try again");
  }

  if (!response.ok) {
    throw new HttpError(502, `The auth service answered ${path} with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getOrgs(): Promise<Org[]> {
  return callAuth<Org[]>("/internal/orgs");
}

export async function getOrg(orgId: string): Promise<Org> {
  const org = (await getOrgs()).find(({ id }) => id === orgId);
  if (!org) {
    throw new HttpError(404, "Organisation not found");
  }
  return org;
}

export function getMembers(orgId: string): Promise<Member[]> {
  return callAuth<Member[]>(`/internal/orgs/${orgId}/members`);
}

export async function getUserName(userId: string): Promise<string> {
  const user = await callAuth<{ name: string }>(`/internal/users/${userId}`);
  return user.name;
}
