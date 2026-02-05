FROM python:3.11-slim

WORKDIR /app
COPY apps/backend/requirements.txt apps/backend/requirements-dev.txt /app/apps/backend/
RUN pip install --no-cache-dir -r /app/apps/backend/requirements.txt

COPY . /app

ENV PYTHONPATH=/app/apps/backend:/app/packages/shared/src:/app/packages/utils/src
EXPOSE 4003

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4003"]
