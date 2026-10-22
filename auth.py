"""Owner-only auth: bcrypt hashes, JWT in an httpOnly cookie, password-version revocation."""

import os
import time

import bcrypt
import jwt
from fastapi import HTTPException, Request, Response

from lib.db import db

COOKIE = "lia_session"
SECRET = os.environ["JWT_SECRET"]
MAX_AGE = 7 * 24 * 3600

_failures: dict[str, list[float]] = {}


def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_pw(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def check_throttle(key: str) -> None:
    window = time.time() - 15 * 60
    recent = [t for t in _failures.get(key, []) if t > window]
    _failures[key] = recent
    if len(recent) >= 5:
        raise HTTPException(429, "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.")


def record_failure(key: str) -> None:
    _failures.setdefault(key, []).append(time.time())


def clear_failures(key: str) -> None:
    _failures.pop(key, None)


def set_session(response: Response, user: dict) -> None:
    token = jwt.encode(
        {"sub": user["id"], "pwv": user.get("pw_version", 1), "exp": int(time.time()) + MAX_AGE},
        SECRET,
        algorithm="HS256",
    )
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=False, max_age=MAX_AGE, path="/")


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/")


async def current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Silakan login terlebih dahulu")
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sesi tidak valid atau kedaluwarsa")
    user = await db.users.find_one({"id": payload.get("sub"), "role": "owner"}, {"_id": 0})
    if not user or user.get("pw_version", 1) != payload.get("pwv"):
        raise HTTPException(401, "Sesi tidak valid atau kedaluwarsa")
    return user
