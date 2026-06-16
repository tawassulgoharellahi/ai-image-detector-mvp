# Walkthrough: Automated Hybrid Deployment

We have configured and executed the setup for fully automated Git-driven hybrid deployment:
- **Frontend (Next.js)**: Configured to deploy on Vercel.
- **Backend (FastAPI)**: Deployed and running on Hugging Face Spaces.
- **CI/CD Pipeline**: Deployed commits to GitHub automatically trigger Vercel rebuilds (frontend) and GitHub Actions (backend).

---

## 🛠️ Changes Implemented

### 1. Frontend Refactoring ([frontend/app/page.tsx](file:///Users/tge/Documents/ai-detector-mvp/frontend/app/page.tsx#L114-L121))
*   Replaced the hardcoded API fetch endpoint `http://localhost:8000/api/detect` with a dynamic fallback check:
    ```typescript
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${API_URL}/api/detect`, {
    ```
    This allows the frontend in production to point to the Hugging Face Space backend URL.

### 2. Backend Refactoring ([backend/main.py](file:///Users/tge/Documents/ai-detector-mvp/backend/main.py#L108-L116))
*   Adjusted the CORS middleware configuration to accept wildcard origins and disabled credentials requirement (`allow_origins=["*"]`, `allow_credentials=False`).
*   This prevents browsers from blocking requests from the deployed Vercel domain to the Hugging Face Spaces API.

### 3. CI/CD Workflows ([.github/workflows/deploy-backend.yml](file:///Users/tge/Documents/ai-detector-mvp/.github/workflows/deploy-backend.yml))
*   Created a GitHub Actions workflow that:
    1. Triggers only on pushes to `main` that include modifications in the `backend/` directory.
    2. Runs a `git subtree push` to force-push the contents of `/backend` to the Hugging Face Spaces Git repository using a secret token (`HF_TOKEN`).

### 4. Dockerfile & Requirements Adjustments ([backend/Dockerfile](file:///Users/tge/Documents/ai-detector-mvp/backend/Dockerfile) & [backend/requirements.txt](file:///Users/tge/Documents/ai-detector-mvp/backend/requirements.txt))
*   **Permissions**: Created `/app/.cache` directories and explicitly changed their ownership to `user` (UID 1000) inside the `Dockerfile` to prevent `PermissionError` when downloading model caches.
*   **System Libs**: Replaced deprecated `libgl1-mesa-glx` with modern `libgl1` to ensure compatibility with newer Debian base images.
*   **PyTorch Size**: Pinned CPU-only versions of `torch` and `torchvision` using PyTorch's CPU wheel index to significantly decrease container size and memory footprints.
*   **Numpy**: Downgraded to `numpy<2` to prevent package warnings.

---

## 🚀 Live Backend Verification (Hugging Face Spaces)

We successfully verified that the backend is built, live, and running:
*   **Repository URL**: `https://huggingface.co/spaces/tawassulgohar/ai-image-detector-backend`
*   **Live Endpoint**: `https://tawassulgohar-ai-image-detector-backend.hf.space`
*   **Status Code Ping (`/health`)**:
    ```json
    {
      "status": "ok",
      "siglip_loaded": true,
      "flux_loaded": true,
      "vit_loaded": true
    }
    ```

---

## 🏁 Actions Needed to Go Live on Vercel

The backend is fully configured and ready. To finish the deployment of your frontend:

### Step 1: Link Vercel Project
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New** -> **Project**.
3. Select your GitHub repository: `ai-image-detector-mvp`.
4. In the Project configuration:
   * **Root Directory**: Select `frontend`.
   * **Framework Preset**: Next.js.
5. Expand the **Environment Variables** section and add:
   * **Name**: `NEXT_PUBLIC_API_URL`
   * **Value**: `https://tawassulgohar-ai-image-detector-backend.hf.space`
6. Click **Deploy**.

Once built, your site will be fully live and calling the models hosted on Hugging Face Spaces!

---

## 🔒 Google Gemini C2PA Identification Fix

*   **Problem**: Google Gemini (Imagen) generated images include cryptographic C2PA signatures signed by `"Google LLC"`. However, they organize metadata assertions under the **`"c2pa.actions.v2"`** schema label (rather than `"c2pa.actions"`). Because of this, the backend's C2PA parser missed the AI source designation, fell back to name-based camera heuristics, matched `"google"`, and incorrectly classified the image as a physical camera capture.
*   **Fix**: Modified the C2PA verification logic in [backend/main.py](file:///Users/tge/Documents/ai-detector-mvp/backend/main.py#L67) to check for both `"c2pa.actions"` and `"c2pa.actions.v2"` assertion labels:
    ```python
    if assertion.get("label") in ["c2pa.actions", "c2pa.actions.v2"]:
    ```
*   **Result**: Validated using the local test image `cyberpunk_cat_1781395205955.png` (a Google Gemini-generated image). The parser now correctly detects `isAi: true` and `isCamera: false`, allowing the backend to immediately identify it as AI-generated and bypass the neural network/camera pathways.
*   **Logic Rollback & "Google" AI Whitelist**: Reverted the addition of `"google"`, `"apple"`, and `"samsung"` to the camera keywords whitelist. Added `"google"` directly to the `ai_terms` list. As a result, any image signed by Google (with `"Google LLC"` as issuer) will now be classified as 100% AI-generated.


