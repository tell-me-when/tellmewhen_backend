import { query, withTransaction } from '../db/pool.js';

export const login = async (businessName, username) => {
  const businessRows = await query('SELECT Business_ID FROM BUSINESS_TABLE WHERE Business_Name = ?;', [businessName]);
  if (businessRows.length === 0) return null;

  const rows = await query(
    'SELECT * FROM WORKER_TABLE WHERE Username = ? AND Business_ID = ?;',
    [username, businessRows[0].Business_ID]
  );
  return rows[0] || null;
};

export const addUser = (username, hashedPassword, businessId, role) =>
  query(
    'INSERT INTO WORKER_TABLE (Username, Hashed_Password, Business_ID, Role) VALUES (?, ?, ?, ?);',
    [username, hashedPassword, businessId, role]
  );

// Reassigns the departing worker's open jobs to an admin in the same
// business, then deletes them — as one transaction. Throws (rather than
// swallowing the error) so callers' existing error handling actually runs.
// callerBusinessId scopes this to admins acting within their own business —
// without it, any admin could delete a worker from any other business by ID.
export const deleteUser = (workerId, currentUserId, callerBusinessId) =>
  withTransaction(async (conn) => {
    if (String(workerId) === String(currentUserId)) {
      throw new Error('Cannot delete your own account.');
    }

    const [workerRows] = await conn.query('SELECT Business_ID FROM WORKER_TABLE WHERE User_ID = ?;', [workerId]);
    if (workerRows.length === 0) {
      throw new Error('Worker not found.');
    }
    const businessId = workerRows[0].Business_ID;
    if (businessId !== callerBusinessId) {
      throw new Error('Worker does not belong to this business.');
    }

    const [adminRows] = await conn.query('SELECT User_ID FROM WORKER_TABLE WHERE Business_ID = ? AND Role = 1;', [businessId]);
    if (adminRows.length === 0) {
      throw new Error('No admin found in the same business to reassign jobs.');
    }
    const adminId = adminRows[0].User_ID;

    await conn.query('UPDATE JOB_TABLE SET User_ID = ? WHERE User_ID = ?;', [adminId, workerId]);
    await conn.query('DELETE FROM WORKER_TABLE WHERE User_ID = ? AND User_ID <> ?;', [workerId, currentUserId]);
  });

export const workernames = (businessId) =>
  query('SELECT Username FROM WORKER_TABLE WHERE Business_ID = ?;', [businessId]);

// businessId scopes the update so a target outside the caller's own
// business can't have their password changed even if their User_ID/username
// were guessed correctly.
export const editUserLogin = (workerId, username, newPasswordHash, businessId) =>
  query(
    'UPDATE WORKER_TABLE SET Hashed_Password = ? WHERE User_ID = ? AND Username = ? AND Business_ID = ?;',
    [newPasswordHash, workerId, username, businessId]
  );

export const searchEmployees = (searchTerm, businessId, limit = null) => {
  let sql = 'SELECT User_ID, Username, Role FROM WORKER_TABLE WHERE Business_ID = ?';
  const params = [businessId];

  if (searchTerm) {
    sql += ' AND (Username LIKE ? OR User_ID = ?)';
    params.push(`%${searchTerm}%`, searchTerm);
  }
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return query(sql + ';', params);
};

export const changeRole = (workerId, newRole) =>
  query('UPDATE WORKER_TABLE SET Role = ? WHERE User_ID = ?;', [newRole, workerId]);

export const findWorkerInBusiness = (userId, businessId) =>
  query('SELECT * FROM WORKER_TABLE WHERE User_ID = ? AND Business_ID = ?;', [userId, businessId]);
