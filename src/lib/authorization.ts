import { AppError } from "./errors.js";

export type AuthenticatedRequester = { agentId: number; role: "agent" | "admin" };

export function assertOwnership(resource: { agentId: number }, requester: AuthenticatedRequester) {
  if (requester.role === "admin") return;
  if (resource.agentId !== requester.agentId) {
    throw new AppError(403, "FORBIDDEN", "この操作を行う権限がありません");
  }
}
