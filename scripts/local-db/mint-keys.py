#!/usr/bin/env python3
"""Mint long-lived local anon / service_role JWTs for PostgREST."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def mint(secret: bytes, role: str, now: int, exp: int) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(
        json.dumps(
            {"role": role, "iss": "supabase-local", "iat": now, "exp": exp},
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    sig = hmac.new(secret, signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{b64url(sig)}"


def main() -> None:
    secret = b"super-secret-jwt-token-with-at-least-32-characters-long"
    now = int(time.time())
    exp = now + 60 * 60 * 24 * 365 * 10
    print(f"ANON_KEY={mint(secret, 'anon', now, exp)}")
    print(f"SERVICE_ROLE_KEY={mint(secret, 'service_role', now, exp)}")
    print("JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long")
    print("DATABASE_URL=postgresql://postgres:localdev@127.0.0.1:5432/hedgpix")
    print("SUPABASE_URL=http://127.0.0.1:54321")
    print("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321")


if __name__ == "__main__":
    main()
