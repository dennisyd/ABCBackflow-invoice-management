import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isAuthenticated, LOGIN_PASSWORD, LOGIN_USERNAME, signIn } from '../auth';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (isAuthenticated()) {
    const destination = location.state?.from?.pathname || '/';
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = (event) => {
    event.preventDefault();

    if (username === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
      signIn();
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
      return;
    }

    setError('Invalid username or password.');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl border border-slate-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">ABC Backflow</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to access the management portal.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700">Username</label>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg bg-white"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg bg-white"
              autoComplete="current-password"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
