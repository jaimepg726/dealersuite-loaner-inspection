"""
DealerSuite — Auth Routes
POST /api/auth/login   → returns access token
GET  /api/auth/me      → returns current user info
POST /api/auth/logout  → client-side token deletion (stateless JWT)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
from services.auth_service import verify_password, create_access_token
from dependencies import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
    user_id: int


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/login", response_model=TokenResponse, summary="Porter / Manager login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """
    Standard OAuth2 password flow.
    Username field accepts email address.
    Returns an 8-hour JWT for use in the Authorization header.
    """
    from models.user import User  # lazy import — avoids circular dep

    result = await db.execute(
        select(User).where(User.email == form_data.username.lower().strip())
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Contact your manager.",
        )

    token = create_access_token({"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=token,
        role=user.role,
        name=user.name,
        user_id=user.id,
    )


@router.get("/me", response_model=UserResponse, summary="Get current user")
async def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/logout", summary="Logout (client-side token discard)")
async def logout():
    """
    JWTs are stateless — actual logout is handled by the frontend
    deleting the token from localStorage.  This endpoint exists so
    the frontend has a clean API call to make on logout.
    """
    return {"message": "Logged out successfully"}
