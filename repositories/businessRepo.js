import { query, withTransaction } from '../db/pool.js';

export const getBusinessId = async (businessName) => {
  const rows = await query('SELECT Business_ID FROM BUSINESS_TABLE WHERE Business_Name = ?;', [businessName]);
  return rows[0] ? rows[0].Business_ID : null;
};

export const getBusinessDetails = async (businessId) => {
  const rows = await query('SELECT Business_Name, Business_Photo FROM BUSINESS_TABLE WHERE Business_ID = ?;', [businessId]);
  if (!rows[0]) return null;
  return { name: rows[0].Business_Name, photo: rows[0].Business_Photo };
};

export const getBusinessPhoto = async (businessId) => {
  const rows = await query('SELECT Business_Photo FROM BUSINESS_TABLE WHERE Business_ID = ?;', [businessId]);
  return rows[0] ? rows[0].Business_Photo : null;
};

// Thrown when a registration collides with an existing business name or
// subdomain. `field` lets the route (and the frontend, via the response
// body) know exactly which one so it can flag the right wizard step/input.
export class RegistrationConflictError extends Error {
  constructor(field) { // 'name' | 'subdomain'
    super(`${field === 'name' ? 'Business name' : 'Subdomain'} already taken`);
    this.field = field;
  }
}

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

// details: { businessName, username, hashedPassword, subdomain, address,
//            locationLink, phone, email, openingHours, tosAcceptedAt }
//
// Returns { businessId } on success. Throws RegistrationConflictError on a
// name/subdomain collision (pre-check SELECTs cover the common case; the
// UNIQUE constraints on Business_Name/Subdomain are the real guarantee
// against the TOCTOU race between the check and the insert — errno 1062
// here means two requests raced and one just lost). Any other error
// propagates unchanged to the caller.
export const registerBusinessAndAdmin = async (details) => {
  const defaultPhoto = 'base64photo_url';
  const {
    businessName, username, hashedPassword, subdomain,
    address, locationLink, phone, email, openingHours, tosAcceptedAt,
  } = details;

  return withTransaction(async (conn) => {
    const [existingName] = await conn.query('SELECT Business_ID FROM BUSINESS_TABLE WHERE Business_Name = ?;', [businessName]);
    if (existingName.length > 0) {
      throw new RegistrationConflictError('name');
    }
    const [existingSubdomain] = await conn.query('SELECT Business_ID FROM BUSINESS_TABLE WHERE Subdomain = ?;', [subdomain]);
    if (existingSubdomain.length > 0) {
      throw new RegistrationConflictError('subdomain');
    }

    let businessResult;
    try {
      [businessResult] = await conn.query(
        `INSERT INTO BUSINESS_TABLE
           (Business_Name, Business_Photo, Subdomain, Address, Location_Link, Phone, Email, Opening_Hours, ToS_Accepted, ToS_Accepted_At)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?);`,
        [
          businessName, defaultPhoto, subdomain,
          emptyToNull(address), emptyToNull(locationLink), emptyToNull(phone),
          emptyToNull(email), emptyToNull(openingHours), tosAcceptedAt,
        ]
      );
    } catch (err) {
      if (err.errno === 1062) {
        const hitSubdomainKey = typeof err.sqlMessage === 'string' && err.sqlMessage.includes('UQ_Business_Subdomain');
        throw new RegistrationConflictError(hitSubdomainKey ? 'subdomain' : 'name');
      }
      throw err;
    }

    const businessId = businessResult.insertId;
    await conn.query(
      'INSERT INTO WORKER_TABLE (Username, Hashed_Password, Business_ID, Role) VALUES (?, ?, ?, ?);',
      [username, hashedPassword, businessId, 1] // Role 1 = admin
    );
    return { businessId };
  });
};

// Cheap, side-effect-free — backs the live availability-check endpoint.
export const isSubdomainTaken = async (subdomain) => {
  const rows = await query('SELECT 1 FROM BUSINESS_TABLE WHERE Subdomain = ? LIMIT 1;', [subdomain]);
  return rows.length > 0;
};

export const renameBusiness = async (businessId, newName) => {
  const existing = await query('SELECT Business_ID FROM BUSINESS_TABLE WHERE Business_Name = ?;', [newName]);
  if (existing.length > 0 && existing[0].Business_ID !== businessId) {
    return null;
  }
  return query('UPDATE BUSINESS_TABLE SET Business_Name = ? WHERE Business_ID = ?;', [newName, businessId]);
};

export const changeBusinessPhoto = (businessId, newPhotoBase64) =>
  query('UPDATE BUSINESS_TABLE SET Business_Photo = ? WHERE Business_ID = ?;', [newPhotoBase64, businessId]);

// Cascades a business deletion across every dependent table in one
// transaction. Callers rely on this throwing on failure so the request
// can respond with an error instead of a false 204.
export const deleteBusiness = (businessId) =>
  withTransaction(async (conn) => {
    await conn.query(
      'DELETE FROM SUBSCRIPTION_TABLE WHERE Job_ID IN (SELECT Job_ID FROM JOB_TABLE WHERE Business_ID = ?);',
      [businessId]
    );
    await conn.query('DELETE FROM JOB_HISTORY WHERE Business_ID = ?;', [businessId]);
    await conn.query('DELETE FROM JOB_TABLE WHERE Business_ID = ?;', [businessId]);
    await conn.query(
      'DELETE FROM NOTIFICATIONS WHERE User_ID IN (SELECT User_ID FROM WORKER_TABLE WHERE Business_ID = ?);',
      [businessId]
    );
    await conn.query(
      'DELETE FROM TOKENS WHERE User_ID IN (SELECT User_ID FROM WORKER_TABLE WHERE Business_ID = ?);',
      [businessId]
    );
    await conn.query('DELETE FROM WORKER_TABLE WHERE Business_ID = ?;', [businessId]);
    await conn.query('DELETE FROM BUSINESS_TABLE WHERE Business_ID = ?;', [businessId]);
  });
