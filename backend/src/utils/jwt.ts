import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

type AccessPayload = {
  userId: string;
  role: 'user' | 'admin';
  email: string;
};

export const signAccessToken = (payload: AccessPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
};

export const signRefreshToken = (payload: AccessPayload): string => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });
};

export const verifyAccessToken = (token: string): AccessPayload => {
  return jwt.verify(token, env.JWT_SECRET) as AccessPayload;
};

export const verifyRefreshToken = (token: string): AccessPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AccessPayload;
};
