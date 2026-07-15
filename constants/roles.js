// Lower number = higher privilege. A moderator can do everything a worker
// can; an admin can do everything a moderator can — mirrors the existing
// requireRole(maxLevel) check (role <= maxLevel passes).
export const ROLES = {
  ADMIN: 1,
  MODERATOR: 2,
  WORKER: 3,
};
