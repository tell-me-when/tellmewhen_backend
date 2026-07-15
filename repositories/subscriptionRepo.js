import { query } from '../db/pool.js';

export const getSubscription = (jobId, businessId) =>
  query(
    `SELECT
       SUBSCRIPTION_TABLE.Subscription_ID,
       SUBSCRIPTION_TABLE.Endpoint,
       SUBSCRIPTION_TABLE.Auth_Key1,
       SUBSCRIPTION_TABLE.Auth_Key2
     FROM SUBSCRIPTION_TABLE
     JOIN JOB_TABLE ON SUBSCRIPTION_TABLE.Job_ID = JOB_TABLE.Job_ID
     WHERE JOB_TABLE.Job_ID = ? AND JOB_TABLE.Business_ID = ?;`,
    [jobId, businessId]
  );

export const removeSubscription = (jobId) =>
  query('DELETE FROM SUBSCRIPTION_TABLE WHERE Job_ID = ?;', [jobId]);

export const addSubscription = async (jobId, businessId, endpoint, authKey1, authKey2) => {
  await removeSubscription(jobId);
  return query(
    'INSERT INTO SUBSCRIPTION_TABLE (Job_ID, Business_ID, Endpoint, Auth_Key1, Auth_Key2) VALUES (?, ?, ?, ?, ?);',
    [jobId, businessId, endpoint, authKey1, authKey2]
  );
};
