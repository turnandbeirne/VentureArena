// DEV-ONLY preview of the Arena screens with a fake Supabase (see
// vite.preview.config.js, which aliases lib/supabaseClient.js to
// dev-mock-supabase.js). Lets Home / Play / People / Me / Member / Tiers be
// screenshotted without a live backend. Not imported by main.jsx.
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/dancing-script/600.css';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
