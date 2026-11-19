import crypto from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {ConflictError, UnauthorizedError, ValidationError} from '../core/errors.ts';
import {hashPassword, signJwt, verifyPassword, type UserRole} from '../core/security.ts';
import type {AuditService} from './auditService.ts';

export interface RegisterUserInput {
  email: string;
  fullName: string;
  password: string;
  role?: UserRole;
}

export class AuthService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly jwtSecret: string,
    private readonly tokenExpireMinutes: number,
    private readonly auditService: AuditService,
  ) {}

  registerUser(input: RegisterUserInput) {
    const email = input.email.trim().toLowerCase();
    if (!email.includes('@')) {
      throw new ValidationError('Valid email address is required');
    }
    if (input.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    const role: UserRole = input.role ?? 'ML_Engineer';
    if (!['Admin', 'ML_Engineer', 'Viewer'].includes(role)) {
      throw new ValidationError(`Invalid role "${role}"`);
    }

    const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new ConflictError(`User '${email}' is already registered`);
    }

    const id = `usr_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const passwordHash = hashPassword(input.password);

    this.db
      .prepare(
        `INSERT INTO users (id, email, full_name, password_hash, role, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(id, email, input.fullName.trim() || email, passwordHash, role, now);

    this.auditService.record({
      actor: email,
      action: 'USER_REGISTERED',
      resourceType: 'user',
      resourceId: id,
      details: {email, role},
    });

    return {id, email, fullName: input.fullName.trim() || email, role, isActive: true, createdAt: now};
  }

  login(emailRaw: string, password: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = this.db
      .prepare('SELECT id, email, full_name, password_hash, role, is_active FROM users WHERE email = ?')
      .get(email) as
      | {id: string; email: string; full_name: string; password_hash: string; role: UserRole; is_active: number}
      | undefined;

    if (!user || user.is_active !== 1 || !verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken = signJwt(
      {sub: user.id, email: user.email, role: user.role},
      this.jwtSecret,
      this.tokenExpireMinutes,
    );

    return {
      accessToken,
      tokenType: 'bearer',
      expiresInMinutes: this.tokenExpireMinutes,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    };
  }

  listUsers() {
    const rows = this.db
      .prepare('SELECT id, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;

    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      isActive: u.is_active === 1,
      createdAt: u.created_at,
    }));
  }
}
