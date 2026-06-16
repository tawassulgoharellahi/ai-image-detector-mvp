import os
import sys
import time
from PIL import Image
import torch
import torchvision.transforms as transforms
from transformers import AutoImageProcessor, AutoModelForImageClassification, pipeline
from huggingface_hub import hf_hub_download

# Local model wrappers

def main():
    print("=== AI Image Detector - Sequential Pipeline test ===")
    
    # Check if test image exists, else download one
    test_img_path = "test.jpg"
    if not os.path.exists(test_img_path):
        import urllib.request
        print("Downloading sample test image...")
        urllib.request.urlretrieve("https://picsum.photos/800/800", test_img_path)
        
    image = Image.open(test_img_path).convert("RGB")
    print(f"Loaded image {test_img_path} (size: {image.size})")
    
    # ------------------
    # 1. Run SigLIP2
    # ------------------
    print("\n[1/3] Running SigLIP2 Model...")
    t0 = time.time()
    try:
        processor = AutoImageProcessor.from_pretrained("king1oo1/deepfake-model", use_fast=False)
        model = AutoModelForImageClassification.from_pretrained("king1oo1/deepfake-model")
        classifier = pipeline("image-classification", model=model, image_processor=processor)
        res = classifier(image)
        print(f"SigLIP2 Results: {res}")
        # cleanup
        del classifier, model, processor
        import gc
        gc.collect()
    except Exception as e:
        print(f"SigLIP2 failed: {e}")
    print(f"Time taken: {time.time() - t0:.2f}s")
    
    # ------------------
    # 2. Run FLUX Detector
    # ------------------
    print("\n[2/3] Running FLUX-specific Detector...")
    t0 = time.time()
    try:
        flux_model_path = hf_hub_download(repo_id="LukasT9/flux-detector", filename="model.pt")
        flux_model = torch.jit.load(flux_model_path, map_location="cpu")
        flux_model.eval()
        
        flux_transforms = transforms.Compose([
            transforms.Resize((288, 288)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        tensor = flux_transforms(image).unsqueeze(0)
        with torch.no_grad():
            output = flux_model(tensor)
            real_score = torch.sigmoid(output).item()
            print(f"FLUX Real Score: {real_score:.4f}, AI Score: {1.0 - real_score:.4f}")
            
        del flux_model, tensor
        import gc
        gc.collect()
    except Exception as e:
        print(f"FLUX failed: {e}")
    print(f"Time taken: {time.time() - t0:.2f}s")
    
    # ------------------
    # 3. Run ViT-v2
    # ------------------
    print("\n[3/3] Running ViT-v2 Model...")
    t0 = time.time()
    try:
        vit_processor = AutoImageProcessor.from_pretrained("prithivMLmods/Deep-Fake-Detector-v2-Model", use_fast=False)
        vit_model = AutoModelForImageClassification.from_pretrained("prithivMLmods/Deep-Fake-Detector-v2-Model")
        vit_classifier = pipeline("image-classification", model=vit_model, image_processor=vit_processor)
        res = vit_classifier(image)
        print(f"ViT-v2 Results: {res}")
        
        del vit_classifier, vit_model, vit_processor
        import gc
        gc.collect()
    except Exception as e:
        print(f"ViT-v2 failed: {e}")
    print(f"Time taken: {time.time() - t0:.2f}s")


if __name__ == "__main__":
    main()
