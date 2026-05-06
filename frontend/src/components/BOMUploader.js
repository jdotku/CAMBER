import React, { useState } from 'react';
import './BOMUploader.css';

function BOMUploader({ onUpload, isProcessing }) {
  const [fileContent, setFileContent] = useState('');
  const [fileName,    setFileName]    = useState('');

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload  = e => setFileContent(e.target.result);
    reader.onerror = () => alert('Error reading file. Please try again.');
    reader.readAsText(file);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!fileContent) {
      alert('Please select a CSV file first.');
      return;
    }
    onUpload(fileContent);
  }

  return (
    <div className="bom-uploader-container">
      <div className="uploader-card">

        <h1 className="uploader-title">CAMBER</h1>
        <p className="uploader-subtitle">Supply Chain Risk Intelligence</p>

        <form onSubmit={handleSubmit}>

          <label className="file-label" htmlFor="csv-input">
            {fileName ? (
              <span className="file-label-selected">{fileName}</span>
            ) : (
              <>
                <span className="file-label-icon">↑</span>
                <span className="file-label-text">Choose CSV file</span>
                <span className="file-label-hint">part_id · part_name · manufacturer · quantity · unit_cost</span>
              </>
            )}
          </label>

          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="file-input-hidden"
            id="csv-input"
          />

          <button
            type="submit"
            className="analyze-button"
            disabled={isProcessing || !fileContent}
          >
            {isProcessing ? 'Analyzing...' : 'Analyze BOM'}
          </button>

        </form>

        <p className="sample-hint">
          Sample file: <code>backend/data/sample-bom.csv</code>
        </p>

      </div>
    </div>
  );
}

export default BOMUploader;
