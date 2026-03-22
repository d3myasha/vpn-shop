import { prisma } from '../config/prisma.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

export class AuthService {
  async register(email: string, password: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      throw new Error('User already exists');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash }
    });

    return this.issueTokens({ userId: user.id, role: user.role, email: user.email });
  }

  async login(email: string, password: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    return this.issueTokens({ userId: user.id, role: user.role, email: user.email });
  }

  refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    return this.issueTokens(payload);
  }

  private issueTokens(payload: { userId: string; role: 'user' | 'admin'; email: string }) {
    return {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      user: payload
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}

export const authService = new AuthService();
