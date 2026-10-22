from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import (
    check_throttle, clear_failures, clear_session, current_user, hash_pw, record_failure, set_session, verify_pw,
)
from lib.core import audit, now
from lib.db import db
from models.schemas import ChangePasswordIn, LoginIn, ProfileIn, UserOut

router = APIRouter(prefix="/auth")


def user_out(u: dict) -> UserOut:
    return UserOut(id=u["id"], email=u["email"], name=u["name"], role=u["role"])


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, response: Response):
    email = body.email.strip().lower()
    check_throttle(email)
    user = await db.users.find_one({"email": email, "role": "owner"}, {"_id": 0})
    if not user or not verify_pw(body.password, user["password_hash"]):
        record_failure(email)
        raise HTTPException(401, "Email atau kata sandi salah")
    clear_failures(email)
    set_session(response, user)
    await audit(user, "login", "users", user["id"])
    return user_out(user)


@router.post("/logout")
async def logout(response: Response):
    clear_session(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return user_out(user)


@router.put("/profile", response_model=UserOut)
async def update_profile(body: ProfileIn, user: dict = Depends(current_user)):
    email = body.email.strip().lower()
    clash = await db.users.find_one({"email": email, "id": {"$ne": user["id"]}})
    if clash:
        raise HTTPException(409, "Email sudah digunakan")
    await db.users.update_one({"id": user["id"]}, {"$set": {"email": email, "name": body.name, "updated_at": now()}})
    await audit(user, "ubah_profil", "users", user["id"], f"email={email}")
    return user_out({**user, "email": email, "name": body.name})


@router.post("/change-password")
async def change_password(body: ChangePasswordIn, response: Response, user: dict = Depends(current_user)):
    if not verify_pw(body.current_password, user["password_hash"]):
        raise HTTPException(400, "Kata sandi saat ini salah")
    pwv = user.get("pw_version", 1) + 1
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password), "pw_version": pwv, "updated_at": now()}}
    )
    set_session(response, {**user, "pw_version": pwv})  # other devices are signed out
    await audit(user, "ubah_sandi", "users", user["id"])
    return {"ok": True}
