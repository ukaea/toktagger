FROM python:3.12

# Set working directory
WORKDIR /app

# Copy the application code
COPY pyproject.toml README.md toktagger/api ./
RUN pip install uv && \
    uv pip install --system -e .[models]

CMD ["bash"]