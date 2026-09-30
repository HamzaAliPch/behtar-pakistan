export const categories = [
  "Roads & potholes",
  "Water & drainage",
  "Waste & sanitation",
  "Streetlights",
  "Parks & public spaces",
  "Other",
] as const;

export const statusColors: Record<string, string> = {
  Submitted: "status-submitted",
  "In review": "status-review",
  "In progress": "status-progress",
  Resolved: "status-resolved",
};
