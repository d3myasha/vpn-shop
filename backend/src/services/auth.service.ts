import { prisma } from '../config/prisma.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

export class AuthService {
  async register(email: string, password: string) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new Error('User already exists');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash }
    });

    return this.issueTokens({ userId: user.id, role: user.role, email: user.email });
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
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
}

export const authService = new AuthService();
