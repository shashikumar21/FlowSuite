/** Counts derived only from real tenant-scoped task rows. No rates or forecasts. */
export type TaskSummary = {
  total: number
  open: number
  inProgress: number
  completed: number
  unassigned: number
}

/** A read-only option for the owner dropdown. */
export type TaskAssigneeOption = {
  user_id: string
  full_name: string | null
  role: string
}
