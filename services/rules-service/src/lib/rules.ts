import type { Rule, RotationSlot } from "../../generated/prisma";
import { formatDate } from "./dates";

export type RuleWithRotation = Rule & { rotation: RotationSlot[] };

// Always load the rotation in order
export const withRotation = { rotation: { orderBy: { position: "asc" } } } as const;

// The form of a rule used in API responses and in occurrences.ts
export function toRuleDto({ rotation, startDate, ...rule }: RuleWithRotation) {
  return {
    ...rule,
    startDate: formatDate(startDate),
    rotation: rotation.map((slot) => slot.memberId),
  };
}
