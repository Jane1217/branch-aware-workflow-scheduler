FROM python:3.11-slim

# Install system dependencies for OpenSlide
RUN apt-get update && apt-get install -y \
    openslide-tools \
    libopenslide-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install InstanSeg (if available)
# RUN pip install git+https://github.com/instanseg/instanseg.git

# Copy application code
COPY . .

# Create directories for data
RUN mkdir -p /app/results /app/uploads

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

