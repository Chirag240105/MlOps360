import {Router} from 'express';
import {ValidationError} from '../../core/errors.ts';
import {requireAuth, requireRole} from '../../middleware/auth.ts';
import type {AuthService} from '../../services/authService.ts';

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post('/auth/register', (req, res, next) => {
    try {
      const {email, fullName, password, role} = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        throw new ValidationError('Fields "email" and "password" are required');
      }
      const user = authService.registerUser({
        email,
        fullName: typeof fullName === 'string' ? fullName : email,
        password,
        role,
      });
      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/login', (req, res, next) => {
    try {
      const {email, password} = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        throw new ValidationError('Fields "email" and "password" are required');
      }
      res.json(authService.login(email, password));
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/me', requireAuth(true), (req, res) => {
    res.json({principal: req.principal});
  });

  router.get('/users', requireAuth(true), requireRole(['Admin'], true), (_req, res, next) => {
    try {
      res.json({users: authService.listUsers()});
    } catch (err) {
      next(err);
    }
  });

  return router;
}
