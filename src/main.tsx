import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { PublicTrackingView } from './PublicTrackingView'

const publicTrackingMatch = window.location.pathname.match(/^\/track\/(.+)$/)
const publicTrackingId = publicTrackingMatch ? decodeURIComponent(publicTrackingMatch[1]) : ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publicTrackingId ? <PublicTrackingView tripId={publicTrackingId} /> : <App />}
  </StrictMode>,
)
