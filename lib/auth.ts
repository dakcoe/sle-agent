import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface JWTPayload {
  userId: number;
  username: string;
  role: 'admin' | 'user';
  adminId: number | null;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function getAuthUser(req: NextRequest): JWTPayload | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7));
}

export function getTokenFromQuery(req: NextRequest): JWTPayload | null {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return null;
  return verifyToken(token);
}

// Returns adminId: for admin users it's their own id, for users it's their linked admin
export function resolveAdminId(user: JWTPayload): number {
  return user.role === 'admin' ? user.userId : (user.adminId ?? user.userId);
}
