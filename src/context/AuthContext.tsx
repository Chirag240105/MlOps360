import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {api, getStoredToken, setStoredToken} from '../lib/api';
import type {AuthUser, UserRole} from '../types/api';

const USER_STORAGE_KEY = 'modelops360_user';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  canMutate: boolean;
  isAdmin: boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: {
    email: string;
    fullName: string;
    password: string;
    role: UserRole;
  }) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({children}: {children: ReactNode}) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [loading, setLoading] = useState<boolean>(Boolean(getStoredToken()));
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const persistSession = useCallback((nextToken: string | null, nextUser: AuthUser | null) => {
    setToken(nextToken);
    setUser(nextUser);
    setStoredToken(nextToken);
    try {
      if (nextUser) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
      } else {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures
    }
  }, []);

  useEffect(() => {
    const existingToken = getStoredToken();
    if (!existingToken) {
      setLoading(false);
      return;
    }
    api.auth
      .me()
      .then(({principal}) => {
        setUser((prev) =>
          prev
            ? {...prev, email: principal.email, role: principal.role}
            : {id: principal.sub, email: principal.email, fullName: principal.email, role: principal.role},
        );
      })
      .catch(() => {
        persistSession(null, null);
      })
      .finally(() => setLoading(false));
  }, [persistSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.auth.login(email, password);
      persistSession(res.accessToken, res.user);
      setAuthModalOpen(false);
      return res.user;
    },
    [persistSession],
  );

  const register = useCallback(
    async (payload: {email: string; fullName: string; password: string; role: UserRole}) => {
      const created = await api.auth.register(payload);
      const loginRes = await api.auth.login(payload.email, payload.password);
      persistSession(loginRes.accessToken, loginRes.user);
      setAuthModalOpen(false);
      return created;
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    persistSession(null, null);
  }, [persistSession]);

  // Note: when unauthenticated in local dev (ENFORCE_AUTH=false), mutations succeed as local-operator;
  // when signed in as Viewer, RBAC strictly prevents mutations.
  const canMutate = !user || user.role === 'Admin' || user.role === 'ML_Engineer';
  const isAdmin = user?.role === 'Admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        canMutate,
        isAdmin,
        authModalOpen,
        setAuthModalOpen,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
