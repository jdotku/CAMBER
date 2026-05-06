// ============================================================
// index.js — The Bootstrap File
//
// This is the very first JavaScript file the browser runs.
// Its only job is to connect React to the HTML page.
// You generally won't need to change this file.
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';

// Our global CSS (dark background, base font) applied to the whole page
import './index.css';

// The root component — everything lives inside <App />
import App from './App';

// Find the <div id="root"> in index.html and take it over.
// React will render everything inside that div from this point on.
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render our App component into the page.
// StrictMode is a development helper that warns you about bad practices.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
