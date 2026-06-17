'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
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
  { id: 'SigLIP2',     name: 'SigLIP2',                  desc: 'General deepfake classifier',                     premium: false, warning: false },
  { id: 'FLUX',        name: 'FLUX Detector',             desc: 'Flow-matching anomalies (FLUX-specific)',          premium: false, warning: false },
  { id: 'ViT-v2',     name: 'ViT-v2',                   desc: 'Vision Transformer v2 anomaly detection',          premium: false, warning: false },
  { id: 'Sightengine', name: 'Sightengine AI Detection',  desc: 'Premium cloud-based verification layer',          premium: true,  warning: false },
];

const BASE_WEIGHTS: Record<string, number> = {
  SigLIP2:  0.60,
  FLUX:     0.20,
  'ViT-v2': 0.20,
};

export default function Home() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === 'authenticated';

  const [file, setFile]                   = useState<File | null>(null);
  const [preview, setPreview]             = useState<string | null>(null);
  const [isDragging, setIsDragging]       = useState(false);
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [results, setResults]             = useState<PredictionResult[] | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [loaderText, setLoaderText]       = useState('Initializing...');
  const [progressPct, setProgressPct]     = useState(0);
  const [selectedModels, setSelectedModels] = useState<string[]>(['SigLIP2', 'FLUX', 'ViT-v2']);
  const [overallScore, setOverallScore]   = useState<number | null>(null);
  const [c2pa, setC2pa]                   = useState<C2paMetadata | null>(null);
  const [sightengineFallback, setSightengineFallback] = useState(false);
  const [analysisSelectedModels, setAnalysisSelectedModels] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Quota ── */
  type Quota = { total: number; sightengine: number; total_limit: number; sightengine_limit: number; remaining_total: number; remaining_sightengine: number };
  const [quota, setQuota] = useState<Quota | null>(null);
  const [showPipelineNotice, setShowPipelineNotice] = useState(false);

  const fetchQuota = useCallback(async () => {
    if (!session?.user?.email) return;
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_URL}/api/usage`, { headers: { 'X-User-Id': session.user.email } });
      if (res.ok) {
        const qData = await res.json();
        setQuota(qData);
        if (qData.remaining_sightengine <= 0) {
          setSelectedModels(prev => {
            const filtered = prev.filter(id => id !== 'Sightengine');
            const locals = ['SigLIP2', 'FLUX', 'ViT-v2'];
            return [...new Set([...filtered, ...locals])];
          });
          setShowPipelineNotice(true);
        }
      }
    } catch { /* backend may not be up yet */ }
  }, [session?.user?.email]);

  useEffect(() => { fetchQuota(); }, [fetchQuota]);

  useEffect(() => {
    if (quota !== null && quota.remaining_sightengine <= 0) {
      setSelectedModels(prev => {
        const hasLocals = prev.includes('SigLIP2') && prev.includes('FLUX') && prev.includes('ViT-v2');
        const hasSightengine = prev.includes('Sightengine');
        if (!hasLocals || hasSightengine) {
          const filtered = prev.filter(id => id !== 'Sightengine');
          return [...new Set([...filtered, 'SigLIP2', 'FLUX', 'ViT-v2'])];
        }
        return prev;
      });
    }
  }, [quota]);

  useEffect(() => {
    if (showPipelineNotice) {
      const timer = setTimeout(() => {
        setShowPipelineNotice(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showPipelineNotice]);

  /* ── Drag & Drop ── */
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFileSelection(e.dataTransfer.files[0]);
  };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelection(e.target.files[0]);
  };

  const handleFileSelection = (f: File) => {
    if (!f.type.startsWith('image/')) { setError('Please upload an image file (JPEG, PNG, etc).'); return; }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResults(null);
    setC2pa(null);
  };

  /* ── Analyze ── */
  const analyzeImage = async () => {
    if (!file) return;
    if (selectedModels.length === 0) { setError('Please select at least one model.'); return; }

    setIsAnalyzing(true);
    setError(null);
    setLoaderText('Initializing...');
    setProgressPct(5);
    setC2pa(null);
    setAnalysisSelectedModels([...selectedModels]);

    const formData = new FormData();
    formData.append('file', file);
    const localModels = selectedModels.filter(m => m !== 'Sightengine');
    formData.append('models', localModels.join(','));
    formData.append('use_sightengine', selectedModels.includes('Sightengine').toString());

    const headers: Record<string, string> = {};
    if (session?.user?.email) headers['X-User-Id'] = session.user.email;

    try {
      const API_URL  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/detect`, { method: 'POST', body: formData, headers });
      if (!response.ok) {
        if (response.status === 429) {
          const detail = (await response.json()).detail as string;
          setError(detail);
          setIsAnalyzing(false);
          await fetchQuota();
          return;
        }
        throw new Error('Analysis failed. Backend might be down.');
      }

      const reader  = response.body?.getReader();
      if (!reader) throw new Error('Streaming not supported.');

      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.status === 'progress') {
              setLoaderText(data.stage);
              setProgressPct(data.progress);
            } else if (data.status === 'complete') {
              setResults(data.predictions);
              if (data.overallScore !== undefined) setOverallScore(data.overallScore);
              if (data.c2pa         !== undefined) setC2pa(data.c2pa);
              if (data.sightengine_fallback !== undefined) setSightengineFallback(data.sightengine_fallback);

              // Check if standard models were actually run by the backend
              const hasLocalModels = data.predictions.some((p: any) => 
                ['General: Fake', 'FLUX: AI', 'ViT-v2: Deepfake'].includes(p.label)
              );
              if (hasLocalModels) {
                setSelectedModels(prev => {
                  const locals = ['SigLIP2', 'FLUX', 'ViT-v2'];
                  const merged = [...new Set([...prev, ...locals])];
                  return merged;
                });
              }
            } else if (data.status === 'error') {
              throw new Error(data.message);
            }
          } catch { /* non-JSON chunk */ }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setIsAnalyzing(false);
      await fetchQuota(); // refresh quota display after each run
    }
  };

  const reset = () => {
    setFile(null); setPreview(null); setResults(null);
    setOverallScore(null); setC2pa(null); setError(null);
    setProgressPct(0); setLoaderText('Initializing...');
    setSightengineFallback(false);
    setAnalysisSelectedModels([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Derived weights ── */
  const activeModels    = AVAILABLE_MODELS.filter(m => selectedModels.includes(m.id) && m.id !== 'Sightengine').sort((a, b) => (BASE_WEIGHTS[b.id] || 0) - (BASE_WEIGHTS[a.id] || 0));
  const totalWeight     = activeModels.reduce((s, m) => s + (BASE_WEIGHTS[m.id] || 0), 0);
  const modelWeights    = activeModels.map(m => ({ id: m.id, name: m.name, pct: Math.round(((BASE_WEIGHTS[m.id] || 0) / (totalWeight || 1)) * 100) + '%' }));

  const vitResult       = results?.find(r => r.label.includes('ViT-v2'));
  const vitScore        = vitResult?.score ?? 0;
  const isC2paBypassed  = c2pa?.present && c2pa?.valid && (c2pa?.isAi || c2pa?.isCamera);
  const isSightengineBypassed = results?.some(r => r.label.startsWith('Sightengine:'));

  const renderWeightsText = () => {
    if (modelWeights.length === 0) return 'without any active pipeline models';
    if (modelWeights.length === 1) return <><strong>{modelWeights[0].id} (100%)</strong></>;
    return <>as a weighted average of {modelWeights.map((mw, i) => {
      const isLast = i === modelWeights.length - 1;
      const sep    = isLast ? '' : modelWeights.length === 2 ? ' and ' : i === modelWeights.length - 2 ? ', and ' : ', ';
      return <span key={mw.id}><strong>{mw.id} ({mw.pct})</strong>{sep}</span>;
    })}</>;
  };

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── STICKY NAVBAR ── */}
      <nav className={styles.navbar}>
        <div className={styles.navInner}>
          <div className={styles.navBrand}>
            <div>
              <div className={styles.navTitle}>AI Image Detector</div>
              <div className={styles.navSubtitle}>Deepfake &amp; Provenance Analysis</div>
            </div>
          </div>

          <div className={styles.navRight}>
            {status === 'loading' && <div className={styles.loadingSpinner} style={{ width: 22, height: 22, borderWidth: 2 }} />}
            {isLoggedIn && session?.user && (
              <div className={styles.userBadge}>
                {session.user.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt={session.user.name ?? 'avatar'} className={styles.avatar} referrerPolicy="no-referrer" />
                )}
                <span className={styles.userName}>{session.user.name}</span>
                <button className={styles.signOutBtn} onClick={() => signOut()}>Sign out</button>
              </div>
            )}
            {!isLoggedIn && status !== 'loading' && (
              <button className={styles.googleBtn} style={{ padding: '7px 16px', minWidth: 'auto', fontSize: '0.82rem', borderRadius: 10 }} onClick={() => signIn('google')}>
                <svg className={styles.googleIcon} style={{ width: 16, height: 16 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── PAGE SHELL ── */}
      <div className={styles.pageShell}>
        <main className={styles.pageContent}>

          {/* ── HERO ── */}
          <section className={styles.hero}>
            <div className={styles.heroBadge}>
              <span>⚡</span> Powered by C2PA + Neural Networks
            </div>
            <h1 className={`${styles.heroTitle} title-gradient`}>Is it AI or Real?</h1>
            <p className={styles.heroSubtitle}>
              Upload any image to instantly detect AI generation, deepfakes, and manipulations using cryptographic provenance and multi-model analysis.
            </p>
          </section>

          {/* ── AUTH STATES ── */}
          {status === 'loading' ? (
            <div className={styles.authWrap}>
              <div className={`glass-panel ${styles.loginCard}`}>
                <div className={styles.loadingSpinner} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading your session…</p>
              </div>
            </div>

          ) : !isLoggedIn ? (
            <div className={styles.authWrap}>
              <div className={`glass-panel ${styles.loginCard}`}>
                <div className={styles.loginIconWrap}>🔐</div>
                <h2>Sign in to continue</h2>
                <p>Authentication is required to access the detection tool and prevent misuse.</p>
                <div className={styles.divider} />
                <button className={styles.googleBtn} onClick={() => signIn('google')}>
                  <svg className={styles.googleIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
                <p className={styles.loginDisclaimer}>
                  By signing in you agree to our Terms of Service. We never store or share your images.
                </p>
              </div>
            </div>

          ) : !file ? (
            /* ── UPLOAD DROPZONE ── */
            <div className={styles.uploadWrap}>
              <div className={`glass-panel ${styles.uploadCard}`}>
                <div
                  className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <h3>Drag &amp; drop an image here</h3>
                  <p>or click to browse from your device</p>
                  <input type="file" ref={fileInputRef} onChange={onFileChange} accept="image/*" style={{ display: 'none' }} />
                </div>

                <div className={styles.uploadHints}>
                  <span className={styles.uploadHint}>JPEG / PNG / WEBP</span>
                  <span className={styles.uploadHint}>🔒 Never stored or shared</span>
                  <span className={styles.uploadHint}>⚡ Results in seconds</span>
                </div>
              </div>
            </div>

          ) : (
            /* ── DASHBOARD GRID ── */
            <div className={styles.dashboardGrid}>

              {/* ── LEFT PANEL ── */}
              <div className={`glass-panel ${styles.leftPanel}`}>

                {/* Image preview */}
                <div className={styles.previewContainer}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview as string} alt="Preview" className={styles.previewImage} />
                  {isAnalyzing && <div className="scan-line" />}
                </div>

                {error && <p className={styles.errorMsg}>{error}</p>}

                {/* Model selection */}
                <div>
                  <p className={styles.panelSectionTitle}>Detection Pipeline</p>
                  {quota !== null && quota.remaining_sightengine <= 0 && (
                    <div className={`${styles.pipelineNotice} ${!showPipelineNotice ? styles.pipelineNoticeHidden : ''}`}>
                      <span>⚠️</span>
                      <div>
                        <strong>Sightengine daily limit reached.</strong> The standard pipeline has been automatically selected.
                      </div>
                    </div>
                  )}
                  <div className={styles.checkboxGrid}>
                    {/* Checkbox 1: Standard AI Pipeline (SigLIP2, FLUX, ViT-v2) */}
                    <label className={`${styles.checkboxLabel} ${
                      (quota !== null && quota.remaining_sightengine <= 0) ? styles.checkboxLabelHighlighted : ''
                    }`}>
                      <input
                        type="checkbox"
                        disabled={isAnalyzing || results !== null || (quota !== null && quota.remaining_sightengine <= 0)}
                        checked={
                          selectedModels.includes('SigLIP2') &&
                          selectedModels.includes('FLUX') &&
                          selectedModels.includes('ViT-v2')
                        }
                        onChange={e => {
                          if (e.target.checked) {
                            const newModels = [...new Set([...selectedModels, 'SigLIP2', 'FLUX', 'ViT-v2'])];
                            setSelectedModels(newModels);
                          } else {
                            setSelectedModels(selectedModels.filter(id => id === 'Sightengine'));
                          }
                        }}
                      />
                      <div className={styles.checkboxText}>
                        <span className={styles.checkboxName}>
                          Standard Pipeline Models
                        </span>
                        <span className={styles.checkboxDesc}>
                          Runs SigLIP2, FLUX, and ViT-v2 vision transformers as a weighted ensemble
                        </span>
                      </div>
                    </label>

                    {/* Checkbox 2: Sightengine AI Detection (Premium) */}
                    <label 
                      className={`${styles.checkboxLabel} ${
                        (quota !== null && quota.remaining_sightengine <= 0) ? styles.checkboxLabelDisabled : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isAnalyzing || results !== null || (quota !== null && quota.remaining_sightengine <= 0)}
                        checked={selectedModels.includes('Sightengine') && (quota === null || quota.remaining_sightengine > 0)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedModels([...selectedModels, 'Sightengine']);
                          } else {
                            setSelectedModels(selectedModels.filter(id => id !== 'Sightengine'));
                          }
                        }}
                      />
                      <div className={styles.checkboxText}>
                        <span className={styles.checkboxName}>
                          Sightengine AI Detection
                          {quota !== null && quota.remaining_sightengine <= 0 ? (
                            <span className={styles.warningTag} style={{ textTransform: 'none', background: 'rgba(239, 68, 68, 0.15)' }}>Limit Reached</span>
                          ) : (
                            <span className={styles.premiumTag}>Premium</span>
                          )}
                        </span>
                        <span className={styles.checkboxDesc}>
                          Queries premium cloud API to detect generative noise fields
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Daily usage quota */}
                {quota && (
                  <div className={styles.quotaCard}>
                    <div className={styles.quotaTitle}>
                      <span>Daily Usage</span>
                      <span className={styles.quotaResets}>Resets UTC</span>
                    </div>

                    <div className={styles.quotaRow}>
                      <div className={styles.quotaLabelRow}>
                        <span className={styles.quotaLabel}>Total Images</span>
                        <span className={styles.quotaValue}>{quota.total} / {quota.total_limit}</span>
                      </div>
                      <div className={styles.quotaBar}>
                        <div 
                          className={styles.quotaFill} 
                          style={{ 
                            width: `${Math.min(100, (quota.total / quota.total_limit) * 100)}%`,
                            background: quota.total >= quota.total_limit ? 'var(--error)' : 'linear-gradient(90deg, var(--accent-indigo), var(--accent-blue))' 
                          }} 
                        />
                      </div>
                    </div>

                    <div className={styles.quotaRow}>
                      <div className={styles.quotaLabelRow}>
                        <span className={styles.quotaLabelPremium}>✨ Sightengine Cloud</span>
                        <span className={styles.quotaValue}>{quota.sightengine} / {quota.sightengine_limit}</span>
                      </div>
                      <div className={styles.quotaBar}>
                        <div 
                          className={styles.quotaFill} 
                          style={{ 
                            width: `${Math.min(100, (quota.sightengine / quota.sightengine_limit) * 100)}%`,
                            background: quota.sightengine >= quota.sightengine_limit ? 'var(--error)' : 'linear-gradient(90deg, #f59e0b, #ec4899)' 
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className={styles.actionRow}>
                  {!results && !isAnalyzing && (
                    <button className="btn-primary" onClick={analyzeImage}>
                      Analyze Image
                    </button>
                  )}
                  <button className={styles.btnSecondary} onClick={reset}>
                    {results || isAnalyzing ? '↩ New Image' : 'Cancel'}
                  </button>
                </div>
              </div>

              {/* ── RIGHT PANEL ── */}
              <div className={`glass-panel ${styles.rightPanel}`}>
                <h3 className={styles.reportTitle}>Analysis Report</h3>

                {/* Idle */}
                {!results && !isAnalyzing && (
                  <div className={styles.reportEmptyState}>
                    <span className={styles.reportEmptyIcon}>📊</span>
                    <h4>Ready for Detection</h4>
                    <p>Select models and click <strong>Analyze Image</strong> to generate a full anomaly report.</p>
                  </div>
                )}

                {/* Loading */}
                {isAnalyzing && (
                  <div className={styles.reportLoadingState}>
                    <p className="title-gradient animate-pulse" style={{ fontSize: '1.1rem', fontWeight: 600 }}>{loaderText}</p>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className={styles.progressLabel}>{progressPct}% Complete</span>
                  </div>
                )}

                {/* Results */}
                {results && overallScore !== null && (
                  <div className={styles.reportResultsState}>

                    {/* Sightengine Fallback Warning Banner */}
                    {sightengineFallback && (
                      <div className={styles.fallbackBanner}>
                        <span>⚠️</span>
                        <div>
                          <strong>Sightengine daily limit reached.</strong> Automatically shifted to standard local pipeline models.
                        </div>
                      </div>
                    )}

                    {/* Anomaly gauge */}
                    <div className={styles.anomalySection}>
                      <div className={styles.anomalyGauge}>
                        <div className={styles.anomalyValue}>{(overallScore * 100).toFixed(1)}%</div>
                        <div className={styles.anomalyLabel}>Anomaly Score</div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <div className={styles.verdictBadge} style={{
                          background: overallScore > 0.5 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                          color:      overallScore > 0.5 ? 'var(--error)' : 'var(--success)',
                          borderColor: overallScore > 0.5 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)',
                        }}>
                          {overallScore > 0.5 ? 'Likely AI Generated / Modified' : 'Likely Authentic / Real'}
                        </div>
                        {vitScore > 0.65 && overallScore <= 0.5 && (
                          <div className={styles.verdictBadge} style={{
                            background: 'rgba(245,158,11,0.12)',
                            color: 'var(--warning)',
                            borderColor: 'rgba(245,158,11,0.4)',
                          }}>
                            Possibly Digitally Edited
                          </div>
                        )}
                      </div>
                    </div>

                    {/* C2PA card */}
                    {c2pa?.present && (
                      <div className={styles.c2paCard}>
                        <div className={styles.c2paCardHead}>
                          <span className={styles.c2paCardTitle}>🛡️ Content Credentials (C2PA)</span>
                          <span className={`${styles.c2paBadge} ${
                            !c2pa.valid      ? styles.c2paBadgeInvalid :
                            c2pa.isAi        ? styles.c2paBadgeAi :
                            c2pa.isCamera    ? styles.c2paBadgeCamera :
                            styles.c2paBadgeNeutral
                          }`}>
                            {!c2pa.valid ? 'Invalid Signature' : c2pa.isAi ? 'Verified AI' : c2pa.isCamera ? 'Verified Camera' : 'C2PA Present'}
                          </span>
                        </div>
                        <div className={styles.c2paRows}>
                          <div className={styles.c2paRow}>
                            <span className={styles.c2paRowLabel}>Signature Trust</span>
                            <span className={`${styles.c2paRowValue} ${c2pa.valid ? styles.validSig : styles.invalidSig}`}>
                              {c2pa.valid ? '✓ Valid & Verified' : '✗ Invalid / Modified'}
                            </span>
                          </div>
                          {c2pa.claimGenerator && (
                            <div className={styles.c2paRow}>
                              <span className={styles.c2paRowLabel}>Capture / Edit Tool</span>
                              <span className={styles.c2paRowValue}>{c2pa.claimGenerator.replace(/_/g, ' ')}</span>
                            </div>
                          )}
                          {c2pa.issuer && (
                            <div className={styles.c2paRow}>
                              <span className={styles.c2paRowLabel}>Signing Authority</span>
                              <span className={styles.c2paRowValue}>{c2pa.issuer}</span>
                            </div>
                          )}
                          {c2pa.time && (
                            <div className={styles.c2paRow}>
                              <span className={styles.c2paRowLabel}>Timestamp</span>
                              <span className={styles.c2paRowValue}>
                                {new Date(c2pa.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bypassed messages or model breakdown */}
                    {isC2paBypassed ? (
                      <div className={styles.bypassedMsg}>
                        🛡️ Deep learning analysis bypassed — image origin is cryptographically certified by active Content Credentials (C2PA).
                      </div>
                    ) : isSightengineBypassed ? (
                      <div className={styles.bypassedMsg} style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.07)' }}>
                        ✨ Local neural network analysis bypassed — high-confidence AI signatures detected by the premium Sightengine API.
                      </div>
                    ) : (
                      <details className={styles.accordion}>
                        <summary className={styles.accordionSummary}>
                          <span>Model Breakdown</span>
                        </summary>
                        <div className={styles.accordionContent}>
                          {results.map(res => {
                            const isAILabel = ['ai', 'fake', 'deepfake', 'likelihood'].some(k => res.label.toLowerCase().includes(k));
                            if (!isAILabel) return null;

                            let displayName = res.label;
                            if (res.label.includes('General: Fake'))    displayName = 'SigLIP2 (General)';
                            else if (res.label.includes('FLUX: AI'))    displayName = 'FLUX Detector';
                            else if (res.label.includes('ViT-v2: Deepfake')) displayName = 'ViT-v2 Anomaly';
                            else if (res.label.startsWith('Sightengine:')) displayName = res.label.replace('Sightengine: ', '');

                            return (
                              <div key={res.label} className={styles.modelBarItem}>
                                <div className={styles.modelBarHeader}>
                                  <span>{displayName}</span>
                                  <span>{(res.score * 100).toFixed(1)}%</span>
                                </div>
                                <div className={styles.barContainer}>
                                  <div className={styles.barFill} style={{
                                    width: `${res.score * 100}%`,
                                    background: res.score > 0.5 ? 'var(--error)' : 'var(--success)',
                                  }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}

                    {/* Engine Summary */}
                    <div>
                      <p className={styles.sectionTitle}>Engine Summary</p>
                      <p className={styles.summaryText}>
                        {isC2paBypassed ? (
                          c2pa?.isAi ? (
                            <>Our engine registers a <strong>100.0% anomaly score</strong> — cryptographically certified by Content Credentials (C2PA) declaring generative AI origin.</>
                          ) : (
                            <>Our engine registers a <strong>0.0% anomaly score</strong> — certified by Content Credentials (C2PA) as a direct camera capture with no AI modification history.</>
                          )
                        ) : isSightengineBypassed ? (
                          <>Our engine predicts a <strong>{(overallScore * 100).toFixed(1)}% anomaly score</strong> — verified by the premium <strong>Sightengine AI Detection API</strong> which identified high-frequency noise fields and model-specific generative patterns.</>
                        ) : (analysisSelectedModels.includes('Sightengine') && !analysisSelectedModels.includes('SigLIP2') && results?.some(r => ['General: Fake', 'FLUX: AI', 'ViT-v2: Deepfake'].includes(r.label))) ? (
                          <>
                            {sightengineFallback ? (
                              <>Our engine predicts a <strong>{(overallScore * 100).toFixed(1)}% anomaly score</strong>. Because your Sightengine daily limit was reached, the system automatically shifted to local models ({renderWeightsText()}) to complete the analysis.</>
                            ) : (
                              <>Our engine predicts a <strong>{(overallScore * 100).toFixed(1)}% anomaly score</strong>. Because the premium Sightengine scan did not find high-confidence AI, the pipeline automatically cross-verified using the standard local models ({renderWeightsText()}).</>
                            )}
                            {' '}
                            {overallScore > 0.5
                              ? 'The image exhibits structural artifacts and high-frequency pixel anomalies characteristic of synthetic generation or inpainting.'
                              : 'The image shows natural lighting gradients and camera noise textures, indicating an authentic origin.'}
                          </>
                        ) : (
                          <>Our engine predicts a <strong>{(overallScore * 100).toFixed(1)}% anomaly score</strong> calculated {renderWeightsText()}.{' '}
                            {overallScore > 0.5
                              ? 'The image exhibits structural artifacts and high-frequency pixel anomalies characteristic of synthetic generation or inpainting.'
                              : 'The image shows natural lighting gradients and camera noise textures, indicating an authentic origin.'}
                          </>
                        )}
                      </p>
                    </div>

                    {/* About the Pipeline */}
                    <div>
                      <p className={styles.sectionTitle}>About the Pipeline</p>
                      <div className={styles.modelExplainGrid}>
                        {selectedModels.includes('SigLIP2') && (
                          <div className={styles.modelExplainItem}>
                            <strong>SigLIP2 ({modelWeights.find(m => m.id === 'SigLIP2')?.pct} weight)</strong>: Semantic transformer trained for general deepfakes and AI illustration patterns.
                          </div>
                        )}
                        {selectedModels.includes('FLUX') && (
                          <div className={styles.modelExplainItem}>
                            <strong>FLUX ({modelWeights.find(m => m.id === 'FLUX')?.pct} weight)</strong>: Calibrated for flow-matching anomalies produced by FLUX-based generators.
                          </div>
                        )}
                        {selectedModels.includes('ViT-v2') && (
                          <div className={styles.modelExplainItem}>
                            <strong>ViT-v2 ({modelWeights.find(m => m.id === 'ViT-v2')?.pct} weight)</strong>: Vision Transformer analyzing global anomalies; weighted lower due to real-photo calibration.
                          </div>
                        )}
                        {selectedModels.includes('Sightengine') && (
                          <div className={styles.modelExplainItem} style={{ borderLeftColor: 'var(--warning)' }}>
                            <strong>Sightengine (Cloud Tier)</strong>: Queries the premium cloud engine to identify generative anomalies before local fallbacks execute.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Disclaimer */}
                    <p className={styles.disclaimer}>
                      <strong>Disclaimer:</strong> This tool is an AI-assisted analysis prototype and is not intended for use as legal testimony, forensic evidence, or law enforcement proceedings. Results are probabilistic estimates and should be independently verified.
                    </p>

                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ── FOOTER ── */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <p className={styles.footerLeft}>
              © {new Date().getFullYear()} AI Image Detector — For research purposes only.
            </p>
            <div className={styles.footerRight}>
              <span className={styles.footerCredit}>
                Developed by <span className={styles.footerCreditLink}>TGE</span>
              </span>
              <span className={styles.footerDot}>·</span>
              <a href="https://c2pa.org" target="_blank" rel="noreferrer" className={styles.footerLink}>C2PA</a>
              <a href="https://github.com/tawassulgoharellahi/ai-image-detector-mvp" target="_blank" rel="noreferrer" className={styles.footerLink}>GitHub</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
