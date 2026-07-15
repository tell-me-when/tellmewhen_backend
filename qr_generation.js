import QRCode from 'qrcode';
import crypto from 'crypto';
import { Buffer } from 'buffer';

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'base64'); // Decode Base64 key
const QR_BASE = process.env.QR_BASE || "https://tellmewhen.co.uk/customer_view/";

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;   // bytes — recommended nonce size for GCM
const TAG_LENGTH = 16;  // bytes — GCM authentication tag

// Validate environment variables
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('Invalid or missing ENCRYPTION_KEY in .env file. Ensure it is a 32-byte (Base64-encoded) key. To generate, run: openssl rand -base64 32');
}

/**
 * Encrypt Job ID using AES-256-GCM with a fresh random IV per call.
 * Output is ivHex + authTagHex + ciphertextHex, all concatenated — GCM's
 * tag also means a tampered or truncated value fails to decrypt instead of
 * silently producing garbage.
 * @param {string} jobId - The job ID to encrypt.
 * @returns {string} - URL-safe encrypted job ID.
 */
export function encryptJobId(jobId) {
    if (typeof jobId !== 'string' || jobId.trim() === '') {
        throw new Error('Invalid jobId: must be a non-empty string');
    }
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGO, ENCRYPTION_KEY, iv);
        const ciphertext = Buffer.concat([cipher.update(jobId, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return Buffer.concat([iv, authTag, ciphertext]).toString('hex');
    } catch (err) {
        console.error('Error encrypting job ID:', err);
        throw err;
    }
}

/**
 * Generate a URL for the encrypted job ID.
 * @param {string} id - The encrypted job ID.
 * @returns {string} - The full URL.
 */
export function generate_url(id) {
    return QR_BASE + id;
}

/**
 * takes job_id, enrypts it and returns qr-code as base-64 string
 * @returns {Promise<string>}
 * @param job_id
 */
export async function generate_qr(job_id) {
    if (typeof job_id !== 'string' || job_id.trim() === '') {
        throw new Error('Invalid job_id: must be a non-empty string');
    }
    try {
        const encryptedJobId = encryptJobId(job_id);
        const url = generate_url(encryptedJobId);
        return QRCode.toDataURL(url, {
            color: {
                dark: '#000',
                light: '#fff'
            }
        });
    } catch (err) {
        console.error('Error generating QR code:', err);
        throw err;
    }
}

/**
 * Decrypt Job ID using AES-256-GCM.
 * @param {string} encryptedJobId - The encrypted job ID (iv + authTag + ciphertext, hex).
 * @returns {string} - The decrypted job ID.
 */
export function decryptJobId(encryptedJobId) {
    if (typeof encryptedJobId !== 'string' || encryptedJobId.trim() === '') {
        throw new Error('Invalid encryptedJobId: must be a non-empty string');
    }
    try {
        const raw = Buffer.from(encryptedJobId, 'hex');
        const iv = raw.subarray(0, IV_LENGTH);
        const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGO, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (err) {
        console.error('Error decrypting job ID:', err);
        throw err;
    }
}
