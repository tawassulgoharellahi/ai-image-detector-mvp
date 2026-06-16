# Use official Python 3.11 slim image
FROM python:3.11-slim

# Install system dependencies needed for OpenCV, C2PA, and Hugging Face downloads
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set up a new user named "user" with UID 1000 to run on Hugging Face Spaces (safety standard)
RUN useradd -m -u 1000 user
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application files and set permissions
COPY --chown=user . /app

# Ensure cache directories exist and are writable by the non-root user
RUN mkdir -p /app/.cache/huggingface /app/.cache/torch && \
    chown -R user:user /app

# Switch to the non-root user
USER user

# Set environment variables for cache directories so they write to /app (which is writable)
ENV HOME=/app \
    HF_HOME=/app/.cache/huggingface \
    TORCH_HOME=/app/.cache/torch

# Expose Hugging Face default port
EXPOSE 7860

# Run FastAPI backend using uvicorn on port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
