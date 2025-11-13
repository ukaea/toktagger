FROM python:3.10

# Set working directory
WORKDIR /app

# Copy the application code
COPY ../../services ./services
COPY pyproject.toml README.md ./
RUN pip install .


# Run FastAPI with Uvicorn
CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]