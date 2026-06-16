# AI & Deepfake Image Detector MVP

A premium, modern web application designed to detect AI-generated and deepfaked images. Built with a Next.js (React) frontend and a Python FastAPI backend, it runs multiple AI classification models in parallel to analyze visual patterns and features a cryptographically verified **C2PA Content Credentials** provenance tier.

---

## Key Features

### 🛡️ 1. C2PA Content Credentials Provenance Layer (New)
Processes cryptographically signed image metadata locally on the backend in `<10ms` to check origin certificates:
*   **Case A: Verified AI Generated**: If a valid manifest contains the digital source type `trainedAlgorithmicMedia` (e.g. from Adobe Firefly, Midjourney, DALL-E 3), the backend immediately yields a **100% Anomaly Score** and exits early, bypassing deep learning inference. The frontend displays a prominent red **"Verified AI (C2PA)"** badge.
*   **Case B: Verified Camera**: If a valid manifest belongs to a verified hardware camera manufacturer (e.g. Leica, Sony, Canon, Nikon) and contains no generative edits, the backend yields a **0% Anomaly Score** and exits early. The frontend displays a green **"Verified Camera (C2PA)"** badge.
*   **Case C: Standard Fallback / Generic Manifest**: If the image is unsigned or has an untrusted signature, it falls back to deep learning model evaluation. If generic metadata is present, it is attached and shown in the inline **Content Credentials Card** on the UI.

### ✨ 2. Premium Cloud Detection Tier (New)
Provides optional API-based verification using the **Sightengine AI Generated Image Detection API** (`sightengine.com`) with a gold-gradient badge interface:
*   **Early Exit (AI Detected)**: If the cloud API detects AI with high confidence (score > 50%), it immediately returns the Sightengine predictions and generator details (e.g. Midjourney, Stable Diffusion, Flux), bypassing local model execution.
*   **Robust Fallback (Real Image / Failure)**: If the API credentials are unconfigured, if the image is detected as real (score <= 50%), or if the connection fails/rate-limits, the system automatically proceeds to Tier 3 local models.

### 📊 3. Calibrated Multi-Model Pipeline & Scoring
*   **SigLIP2 General Classifier (60% weight)** (`king1oo1/deepfake-model`): Google's advanced vision-language encoder fine-tuned to classify real vs. AI images.
*   **FLUX.1-Specific Detector (20% weight)** (`LukasT9/flux-detector`): EfficientNet-B2 fine-tuned to detect flow-matching artifacts characteristic of FLUX models.
*   **ViT-v2 Deepfake Detector (20% weight)** (`prithivMLmods/Deep-Fake-Detector-v2-Model`): Vision Transformer specialized in detecting photorealistic face swaps.

#### Smart Verdicts:
*   **"Digitally Edited" Verdict**: If the overall score is under 50% but the **ViT-v2** anomaly score is above **65%**, a secondary amber-colored badge displaying **"Digitally Edited"** is rendered next to the primary verdict badge to indicate manual alteration.

### 🖥️ 4. Sleek Split-Screen UI/UX
*   **Left Configuration Panel**: Configuration checklist for toggling pipeline models (including the Sightengine AI Detection tier, dynamically recalculating normalized weights in real-time) and image dropzone.
*   **Right Report Panel**: Live sequential progress bar, circular gauge indicating **Anomaly Probability**, Verdict Badges, C2PA Provenance Certificate Details (Signature Trust, Capture/Edit Tool, Signing Authority, local Timestamp), Model Breakdowns, and a professional legal disclaimer.

---

## Directory Structure

```
├── backend/            # FastAPI Python server
│   ├── main.py         # API routes, verify_c2pa helper & model pipelines
│   ├── requirements.txt # Python dependencies (including c2pa-python)
│   └── venv/           # Python virtual environment
├── frontend/           # Next.js React client
│   ├── app/            # Next.js App Router (page.tsx, layout.tsx, globals.css)
│   ├── public/         # Static assets
│   └── package.json    # Frontend configuration & dependencies
└── README.md
```

---

## Setup & Installation

### Prerequisites
*   Node.js (v18.0.0 or higher)
*   Python (v3.9.0 or higher)

### 1. Backend Setup (FastAPI)
Navigate to the `backend` directory, set up a virtual environment, install dependencies, configure environment variables, and start the development server:

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure Sightengine API credentials (required for cloud tier)
echo "SIGHTENGINE_API_USER=your_user_id\nSIGHTENGINE_API_SECRET=your_secret_key" > .env

# Start the server (runs on http://localhost:8000)
python -m uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup (Next.js)
Open a new terminal window, navigate to the `frontend` directory, install npm dependencies, and start the development server:

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server (runs on http://localhost:3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the application.

---

## 🚀 Automated Hybrid Deployment (Vercel + Hugging Face Spaces)

This repository is configured for fully automated hybrid deployment:
1. **Frontend (Next.js)**: Natively deploys from the `/frontend` subdirectory.
2. **Backend (FastAPI)**: Deployed to a free CPU Basic Docker space via GitHub Actions on pushes affecting the `/backend` subdirectory.

### Backend Setup (Hugging Face Spaces)
1. Create a new Space on [Hugging Face](https://huggingface.co/new-space).
2. Set the **Space SDK** to **Docker** (choose **Blank** / CPU Basic template, which is 100% free).
3. Generate a Write Access Token: Go to **Settings -> Access Tokens -> New Token**, select the **Write** role, and name it (e.g., `HF_DEPLOY_TOKEN`).
4. Go to your GitHub repository **Settings -> Secrets and variables -> Actions -> Secrets** and create a new repository secret:
   * **Name**: `HF_TOKEN`
   * **Value**: (Your Hugging Face Write Access Token).
5. The GitHub Action in `.github/workflows/deploy-backend.yml` will automatically push the backend directory to the Hugging Face Space repository on every commit to `main` that touches the `backend/` folder.

### Frontend Setup (Vercel)
1. Log in to [Vercel](https://vercel.com) using your GitHub account.
2. Click **Add New** -> **Project** and import your repository.
3. In the project configuration:
   * **Root Directory**: Select `frontend`.
   * **Framework Preset**: Next.js.
   * **Environment Variables**: Add `NEXT_PUBLIC_API_URL` and set its value to your Hugging Face Space endpoint (e.g., `https://<username>-<space-name>.hf.space`).
4. Click **Deploy**.

---

## License
MIT
