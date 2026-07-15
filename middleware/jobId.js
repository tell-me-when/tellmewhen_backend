import { decryptJobId } from '../qr_generation.js';

// Job IDs only ever leave the server encrypted (QR codes, customer links).
// Every route that receives one back from a client must decrypt it before
// using it — this failed silently in several routes previously, which used
// the encrypted string directly as a DB lookup key.
export const decodeJobIdParam = (paramName) => (req, res, next) => {
  try {
    req.jobId = decryptJobId(req.params[paramName]);
    next();
  } catch (err) {
    return res.status(400).json({ message: 'Invalid job reference' });
  }
};

export const decodeJobIdBody = (fieldName) => (req, res, next) => {
  try {
    req.jobId = decryptJobId(req.body[fieldName]);
    next();
  } catch (err) {
    return res.status(400).json({ message: 'Invalid job reference' });
  }
};
