from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from transformers import AutoImageProcessor, AutoModelForImageClassification, pipeline
from PIL import Image
import io
import torch
import torchvision.transforms as transforms
from huggingface_hub import hf_hub_download
import json
import asyncio
import c2pa

def verify_c2pa(image_bytes: bytes) -> dict:
    try:
        mime_type = "image/jpeg"
        if image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
            mime_type = "image/png"
        elif image_bytes.startswith(b'RIFF') and b'WEBP' in image_bytes[8:12]:
            mime_type = "image/webp"

        reader = c2pa.Reader.try_create(mime_type, stream=io.BytesIO(image_bytes))
        if not reader:
            return {"present": False}
            
        manifest_store = json.loads(reader.json())
        active_id = manifest_store.get("active_manifest")
        if not active_id:
            return {"present": False}
            
        manifests = manifest_store.get("manifests", {})
        active_manifest = manifests.get(active_id, {})
        
        validation_status = active_manifest.get("validation_status", [])
        is_valid = True
        for status in validation_status:
            val_code = status.get("status")
            if val_code and val_code != "success":
                is_valid = False
                break
                
        claim_generator = active_manifest.get("claim_generator", "")
        signature_info = active_manifest.get("signature_info", {})
        issuer = signature_info.get("issuer", "")
        time_signed = signature_info.get("time", "")
        
        is_ai = False
        assertions = active_manifest.get("assertions", [])
        for assertion in assertions:
            if assertion.get("label") == "c2pa.actions":
                actions = assertion.get("data", {}).get("actions", [])
                for action in actions:
                    digital_source = action.get("digitalSourceType")
                    if digital_source == "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia":
                        is_ai = True
                        break
                        
        is_camera = False
        if is_valid and not is_ai:
            generator_lower = claim_generator.lower()
            issuer_lower = issuer.lower()
            if any(term in generator_lower or term in issuer_lower for term in ["camera", "leica", "sony", "canon", "nikon"]):
                is_camera = True

        return {
            "present": True,
            "valid": is_valid,
            "claimGenerator": claim_generator,
            "issuer": issuer,
            "time": time_signed,
            "isAi": is_ai,
            "isCamera": is_camera
        }
    except Exception as e:
        print(f"C2PA inspection error: {e}")
        return {"present": False}

# Local model wrappers


app = FastAPI(title="AI Image Detector API")

# Allow requests from Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize standard SigLIP2 deepfake model
print("Loading SigLIP2 Deepfake Model...")
try:
    processor = AutoImageProcessor.from_pretrained("king1oo1/deepfake-model", use_fast=False)
    model = AutoModelForImageClassification.from_pretrained("king1oo1/deepfake-model")
    classifier = pipeline("image-classification", model=model, image_processor=processor)
    print("SigLIP2 Model loaded successfully!")
except Exception as e:
    print(f"Error loading SigLIP2 model: {e}")
    classifier = None

# Initialize FLUX detector model
print("Loading FLUX-specific Detector Model...")
try:
    flux_model_path = hf_hub_download(repo_id="LukasT9/flux-detector", filename="model.pt")
    flux_model = torch.jit.load(flux_model_path, map_location="cpu")
    flux_model.eval()
    print("FLUX-specific Detector loaded successfully!")
except Exception as e:
    print(f"Error loading FLUX model: {e}")
    flux_model = None

# Initialize ViT-v2 deepfake model
print("Loading ViT-v2 Deepfake Model...")
try:
    vit_processor = AutoImageProcessor.from_pretrained("prithivMLmods/Deep-Fake-Detector-v2-Model", use_fast=False)
    vit_model = AutoModelForImageClassification.from_pretrained("prithivMLmods/Deep-Fake-Detector-v2-Model")
    vit_classifier = pipeline("image-classification", model=vit_model, image_processor=vit_processor)
    print("ViT-v2 Model loaded successfully!")
except Exception as e:
    print(f"Error loading ViT-v2 model: {e}")
    vit_classifier = None

