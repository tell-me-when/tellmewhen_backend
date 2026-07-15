import { query } from '../db/pool.js';

export const addToken = (userId, token) =>
  query('INSERT INTO TOKENS (User_ID, Token, Valid) VALUES (?, ?, 1);', [userId, token]);

export const blockToken = (token) =>
  query('UPDATE TOKENS SET Valid = 0 WHERE Token = ?;', [token]);

export const freezeUser = (userId) =>
  query('UPDATE TOKENS SET Valid = 0 WHERE User_ID = ?;', [userId]);

export const getTokenStatus = async (token) => {
  const rows = await query('SELECT Valid FROM TOKENS WHERE Token = ?;', [token]);
  return rows[0] ? rows[0].Valid : 0;
};
