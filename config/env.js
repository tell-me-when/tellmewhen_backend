/*
Validates required environment variables on boot. Import this before anything
else reads process.env — a missing or malformed value should crash startup,
not surface as a confusing runtime error three requests later.
*/
import dotenv from 'dotenv';

dotenv.config();

const required = {
  PORT: {},
  NODE_ENV: { oneOf: ['development', 'production', 'test'] },
  DB_HOST: {},
  DB_USER: {},
  DB_PASSWORD: {},
  DB_DATABASE: {},
  ENCRYPTION_KEY: { base64ByteLength: 32 },
  VAPID_PUBLIC: {},
  VAPID_PRIVATE: {},
  STREAM_API_KEY: {},
  STREAM_API_SECRET: {},
};

const optional = {
  QR_BASE: {},
  CORS_ORIGINS: {},
};

function validateBase64Length(name, value, expectedBytes) {
  let decoded;
  try {
    decoded = Buffer.from(value, 'base64');
  } catch {
    throw new Error(`${name} is not valid base64`);
  }
  if (decoded.length !== expectedBytes) {
    throw new Error(`${name} must decode to ${expectedBytes} bytes, got ${decoded.length}`);
  }
}

function validateEnv() {
  const errors = [];
  const resolved = {};

  for (const [name, rule] of Object.entries(required)) {
    const value = process.env[name];
    if (value === undefined || value === '') {
      errors.push(`${name} is required but not set`);
      continue;
    }
    if (rule.oneOf && !rule.oneOf.includes(value)) {
      errors.push(`${name} must be one of: ${rule.oneOf.join(', ')} (got "${value}")`);
    }
    if (rule.base64ByteLength) {
      try {
        validateBase64Length(name, value, rule.base64ByteLength);
      } catch (err) {
        errors.push(err.message);
      }
    }
    resolved[name] = value;
  }

  for (const name of Object.keys(optional)) {
    resolved[name] = process.env[name];
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}\n` +
      `See .env.example for the full list of required variables.`
    );
  }

  return resolved;
}

export const env = validateEnv();
