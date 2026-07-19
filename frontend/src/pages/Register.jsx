import { useState }           from 'react';
import { Link, useNavigate }  from 'react-router-dom';
import { Zap }                from 'lucide-react';
import { useAuth }            from '../context/AuthContext';
import toast                  from 'react-hot-toast';

export default function Register() {
  const [form, setForm]     = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { register }        = useAuth();
  const navigate            = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      toast.success('Account created! Sign in to continue.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <div className="w-full max-w-md animate-slide-up">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white">Watchly</span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Create account</h1>
        <p className="text-sm text-gray-500 mb-8">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Sign in
          </Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { key: 'name',     label: 'Full Name',         type: 'text',     ph: 'Aryan Shah'        },
            { key: 'email',    label: 'Email',             type: 'email',    ph: 'you@example.com'   },
            { key: 'password', label: 'Password (min 6)',  type: 'password', ph: '••••••••'          },
          ].map(({ key, label, type, ph }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
              <input type={type} className="input-base" placeholder={ph}
                value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} required />
            </div>
          ))}

          <button type="submit" disabled={loading}
            className="btn-primary w-full py-3 rounded-xl text-sm font-semibold mt-2">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating…
              </span>
            ) : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}