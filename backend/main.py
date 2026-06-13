from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoImageProcessor, AutoModelForImageClassification, pipeline
from PIL import Image
import io
import torch
import torchvision.transforms as transforms
from huggingface_hub import hf_hub_download


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
async def detect_image(file: UploadFile = File(...)):
    if classifier is None:
        raise HTTPException(status_code=500, detail="AI Model is not loaded.")
        
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")

    try:
        # Read the file contents into memory
        contents = await file.read()
        
        # Open the image using PIL
        image = Image.open(io.BytesIO(contents)).convert("RGB")
            
        predictions = []
        
        # 2. Run SigLIP2 inference
        siglip_results = classifier(image)
        for res in siglip_results:
            predictions.append({
                "label": f"General: {res['label']}",
                "score": res['score']
            })
            
        # 3. Run FLUX detector inference
        if flux_model is not None:
            tensor = flux_transforms(image).unsqueeze(0)
            with torch.no_grad():
                output = flux_model(tensor)
                # Output represents "Real" probability after sigmoid
                real_score = torch.sigmoid(output).item()
                ai_score = 1.0 - real_score
                
            predictions.append({
                "label": "FLUX: Real",
                "score": real_score
            })
            predictions.append({
                "label": "FLUX: AI",
                "score": ai_score
            })

        # 4. Run ViT-v2 inference
        if vit_classifier is not None:
            vit_results = vit_classifier(image)
            for res in vit_results:
                predictions.append({
                    "label": f"ViT-v2: {res['label']}",
                    "score": res['score']
                })
            
        return {
            "success": True,
            "filename": file.filename,
            "predictions": predictions
        }
        
    except Exception as e:
        print(f"Error during inference: {e}")
        raise HTTPException(status_code=500, detail="Error processing the image.")
