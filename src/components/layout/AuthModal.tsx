import {useState, type FormEvent} from 'react';
import {Button, Input, Modal, Select} from '../ui';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {ApiRequestError} from '../../lib/api';
import type {UserRole} from '../../types/api';

export function AuthModal() {
  const {authModalOpen, setAuthModalOpen, login, register} = useAuth();
  const {pushToast} = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('ML_Engineer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const user = await login(email.trim(), password);
        pushToast({
          variant: 'success',
          title: `Signed in as ${user.fullName}`,
          description: `Role: ${user.role}`,
        });
      } else {
        const user = await register({
          email: email.trim(),
          fullName: fullName.trim(),
          password,
          role,
        });
        pushToast({
          variant: 'success',
          title: `Account created for ${user.fullName}`,
          description: `Signed in with ${user.role} permissions`,
        });
      }
      setPassword('');
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={authModalOpen}
      onClose={() => {
        setAuthModalOpen(false);
        setError(null);
      }}
      title={mode === 'login' ? 'Sign in to ModelOps360' : 'Create Operator Account'}
      description="Authenticate with your control plane credentials to bind actions and RBAC roles to your identity."
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex rounded-md border border-[#232A3C] bg-[#10131B] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
              mode === 'login' ? 'bg-[#1B2130] text-[#F3F4F8]' : 'text-[#9299AA] hover:text-[#F3F4F8]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
              mode === 'register' ? 'bg-[#1B2130] text-[#F3F4F8]' : 'text-[#9299AA] hover:text-[#F3F4F8]'
            }`}
          >
            Register
          </button>
        </div>

        {mode === 'register' && (
          <Input
            label="Full Name"
            placeholder="Alex Rivera"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        )}

        <Input
          label="Work Email"
          type="email"
          placeholder="mlops@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        {mode === 'register' && (
          <Select
            label="RBAC Role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            options={[
              {value: 'ML_Engineer', label: 'ML_Engineer — Train, register, promote & monitor'},
              {value: 'Admin', label: 'Admin — Full platform & user management'},
              {value: 'Viewer', label: 'Viewer — Read-only telemetry & dashboards'},
            ]}
          />
        )}

        {error && (
          <div className="rounded-md border border-[#F16C78]/40 bg-[#F16C78]/10 px-3 py-2 text-xs text-[#F16C78]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setAuthModalOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {mode === 'login' ? 'Sign In' : 'Create & Sign In'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
