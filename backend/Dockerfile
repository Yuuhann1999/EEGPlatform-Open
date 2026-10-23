FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MPLBACKEND=Agg

WORKDIR /app

# Refresh the OS trust store during the image build (eMudhra/emSign, Oct 2026).
# CA_REFRESH is part of this layer's cache key so a pre-advisory apt layer
# is not reused. pip keeps --no-cache-dir below for the same reason.
ARG CA_REFRESH=20261023
RUN echo "ca-certificates refresh ${CA_REFRESH}" \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        libgomp1 \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install pip 26.2.2 from a hash-pinned wheel before requirements. Older pip
# vendors certifi and still trusts the compromised intermediates; the digest
# is checked even if that bundle is used to download this wheel.
RUN python -m pip install --no-cache-dir --upgrade \
        "pip @ https://files.pythonhosted.org/packages/3f/06/3e4420302363fbb71be3c7f35ce042f54bfca330e3e66b3a2e3c4cca579f/pip-26.2.2-py3-none-any.whl#sha256=fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70" \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip install --no-cache-dir --upgrade "certifi>=2026.10.19"

COPY app ./app

EXPOSE 8088

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8088}