# Preprocessing transforms for FLUX model (EfficientNet B2 expects ImageNet normalization)
flux_transforms = transforms.Compose([
    transforms.Resize((288, 288)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

@app.get("/health")
def health_check():
    return {
        "status": "ok", 
        "siglip_loaded": classifier is not None,
        "flux_loaded": flux_model is not None,
        "vit_loaded": vit_classifier is not None
    }

@app.post("/api/detect")
async def detect_image(
    file: UploadFile = File(...),
    models: str = Form("SigLIP2,FLUX,ViT-v2"),
    x_mock_c2pa: str | None = Header(None)
):
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")

    contents = await file.read()
    selected_models = [m.strip() for m in models.split(",") if m.strip()]

    async def event_generator():
        try:
            yield json.dumps({"status": "progress", "stage": "Checking C2PA Provenance...", "progress": 5}) + "\n"
            await asyncio.sleep(0.01)

            # C2PA verification check
            if x_mock_c2pa == "ai":
                c2pa_res = {
                    "present": True,
                    "valid": True,
                    "claimGenerator": "DALL-E 3",
                    "issuer": "OpenAI CA",
                    "time": "2026-06-15T12:00:00Z",
                    "isAi": True,
                    "isCamera": False
                }
            elif x_mock_c2pa == "camera":
                c2pa_res = {
                    "present": True,
                    "valid": True,
                    "claimGenerator": "Leica M11",
                    "issuer": "Leica Camera CA",
                    "time": "2026-06-15T12:00:00Z",
                    "isAi": False,
                    "isCamera": True
                }
            else:
                c2pa_res = verify_c2pa(contents)
            if c2pa_res.get("present"):
                # Case A: Verified AI Generated
                if c2pa_res.get("valid") and c2pa_res.get("isAi"):
                    yield json.dumps({"status": "progress", "stage": "Verified AI Signature Found!", "progress": 100}) + "\n"
                    await asyncio.sleep(0.01)
                    yield json.dumps({
                        "status": "complete",
                        "predictions": [
                            {"label": "C2PA: AI Generated", "score": 1.0}
                        ],
                        "overallScore": 1.0,
                        "c2pa": c2pa_res
                    }) + "\n"
                    return

                # Case B: Verified Camera
                if c2pa_res.get("valid") and c2pa_res.get("isCamera"):
                    yield json.dumps({"status": "progress", "stage": "Verified Camera Signature Found!", "progress": 100}) + "\n"
                    await asyncio.sleep(0.01)
                    yield json.dumps({
                        "status": "complete",
                        "predictions": [
                            {"label": "C2PA: Authentic Camera", "score": 0.0}
                        ],
                        "overallScore": 0.0,
                        "c2pa": c2pa_res
                    }) + "\n"
                    return

            yield json.dumps({"status": "progress", "stage": "Initializing...", "progress": 10}) + "\n"
            await asyncio.sleep(0.01)

            if classifier is None:
                raise Exception("SigLIP2 AI Model is not loaded on the server.")

            # Load image in PIL
            image = Image.open(io.BytesIO(contents)).convert("RGB")
            predictions = []

            # Build list of active tasks based on user selection
            active_tasks = []

            if "SigLIP2" in selected_models:
                def run_siglip():
                    siglip_results = classifier(image)
                    local_preds = []
                    for res in siglip_results:
                        local_preds.append({
                            "label": f"General: {res['label']}",
                            "score": res['score']
                        })
                    return local_preds
                active_tasks.append(("SigLIP2", run_siglip, "Running SigLIP2 Model..."))

            if "FLUX" in selected_models and flux_model is not None:
                def run_flux():
                    tensor = flux_transforms(image).unsqueeze(0)
                    with torch.no_grad():
                        output = flux_model(tensor)
                        real_score = torch.sigmoid(output).item()
                        ai_score = 1.0 - real_score
                    return [
                        {"label": "FLUX: Real", "score": real_score},
                        {"label": "FLUX: AI", "score": ai_score}
                    ]
                active_tasks.append(("FLUX", run_flux, "Running FLUX Detector..."))

            if "ViT-v2" in selected_models and vit_classifier is not None:
                def run_vit():
                    vit_results = vit_classifier(image)
                    local_preds = []
                    for res in vit_results:
                        local_preds.append({
                            "label": f"ViT-v2: {res['label']}",
                            "score": res['score']
                        })
                    return local_preds
                active_tasks.append(("ViT-v2", run_vit, "Running ViT-v2 Model..."))

            total_tasks = len(active_tasks)
            if total_tasks == 0:
                raise Exception("No models selected for pipeline execution.")

            # Execute active tasks sequentially
            for index, (model_name, run_func, stage_name) in enumerate(active_tasks):
                progress_val = 15 + int(75 * index / total_tasks)
                yield json.dumps({"status": "progress", "stage": stage_name, "progress": progress_val}) + "\n"
                await asyncio.sleep(0.01)

                task_preds = await asyncio.to_thread(run_func)
                predictions.extend(task_preds)

            # Calculate overall calibrated score
            ai_scores = {}
            for p in predictions:
                label = p["label"]
                score = p["score"]
                if label == "General: Fake":
                    ai_scores["SigLIP2"] = score
                elif label == "FLUX: AI":
                    ai_scores["FLUX"] = score
                elif label == "ViT-v2: Deepfake":
                    ai_scores["ViT-v2"] = score

            weights = {
                "SigLIP2": 0.60,
                "FLUX": 0.20,
                "ViT-v2": 0.20
            }

            weighted_sum = 0.0
            total_weight = 0.0
            for model_name, score in ai_scores.items():
                w = weights.get(model_name, 0.0)
                weighted_sum += score * w
                total_weight += w

            overall_score = 0.0
            if total_weight > 0:
                overall_score = weighted_sum / total_weight

            # Apply concurrent indicators boost: +20% if ViT-v2 > 60% and SigLIP2 > 20%
            vit_score = ai_scores.get("ViT-v2", 0.0)
            siglip_score = ai_scores.get("SigLIP2", 0.0)
            if vit_score > 0.60 and siglip_score > 0.20:
                overall_score = min(overall_score + 0.20, 1.0)

            # Complete
            yield json.dumps({
                "status": "complete", 
                "predictions": predictions,
                "overallScore": overall_score,
                "c2pa": c2pa_res
            }) + "\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield json.dumps({"status": "error", "message": str(e)}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")
