---
title: AI Image Detector Backend
emoji: 🛡️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# AI & Deepfake Image Detector Backend

This is the FastAPI backend for the AI & Deepfake Image Detector, containerized and running on Hugging Face Spaces (Docker).

It exposes:
- POST `/api/detect`: Evaluates image metadata (C2PA), checks Sightengine cloud AI detection (optional), and runs local ML models (SigLIP2, FLUX, ViT-v2).
- GET `/health`: Health status of the server and model loading.
