import { randomBytes } from 'node:crypto';
import { query, withTransaction } from '../db/pool.js';

const generateUniqueJobId = async () => {
  let jobId;
  let exists = true;

  while (exists) {
    jobId = randomBytes(16).toString('hex');
    const [jobRows, historyRows] = await Promise.all([
      query('SELECT COUNT(*) AS count FROM JOB_TABLE WHERE Job_ID = ?;', [jobId]),
      query('SELECT COUNT(*) AS count FROM JOB_HISTORY WHERE Job_ID = ?;', [jobId]),
    ]);
    exists = jobRows[0].count > 0 || historyRows[0].count > 0;
  }

  return jobId;
};

export const createNewJob = async (businessId, userId, description, dueDate) => {
  const jobId = await generateUniqueJobId();
  await query(
    'INSERT INTO JOB_TABLE (Job_ID, Business_ID, User_ID, Description, Due_Date) VALUES (?, ?, ?, ?, ?);',
    [jobId, businessId, userId, description, dueDate]
  );
  return { randomJobId: jobId };
};

export const getOpenJobs = (businessId, userId = null) => {
  let sql = 'SELECT Job_ID, Description, Due_Date FROM JOB_TABLE WHERE Business_ID = ?';
  const params = [businessId];
  if (userId) {
    sql += ' AND User_ID = ?';
    params.push(userId);
  }
  return query(sql, params);
};

export const getJobHistory = (businessId, userId = null) => {
  let sql = 'SELECT Job_ID, Description, Completion_Date, Remarks FROM JOB_HISTORY WHERE Business_ID = ?';
  const params = [businessId];
  if (userId) {
    sql += ' AND User_ID = ?';
    params.push(userId);
  }
  return query(sql, params);
};

export const getCustomerJobDetails = async (jobId) => {
  const rows = await query(
    `SELECT JOB_TABLE.Description, BUSINESS_TABLE.Business_Name, BUSINESS_TABLE.Business_ID
     FROM JOB_TABLE JOIN BUSINESS_TABLE ON JOB_TABLE.Business_ID = BUSINESS_TABLE.Business_ID
     WHERE JOB_TABLE.Job_ID = ?;`,
    [jobId]
  );
  return rows[0] || null;
};

export const getJobDetails = async (jobId) => {
  const rows = await query(
    'SELECT Job_ID, Description, Due_Date, User_ID, Business_ID FROM JOB_TABLE WHERE Job_ID = ?;',
    [jobId]
  );
  return rows[0] || null;
};

// Scoped to businessId so a job can only be reassigned by someone in the
// business it actually belongs to. Returns the query result so callers can
// check affectedRows to detect a cross-tenant or nonexistent job ID.
export const assignJobToUser = (userId, jobId, businessId) =>
  query('UPDATE JOB_TABLE SET User_ID = ? WHERE Job_ID = ? AND Business_ID = ?;', [userId, jobId, businessId]);

// Moves a job from JOB_TABLE into JOB_HISTORY and drops its subscription,
// all inside one transaction so a mid-way failure can't strand a job in
// both — or neither — table. businessId must match the job's own — this is
// the tenant-isolation boundary, not just a convenience filter.
export const completeJob = (userId, jobId, businessId, remarks = '') =>
  withTransaction(async (conn) => {
    const [jobRows] = await conn.query(
      'SELECT Business_ID, Description FROM JOB_TABLE WHERE Job_ID = ?;',
      [jobId]
    );
    if (jobRows.length === 0) {
      throw new Error(`Job with ID ${jobId} not found in JOB_TABLE.`);
    }
    const { Business_ID, Description } = jobRows[0];
    if (Business_ID !== businessId) {
      throw new Error('Job does not belong to this business.');
    }

    await conn.query(
      `INSERT INTO JOB_HISTORY (User_ID, Job_ID, Business_ID, Completion_Date, Description, Remarks)
       VALUES (?, ?, ?, NOW(), ?, ?);`,
      [userId, jobId, Business_ID, Description, remarks]
    );
    await conn.query('DELETE FROM SUBSCRIPTION_TABLE WHERE Job_ID = ?;', [jobId]);
    await conn.query('DELETE FROM JOB_TABLE WHERE Job_ID = ?;', [jobId]);
  });

export const deletefromjobtable = (jobId) =>
  query('DELETE FROM JOB_TABLE WHERE Job_ID = ?;', [jobId]);

export const deletefromjobhistorytable = (jobId) =>
  query('DELETE FROM JOB_HISTORY WHERE Job_ID = ?;', [jobId]);

export const countOpenJobs = async (businessId) => {
  const rows = await query('SELECT COUNT(*) AS openJobs FROM JOB_TABLE WHERE Business_ID = ?;', [businessId]);
  return rows[0] ? rows[0].openJobs : 0;
};

export const countTotalJobs = async (businessId) => {
  const [openRows, closedRows] = await Promise.all([
    query('SELECT COUNT(*) AS totalOpenJobs FROM JOB_TABLE WHERE Business_ID = ?;', [businessId]),
    query('SELECT COUNT(*) AS totalClosedJobs FROM JOB_HISTORY WHERE Business_ID = ?;', [businessId]),
  ]);
  return (openRows[0]?.totalOpenJobs || 0) + (closedRows[0]?.totalClosedJobs || 0);
};

// Jobs currently assigned to a worker — used to build that worker's chat
// channel list on login.
export const getJobsForWorker = (userId, businessId) =>
  query('SELECT Job_ID FROM JOB_TABLE WHERE User_ID = ? AND Business_ID = ?;', [userId, businessId]);

export const isJobInHistory = async (jobId) => {
  const rows = await query('SELECT Job_ID FROM JOB_HISTORY WHERE Job_ID = ?;', [jobId]);
  return rows.length > 0;
};

// Which business a completed job belonged to — used to verify ownership
// before letting someone tear down that job's chat channel.
export const getJobHistoryBusinessId = async (jobId) => {
  const rows = await query('SELECT Business_ID FROM JOB_HISTORY WHERE Job_ID = ?;', [jobId]);
  return rows[0] ? rows[0].Business_ID : null;
};

// Open or completed — used to reject guest chat sessions for IDs that
// don't correspond to a real job at all.
export const jobExists = async (jobId) => {
  const [openRows, historyRows] = await Promise.all([
    query('SELECT Job_ID FROM JOB_TABLE WHERE Job_ID = ?;', [jobId]),
    query('SELECT Job_ID FROM JOB_HISTORY WHERE Job_ID = ?;', [jobId]),
  ]);
  return openRows.length > 0 || historyRows.length > 0;
};
