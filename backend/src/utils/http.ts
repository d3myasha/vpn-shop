import type { Response } from 'express';

const cookieBaseConfig = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/'
};

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  res.cookie('access_token', accessToken, { ...cookieBaseConfig, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, { ...cookieBaseConfig, maxAge: 7 * 24 * 60 * 60 * 1000 });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie('access_token', cookieBaseConfig);
  res.clearCookie('refresh_token', cookieBaseConfig);
};
