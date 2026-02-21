import React, { useState } from 'react';
import { handleLogin } from '../shared/auth';
import './LoginScreen.css';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const result = await handleLogin(email, password);
      alert(`Welcome ${result.user.name}!`);
      // Navigate to admin dashboard
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="form-container">
        <h1 className="title">ThreatTrack Admin</h1>
        <p className="subtitle">Login to admin panel</p>

        <form onSubmit={onLogin}>
          <input
            type="email"
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
          />

          <input
            type="password"
            className="input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
          />

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <a href="#" className="forgot-password">
            Forgot Password?
          </a>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
