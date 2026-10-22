import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// index.html supplies this single mount node; Vite imports the CSS and resolves TSX.
// StrictMode repeats effect setup/cleanup in development to expose missing cleanup.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
