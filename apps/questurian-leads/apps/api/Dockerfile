FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && python -m playwright install --with-deps chromium

COPY apps/api /app

EXPOSE 8428

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8428", "--reload"]
