import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider, ConfirmProvider } from './components/ui'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
)
