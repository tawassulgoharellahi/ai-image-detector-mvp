# AI & Deepfake Image Detector MVP

A premium, modern web application designed to detect AI-generated and deepfaked images. Built with a Next.js (React) frontend and a Python FastAPI backend, it runs multiple AI classification models in parallel to analyze visual patterns.

## Features

- **Multi-Model Pipeline**: Runs three distinct models to classify uploaded images:
  1. **SigLIP2 General Detector** (`king1oo1/deepfake-model`): Google's advanced vision-language encoder fine-tuned to classify real vs. AI images.
  2. **FLUX.1-Specific Detector** (`LukasT9/flux-detector`): EfficientNet-B2 fine-tuned specifically for detecting FLUX generation artifacts.
  3. **ViT-v2 Deepfake Detector** (`prithivMLmods/Deep-Fake-Detector-v2-Model`): Vision Transformer fine-tuned to detect face and photorealism deepfakes.
- **Modern UI/UX**: Built with Next.js featuring a sleek dark mode, glassmorphism, scan-line progress indicators, and visual confidence bar charts.
- **Local CPU Execution**: Fallbacks and loaders optimized to run efficiently on standard consumer CPU/macOS setups without compilation bottlenecks.

## Directory Structure

```
├── backend/            # FastAPI Python server
│   ├── main.py         # Main API routes & model pipelines
│   └── requirements.txt # Python dependencies
├── frontend/           # Next.js React client
│   ├── app/            # Next.js App Router & main UI components
│   ├── public/         # Static assets
│   └── package.json    # Frontend configuration & dependencies
└── README.md
```

## Setup & Installation

### Prerequisites
- Node.js (v18.0.0 or higher)
- Python (v3.9.0 or higher)

### 1. Backend Setup (FastAPI)
Navigate to the `backend` directory, set up a virtual environment, install dependencies, and start the development server:

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server (runs on http://localhost:8000)
python -m uvicorn main:app --reload
```

### 2. Frontend Setup (Next.js)
Open a new terminal window, navigate to the `frontend` directory, install npm dependencies, and start the dev server:

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server (runs on http://localhost:3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the app.

## How It Works
1. **User Uploads Image**: The frontend sends the image to the backend via standard multiform data.
2. **True Format Verification**: The backend dynamically detects the true image bytes (e.g. JPEG, WebP, PNG) to prevent processing crashes.
3. **Parallel Inference**: The image is preprocessed and run through all three loaded models concurrently.
4. **Classification Scores**: The predictions (AI probability vs. Real probability) are unified and returned to the frontend to be rendered as progress bars.

## License
MIT
