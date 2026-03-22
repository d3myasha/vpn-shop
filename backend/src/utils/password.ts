import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export const hashPassword = async (rawPassword: string): Promise<string> => bcrypt.hash(rawPassword, ROUNDS);

export const comparePassword = async (rawPassword: string, passwordHash: string): Promise<boolean> => {
  return bcrypt.compare(rawPassword, passwordHash);
};
