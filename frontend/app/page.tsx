'use client';

import { useState, useRef } from 'react';
import styles from './page.module.css';

type PredictionResult = {
  label: string;
  score: number;
};

type C2paMetadata = {
  present: boolean;
  valid: boolean;
  claimGenerator?: string;
  issuer?: string;
  time?: string;
  isAi?: boolean;
  isCamera?: boolean;
};

const AVAILABLE_MODELS = [
  { id: 'SigLIP2', name: 'SigLIP2', desc: 'General Deepfake Classifier', warning: false, premium: false },
  { id: 'FLUX', name: 'FLUX Detector', desc: 'Flow-matching anomalies (FLUX-specific)', warning: false, premium: false },
  { id: 'ViT-v2', name: 'ViT-v2', desc: 'Vision Transformer v2 anomalies', warning: false, premium: false },
  { id: 'CloudAPI', name: 'AI Image Detector API', desc: 'Premium cloud-based model verification', warning: false, premium: true },
];

const BASE_WEIGHTS: Record<string, number> = {
  SigLIP2: 0.60,
  FLUX: 0.20,
  'ViT-v2': 0.20,
};

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<PredictionResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaderText, setLoaderText] = useState('Initializing...');
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [selectedModels, setSelectedModels] = useState<string[]>([
    'SigLIP2', 'FLUX', 'ViT-v2'
  ]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [c2paMetadata, setC2paMetadata] = useState<C2paMetadata | null>(null);
  
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
    setC2paMetadata(null);
  };

  const analyzeImage = async () => {
    if (!file) return;
    if (selectedModels.length === 0) {
      setError('Please select at least one model for the pipeline.');
      return;
    }
    
    setIsAnalyzing(true);
    setError(null);
    setLoaderText('Initializing...');
    setProgressPercentage(5);
    setC2paMetadata(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Send local models and cloud API parameter separately
    const localModels = selectedModels.filter(m => m !== 'CloudAPI');
    formData.append('models', localModels.join(','));
    formData.append('use_cloud_api', selectedModels.includes('CloudAPI').toString());

    try {
      const response = await fetch('http://localhost:8000/api/detect', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Analysis failed. Backend might be down or processing failed.');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming not supported by this browser.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.status === 'progress') {
              setLoaderText(data.stage);
              setProgressPercentage(data.progress);
            } else if (data.status === 'complete') {
              setResults(data.predictions);
              if (data.overallScore !== undefined) {
                setOverallScore(data.overallScore);
              }
              if (data.c2pa !== undefined) {
                setC2paMetadata(data.c2pa);
              }
            } else if (data.status === 'error') {
              throw new Error(data.message);
            }
          } catch (e: any) {
            console.error('Error parsing stream line:', e);
          }
        }
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
    setOverallScore(null);
    setC2paMetadata(null);
    setError(null);
    setProgressPercentage(0);
    setLoaderText('Initializing...');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const activeModels = AVAILABLE_MODELS
    .filter(m => selectedModels.includes(m.id) && m.id !== 'CloudAPI')
    .sort((a, b) => (BASE_WEIGHTS[b.id] || 0) - (BASE_WEIGHTS[a.id] || 0));

  const totalActiveWeight = activeModels.reduce((sum, m) => sum + (BASE_WEIGHTS[m.id] || 0), 0);

  const modelWeights = activeModels.map(m => {
    const rawWeight = BASE_WEIGHTS[m.id] || 0;
    const relativeWeight = totalActiveWeight > 0 ? (rawWeight / totalActiveWeight) : 0;
    return {
      id: m.id,
      name: m.name,
      weightPercent: Math.round(relativeWeight * 100) + '%'
    };
  });

  const vitResult = results?.find(res => res.label.includes("ViT-v2"));
  const siglipResult = results?.find(res => res.label.includes("General"));
  const vitScore = vitResult ? vitResult.score : 0;
  const siglipScore = siglipResult ? siglipResult.score : 0;
  const isC2paBypassed = c2paMetadata?.present && c2paMetadata?.valid && (c2paMetadata?.isAi || c2paMetadata?.isCamera);
  const isCloudBypassed = results?.some(res => res.label.startsWith("Cloud API:"));

  const renderActiveModelsText = () => {
    if (modelWeights.length === 0) {
      return 'without any active pipeline models';
    }
    if (modelWeights.length === 1) {
      return (
        <>
          based on the active pipeline model: <strong>{modelWeights[0].id} (100%)</strong>
        </>
      );
    }
    return (
      <>
        as a calibrated weighted average of active pipeline models:{' '}
        {modelWeights.map((mw, index) => {
          const isLast = index === modelWeights.length - 1;
          const isSecondToLast = index === modelWeights.length - 2;
          return (
            <span key={mw.id}>
              <strong>{mw.id} ({mw.weightPercent})</strong>
              {isLast ? '' : modelWeights.length === 2 ? ' and ' : isSecondToLast ? ', and ' : ', '}
            </span>
          );
        })}
      </>
    );
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
        <div className={file ? styles.dashboardGrid : `glass-panel ${styles.uploadContainer}`}>
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
              {/* Left Column: Image Preview & Config */}
              <div className={`glass-panel ${styles.leftPanel}`}>
                <div className={styles.previewContainer}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview as string} alt="Preview" className={styles.previewImage} />
                  {isAnalyzing && <div className="scan-line"></div>}
                </div>

                {error && <p style={{ color: 'var(--error)', textAlign: 'center', marginTop: '1rem' }}>{error}</p>}

                <div className={styles.checkboxContainer} style={{ marginTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Select Pipeline Models:
                  </h4>
                  <div className={styles.checkboxGrid}>
                    {AVAILABLE_MODELS.map((model) => (
                      <label key={model.id} className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          disabled={isAnalyzing || results !== null}
                          checked={selectedModels.includes(model.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedModels([...selectedModels, model.id]);
                            } else {
                              setSelectedModels(selectedModels.filter((id) => id !== model.id));
                            }
                          }}
                        />
                        <div className={styles.checkboxText}>
                          <span className={styles.checkboxName}>
                            {model.name}
                            {model.warning && (
                              <span className={styles.warningTag}>Slow on CPU</span>
                            )}
                            {model.premium && (
                              <span className={styles.premiumTag}>Premium</span>
                            )}
                          </span>
                          <span className={styles.checkboxDesc}>{model.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  {!results && !isAnalyzing && (
                    <button className="btn-primary" onClick={analyzeImage} style={{ flex: 1 }}>
                      Analyze Image
                    </button>
                  )}
                  <button className="btn-primary" onClick={reset} style={{ flex: results || isAnalyzing ? 1 : 'none', background: 'var(--glass-border)' }}>
                    {results || isAnalyzing ? 'Reset & Upload New' : 'Cancel'}
                  </button>
                </div>
              </div>

              {/* Right Column: Execution Progress & Reports */}
              <div className={`glass-panel ${styles.rightPanel}`}>
                <h3 className={styles.reportTitle}>Analysis Report</h3>

                {/* Default/Idle state */}
                {!results && !isAnalyzing && (
                  <div className={styles.reportEmptyState}>
                    <span className={styles.reportEmptyIcon}>📊</span>
                    <h4>Ready for Detection</h4>
                    <p>Choose your models on the left, then click <strong>Analyze Image</strong> to generate the anomaly report.</p>
                  </div>
                )}

                {/* Loading state */}
                {isAnalyzing && (
                  <div className={styles.reportLoadingState}>
                    <p className="title-gradient animate-pulse" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                      {loaderText}
                    </p>
                    <div className={styles.barContainer} style={{ width: '100%', maxWidth: '300px', margin: '0 auto', height: '8px', background: 'var(--glass-border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        className={styles.barFill} 
                        style={{ 
                          width: `${progressPercentage}%`, 
                          background: 'linear-gradient(90deg, var(--accent-blue), #ec4899)', 
                          transition: 'width 0.3s ease-in-out' 
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.5rem' }}>{progressPercentage}% Complete</span>
                  </div>
                )}

                {/* Results/Report state */}
                {results && overallScore !== null && (
                  <div className={styles.reportResultsState}>
                    
                    {/* Anomaly Gauge Section */}
                    <div className={styles.anomalyScoreSection}>
                      <div className={styles.anomalyScoreGauge}>
                        <div className={styles.anomalyScoreValue}>
                          {(overallScore * 100).toFixed(1)}%
                        </div>
                        <div className={styles.anomalyScoreLabel}>
                          Anomaly Probability
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
                        <div className={styles.verdictBadge} style={{
                          background: overallScore > 0.5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: overallScore > 0.5 ? 'var(--error)' : 'var(--success)',
                          borderColor: overallScore > 0.5 ? 'var(--error)' : 'var(--success)',
                          border: '1px solid',
                          padding: '0.5rem 1rem',
                          borderRadius: '20px',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          display: 'inline-block'
                        }}>
                          {overallScore > 0.5 ? 'Likely AI Generated / Modified' : 'Likely Authentic / Real'}
                        </div>
                        {vitScore > 0.65 && overallScore <= 0.5 && (
                          <div className={styles.editedBadge} style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b',
                            borderColor: '#f59e0b',
                            border: '1px solid',
                            padding: '0.5rem 1rem',
                            borderRadius: '20px',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            display: 'inline-block'
                          }}>
                            Digitally Edited
                          </div>
                        )}
                      </div>
                    </div>

                    {/* C2PA Credentials Certificate Card */}
                    {c2paMetadata && c2paMetadata.present && (
                      <div className={styles.c2paCertCard}>
                        <div className={styles.c2paCertHeader}>
                          <span className={styles.c2paCertTitle}>
                            🛡️ Content Credentials
                          </span>
                          <span className={`${styles.c2paCertBadge} ${
                            !c2paMetadata.valid ? styles.c2paBadgeInvalid :
                            c2paMetadata.isAi ? styles.c2paBadgeAi :
                            c2paMetadata.isCamera ? styles.c2paBadgeCamera :
                            styles.c2paBadgeNeutral
                          }`}>
                            {!c2paMetadata.valid ? 'Invalid Signature' :
                             c2paMetadata.isAi ? 'Verified AI (C2PA)' :
                             c2paMetadata.isCamera ? 'Verified Camera (C2PA)' :
                             'Content Credentials (C2PA)'}
                          </span>
                        </div>

                        <div className={styles.c2paCertDetails}>
                          <div className={styles.c2paDetailRow}>
                            <span className={styles.c2paDetailLabel}>Signature Trust</span>
                            <span className={`${styles.c2paDetailValue} ${c2paMetadata.valid ? styles.validSig : styles.invalidSig}`}>
                              {c2paMetadata.valid ? 'Valid & Verified' : 'Invalid / Modified'}
                            </span>
                          </div>
                          
                          {c2paMetadata.claimGenerator && (
                            <div className={styles.c2paDetailRow}>
                              <span className={styles.c2paDetailLabel}>Capture / Edit Tool</span>
                              <span className={styles.c2paDetailValue}>
                                {c2paMetadata.claimGenerator.replace(/_/g, ' ')}
                              </span>
                            </div>
                          )}

                          {c2paMetadata.issuer && (
                            <div className={styles.c2paDetailRow}>
                              <span className={styles.c2paDetailLabel}>Signing Authority</span>
                              <span className={styles.c2paDetailValue}>
                                {c2paMetadata.issuer}
                              </span>
                            </div>
                          )}

                          {c2paMetadata.time && (
                            <div className={styles.c2paDetailRow}>
                              <span className={styles.c2paDetailLabel}>Timestamp</span>
                              <span className={styles.c2paDetailValue}>
                                {new Date(c2paMetadata.time).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short'
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-models Bar list / Bypassed Message */}
                    {isC2paBypassed ? (
                      <div className={styles.bypassedModelsMessage}>
                        🛡️ Deep learning analysis bypassed. Image origin is cryptographically certified by active Content Credentials (C2PA).
                      </div>
                    ) : isCloudBypassed ? (
                      <div className={styles.bypassedModelsMessage} style={{ borderColor: 'var(--success)', background: 'rgba(16, 185, 129, 0.08)' }}>
                        ✨ Local neural network analysis bypassed. High-confidence AI generation signatures detected by premium Cloud API.
                      </div>
                    ) : (
                      <div className={styles.subModelsSection}>
                        <h4 className={styles.sectionTitle}>Model Breakdown</h4>
                        {results.map((res) => {
                          const isAI = res.label.toLowerCase().includes('ai') || res.label.toLowerCase().includes('fake') || res.label.toLowerCase().includes('deepfake');
                          if (!isAI) return null;
                          
                          let displayName = res.label;
                          if (res.label.includes("General: Fake")) displayName = "SigLIP2 (General)";
                          else if (res.label.includes("FLUX: AI")) displayName = "FLUX Detector";
                          else if (res.label.includes("ViT-v2: Deepfake")) displayName = "ViT-v2 Anomaly";

                          return (
                            <div key={res.label} className={styles.modelBarItem}>
                              <div className={styles.modelBarHeader}>
                                <span>{displayName}</span>
                                <span>{(res.score * 100).toFixed(1)}%</span>
                              </div>
                              <div className={styles.barContainer}>
                                <div 
                                  className={styles.barFill} 
                                  style={{ 
                                    width: `${res.score * 100}%`,
                                    background: res.score > 0.5 ? 'var(--error)' : 'var(--success)'
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Summary explanations */}
                    <div className={styles.textReportSection}>
                      <h4 className={styles.sectionTitle}>Engine Summary</h4>
                      <p className={styles.reportSummaryText}>
                        {isC2paBypassed ? (
                          c2paMetadata?.isAi ? (
                            <>
                              Our detection engine registers a <strong>100.0% anomaly score</strong> for this photo.
                              This score is cryptographically certified by active <strong>Content Credentials (C2PA)</strong> embedded in the image manifest, declaring that the image was generated using generative artificial intelligence tools.
                            </>
                          ) : (
                            <>
                              Our detection engine registers a <strong>0.0% anomaly score</strong> for this photo.
                              This score is cryptographically certified by active <strong>Content Credentials (C2PA)</strong> embedded in the image manifest, verifying that the image was captured directly by a compatible physical camera device and contains no history of generative AI modification.
                            </>
                          )
                        ) : isCloudBypassed ? (
                          <>
                            Our detection engine predicts a <strong>{(overallScore * 100).toFixed(1)}% anomaly score</strong> for this photo.
                            This score was verified using the premium <strong>AI Image Detector API (Cloud)</strong>, which identified specific high-frequency noise fields and model-specific generative patterns from cloud-hosted detection networks.
                          </>
                        ) : (
                          <>
                            Our detection engine predicts a <strong>{(overallScore * 100).toFixed(1)}% anomaly score</strong> for this photo. 
                            This score is calculated {renderActiveModelsText()}. 
                            {overallScore > 0.5 
                              ? " The image exhibits structural artifacts and high-frequency pixel anomalies characteristic of synthetic generation or inpainting."
                              : " The image shows natural lighting gradients and camera noise textures, indicating an authentic origin."
                            }
                          </>
                        )}
                      </p>
                      
                      <h4 className={styles.sectionTitle} style={{ marginTop: '1.5rem' }}>About the Pipeline</h4>
                      <div className={styles.modelExplainGrid}>

                        {selectedModels.includes('SigLIP2') && (
                          <div className={styles.modelExplainItem}>
                            <strong>SigLIP2 ({modelWeights.find(mw => mw.id === 'SigLIP2')?.weightPercent} weight)</strong>: Semantic transformer model trained for general deepfakes and illustration patterns.
                          </div>
                        )}
                        {selectedModels.includes('FLUX') && (
                          <div className={styles.modelExplainItem}>
                            <strong>FLUX ({modelWeights.find(mw => mw.id === 'FLUX')?.weightPercent} weight)</strong>: Specifically calibrated for flow-matching anomalies produced by FLUX generators.
                          </div>
                        )}
                        {selectedModels.includes('ViT-v2') && (
                          <div className={styles.modelExplainItem}>
                            <strong>ViT-v2 ({modelWeights.find(mw => mw.id === 'ViT-v2')?.weightPercent} weight)</strong>: Vision Transformer analyzing global anomalies; weighted lower due to real-photo calibration.
                          </div>
                        )}
                        {selectedModels.includes('CloudAPI') && (
                          <div className={styles.modelExplainItem} style={{ borderLeftColor: '#f59e0b' }}>
                            <strong>AI Image Detector API (Cloud Tier)</strong>: Queries the premium cloud engine to identify global generative anomalies before executing local pipeline fallbacks.
                          </div>
                        )}
                      </div>
                      
                      <div className={styles.disclaimerText} style={{
                        marginTop: '2rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid var(--glass-border)',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.4',
                        textAlign: 'justify'
                      }}>
                        <strong>Disclaimer:</strong> This tool is an AI-assisted analysis prototype and is not intended for use as legal testimony, forensic evidence in courts, or law enforcement proceedings. AI detection models can produce false positives and false negatives. All results should be treated as probabilistic estimates and verified independently.
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
