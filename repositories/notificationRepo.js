import { query } from '../db/pool.js';

export const addNotification = (userId, jobId, notificationContent) =>
  query(
    'INSERT INTO NOTIFICATIONS (User_ID, Job_ID, Notification_Content) VALUES (?, ?, ?);',
    [userId, jobId, notificationContent]
  );

export const getNotifications = (jobId) =>
  query(
    `SELECT Notification_Content, Timestamp, Is_Read
     FROM NOTIFICATIONS
     WHERE Job_ID = ?
     ORDER BY Timestamp DESC;`,
    [jobId]
  );
