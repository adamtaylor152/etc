FROM python:3.13-slim

WORKDIR /app
RUN useradd --system --uid 10001 app && mkdir /data && chown app /data
COPY server.py emails.py ./
COPY public ./public

ENV PORT=8080 DATA_DIR=/data PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8080
USER app

HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz', timeout=2)"
CMD ["python", "server.py"]
