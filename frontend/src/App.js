import React, { useState } from 'react';
import './App.css';
import BOMUploader     from './components/BOMUploader';
import DeepModeToggle  from './components/DeepModeToggle';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function App() {
  const [bomData,      setBomData]      = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error,        setError]        = useState(null);

  async function handleBOMUpload(csvContent) {
    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/parse-bom`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ csvData: csvContent }),
      });

      const result = await response.json();

      if (result.success) {
        setBomData(result.data);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setError(result.error || 'Backend returned an error. Check your CSV format.');
      }
    } catch (err) {
      setError('Could not reach the backend. Make sure it is running: cd backend && npm start');
      console.error('Fetch error:', err);
    }

    setIsProcessing(false);
  }

  function handleReset() {
    setBomData([]);
    setIsProcessing(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="app">
      {bomData.length === 0 ? (
        <>
          {error && (
            <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 999, maxWidth: 600, width: '90%' }}>
              <div className="error-banner">
                <strong>ERROR:</strong> {error}
                <button className="error-dismiss" onClick={() => setError(null)}>✕</button>
              </div>
            </div>
          )}
          <BOMUploader onUpload={handleBOMUpload} isProcessing={isProcessing} />
        </>
      ) : (
        <DeepModeToggle bomData={bomData} onReset={handleReset} />
      )}
    </div>
  );
}

export default App;
