'use client';

import { useState, useRef } from 'react';
import styles from './page.module.css';

type PredictionResult = {
  label: string;
  score: number;
};


export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<PredictionResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = () => {
    // Mock login for MVP
    setIsLoggedIn(true);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, etc).');
      return;
    }
    setError(null);
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    setResults(null);
  };

  const analyzeImage = async () => {
    if (!file) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/api/detect', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Analysis failed. Backend might be down or processing failed.');
      }

      const data = await response.json();
      if (data.success && data.predictions) {
        setResults(data.predictions);
      } else {
        throw new Error('Invalid response from server.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResults(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className="title-gradient">Is it AI or Real?</h1>
        <p>Upload an image to detect if it was generated or edited by artificial intelligence.</p>
      </div>

      {!isLoggedIn ? (
        <div className={`glass-panel ${styles.loginPrompt}`}>
          <h2>Authentication Required</h2>
          <p>Please log in to use the detection tool to prevent abuse.</p>
          <button className="btn-primary" onClick={handleLogin}>
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className={`glass-panel ${styles.uploadContainer}`}>
          {!file ? (
            <div 
              className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.dropzoneIcon}>📸</div>
              <h3>Drag & drop an image here</h3>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>or click to browse from your device</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={onFileChange} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
            </div>
          ) : (
            <>
              <div className={styles.previewContainer}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview as string} alt="Preview" className={styles.previewImage} />
                {isAnalyzing && <div className="scan-line"></div>}
              </div>

              {error && <p style={{ color: 'var(--error)', textAlign: 'center' }}>{error}</p>}

              {!results && !isAnalyzing && (
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn-primary" onClick={analyzeImage} style={{ flex: 1 }}>
                    Analyze Image
                  </button>
                  <button className="btn-primary" onClick={reset} style={{ background: 'var(--glass-border)' }}>
                    Cancel
                  </button>
                </div>
              )}

              {isAnalyzing && (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <p className="title-gradient animate-pulse" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                    Scanning deep patterns...
                  </p>
                </div>
              )}

              {results && (
                <div className={styles.results}>
                  <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Detection Results</h3>
                  {results.map((res) => {
                    const isAI = res.label.toLowerCase().includes('ai') || res.label.toLowerCase().includes('fake');
                    const className = isAI ? styles.ai : styles.real;
                    const displayLabel = isAI ? 'AI Generated / Edited' : 'Real / Authentic';
                    
                    return (
                      <div key={res.label} className={`${styles.resultItem} ${className}`}>
                        <div className={styles.resultHeader}>
                          <span>{displayLabel} ({res.label})</span>
                          <span>{(res.score * 100).toFixed(2)}%</span>
                        </div>
                        <div className={styles.barContainer}>
                          <div 
                            className={styles.barFill} 
                            style={{ width: `${res.score * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <button className="btn-primary" onClick={reset}>
                      Analyze Another Image
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
