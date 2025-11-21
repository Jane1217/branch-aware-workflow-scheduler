FROM python:3.11-slim

# Install system dependencies for OpenSlide, GDAL (for rasterio), and curl (for health checks)
RUN apt-get update && apt-get install -y \
    openslide-tools \
    libopenslide-dev \
    gdal-bin \
    libgdal-dev \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Set GDAL environment variables for rasterio
ENV GDAL_CONFIG=/usr/bin/gdal-config
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install InstanSeg
RUN pip install git+https://github.com/instanseg/instanseg.git || echo "InstanSeg installation failed, will use fallback"

# Copy application code
COPY . .

# Create directories for data
RUN mkdir -p /app/results /app/uploads

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

