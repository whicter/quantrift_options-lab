import { useAuth } from '@clerk/clerk-react';
import App from './App.jsx';
import { setAuthTokenProvider } from './lib/api.js';

export default function AuthenticatedApp() {
  const { isLoaded, getToken } = useAuth();
  if (!isLoaded) return null;
  setAuthTokenProvider(getToken);
  return <App authConfigured />;
}
