import { z } from 'zod';
import { ROLES } from '../constants/roles.js';

export const changePasswordSchema = z.object({
  username: z.string().trim().min(1).max(255),
  newPassword: z.string().min(8).max(255),
  userId: z.coerce.number().int().positive(),
});

export const changeNameSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export const changePhotoSchema = z.object({
  newPhoto: z.string().trim().min(1),
});

export const searchEmployeesQuerySchema = z.object({
  userId: z.string().trim().min(1).max(255).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const addUserSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().min(8).max(255),
  privLevel: z.coerce.number().int().refine((v) => Object.values(ROLES).includes(v), {
    message: 'privLevel must be a valid role',
  }),
});
