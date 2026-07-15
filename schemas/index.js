import { z } from 'zod';
import {
  SUBDOMAIN_REGEX,
  SUBDOMAIN_MIN_LENGTH,
  SUBDOMAIN_MAX_LENGTH,
  isReservedSubdomain,
} from '../constants/subdomain.js';

export const loginSchema = z.object({
  name: z.string().trim().min(1).max(255),
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(255),
});

// Shared by registerSchema (final submit) and checkSubdomainQuerySchema
// (live availability check) — one rule, checked in two places.
const subdomainField = z.string()
  .trim()
  .toLowerCase()
  .min(SUBDOMAIN_MIN_LENGTH)
  .max(SUBDOMAIN_MAX_LENGTH)
  .regex(SUBDOMAIN_REGEX, 'Subdomain must be lowercase letters, numbers, and hyphens only, and cannot start/end with a hyphen')
  .refine((s) => !isReservedSubdomain(s), 'That subdomain is reserved');

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  username: z.string().trim().min(1).max(255),
  password: z.string().min(8).max(255),
  subdomain: subdomainField,
  // Optional business-info fields, visible to customers. The frontend
  // sends '' for untouched fields rather than omitting them.
  address: z.string().trim().max(500).optional().or(z.literal('')),
  locationLink: z.string().trim().url().max(500).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  openingHours: z.string().trim().max(500).optional().or(z.literal('')),
  // Must be explicit boolean true — rejects false, missing, or "true" (string).
  tosAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service' }),
  }),
});

export const checkSubdomainQuerySchema = z.object({
  subdomain: subdomainField,
});

export const saveSubscriptionSchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    auth: z.string().trim().min(1),
    p256dh: z.string().trim().min(1),
  }),
  jobId: z.string().trim().min(1).max(512),
  businessId: z.coerce.number().int().positive(),
});
