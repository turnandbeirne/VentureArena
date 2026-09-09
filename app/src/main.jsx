import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import RecapViewer from './vendor/game-ui/components/RecapViewer.jsx';
import './styles.css';
// VentureFlow's board (vendor/game-ui) is styled around these two fonts —
// Fredoka for everything, Dancing Script for Brand.jsx's cursive credit
// line. Imported once here, globally, rather than per-component, same as
// VentureFlow's own main.jsx does it.
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/dancing-script/600.css';

// A shared game recap (game-ui/game/recapShare.js) is a public, read-only
// page — no session, no room lookup — so it's mounted here directly rather
// than as a state inside App.jsx (which always requires a signed-in
// session first). Same static-pathname-check pattern VentureFlow's own
// main.jsx uses for its `/kids` and `/recap` routes; see app/vercel.json
// and app/public/_redirects for why a direct load of this path needs a
// rewrite rule on static hosts (Railway's `serve -s` already handles this
// without extra config — see README's "Deploying the app").
const isRecapRoute = window.location.pathname.replace(/\/+$/, '') === '/recap';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{isRecapRoute ? <RecapViewer /> : <App />}</React.StrictMode>
);
