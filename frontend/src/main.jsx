import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ClerkProvider } from '@clerk/clerk-react'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const app = <App authConfigured={Boolean(clerkPublishableKey)} />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {clerkPublishableKey ? <ClerkProvider publishableKey={clerkPublishableKey}>{app}</ClerkProvider> : app}
  </StrictMode>,
)
