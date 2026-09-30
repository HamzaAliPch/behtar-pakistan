export const complaintStatuses = ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLUTION_PROPOSED", "RESOLVED", "REOPENED", "REJECTED", "BLOCKED"] as const;
export type ComplaintStatus = (typeof complaintStatuses)[number];
export const taskStatuses = ["TODO", "ASSIGNED", "IN_PROGRESS", "BLOCKED", "SUBMITTED_FOR_REVIEW", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export const referralStatuses = ["DRAFT", "SUBMITTED", "ACKNOWLEDGED", "FOLLOW_UP_REQUIRED", "ACTION_REPORTED", "CLOSED"] as const;
export type ReferralStatus = (typeof referralStatuses)[number];
export const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const taskTypes = ["FIELD_VISIT", "CLEANUP", "DOCUMENTATION", "FOLLOW_UP", "PARTNER_NGO", "OTHER"] as const;
export const evidenceStages = ["BEFORE", "PROGRESS", "AFTER"] as const;

const complaintTransitions: Record<ComplaintStatus, ComplaintStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED", "BLOCKED"],
  VERIFIED: ["ASSIGNED", "IN_PROGRESS", "BLOCKED", "RESOLUTION_PROPOSED"],
  ASSIGNED: ["IN_PROGRESS", "BLOCKED", "RESOLUTION_PROPOSED"],
  IN_PROGRESS: ["BLOCKED", "RESOLUTION_PROPOSED"],
  RESOLUTION_PROPOSED: ["RESOLVED", "REOPENED"],
  RESOLVED: ["REOPENED"],
  REOPENED: ["UNDER_REVIEW", "VERIFIED", "BLOCKED"],
  REJECTED: ["REOPENED"],
  BLOCKED: ["UNDER_REVIEW", "IN_PROGRESS", "REJECTED"],
};

const taskTransitions: Record<TaskStatus, TaskStatus[]> = {
  TODO: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "SUBMITTED_FOR_REVIEW", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  SUBMITTED_FOR_REVIEW: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const referralTransitions: Record<ReferralStatus, ReferralStatus[]> = {
  DRAFT: ["SUBMITTED", "CLOSED"],
  SUBMITTED: ["ACKNOWLEDGED", "FOLLOW_UP_REQUIRED", "ACTION_REPORTED", "CLOSED"],
  ACKNOWLEDGED: ["FOLLOW_UP_REQUIRED", "ACTION_REPORTED", "CLOSED"],
  FOLLOW_UP_REQUIRED: ["ACKNOWLEDGED", "ACTION_REPORTED", "CLOSED"],
  ACTION_REPORTED: ["FOLLOW_UP_REQUIRED", "CLOSED"],
  CLOSED: [],
};

export function isOneOf<const T extends readonly string[]>(value: string, values: T): value is T[number] {
  return values.some(item => item === value);
}
export function canTransitionComplaint(from: string, to: string): boolean {
  return isOneOf(from, complaintStatuses) && complaintTransitions[from].includes(to as ComplaintStatus);
}
export function nextComplaintStatuses(from: string): ComplaintStatus[] {
  return isOneOf(from, complaintStatuses) ? complaintTransitions[from] : [];
}
export function canTransitionTask(from: string, to: string): boolean {
  return isOneOf(from, taskStatuses) && taskTransitions[from].includes(to as TaskStatus);
}
export function nextTaskStatuses(from: string): TaskStatus[] {
  return isOneOf(from, taskStatuses) ? taskTransitions[from] : [];
}
export function canTransitionReferral(from: string, to: string): boolean {
  return isOneOf(from, referralStatuses) && referralTransitions[from].includes(to as ReferralStatus);
}
export function nextReferralStatuses(from: string): ReferralStatus[] {
  return isOneOf(from, referralStatuses) ? referralTransitions[from] : [];
}
export function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
