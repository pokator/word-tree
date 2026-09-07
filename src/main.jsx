import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from './theme/initTheme'
import { AuthProvider } from './auth/AuthContext'
import './index.css'
import App from './App.jsx'

initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
