#!/bin/bash

# Setup script for Python calculation service
echo "Setting up Python calculation service..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Make Python scripts executable
chmod +x python_calc.py
chmod +x file_processor.py
chmod +x file_reader.py

echo "Python services setup complete!"
echo ""
echo "Services available:"
echo "  📊 Calc Service:"
echo "    - For datasets > 1000 rows: Python will be used automatically"
echo "    - For datasets > 10000 numbers: Python will be used for sum/avg"
echo "    - Results are cached for 5 minutes"
echo "    - Batch processing available for very large datasets"
echo ""
echo "  📁 File Reader Service:"
echo "    - Read file content from file names"
echo "    - Supports JSON, CSV, and other formats"
echo "    - Results are cached for 15 minutes"
echo ""
echo "  📊 File Processor Service:"
echo "    - High-performance CSV/JSON file processing"
echo "    - Fast metric extraction from large files"
echo "    - Results are cached for 10 minutes"
echo "    - Supports date filtering and multiple metrics"
echo ""
echo "Note: The virtual environment is located in ./venv/"
echo "To activate manually: source venv/bin/activate"
