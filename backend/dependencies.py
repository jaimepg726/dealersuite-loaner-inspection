"""
DealerSuite — FastAPI Shared Dependencies
Reusable Depends() functions injected into route handlers.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from services.auth_service import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ---------------------------------------------------------------------------
# Current user dependency
# ---------------------------------------------------------------------------

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Validates the JWT and returns the User ORM object.
    Raises 401 if the token is missing, expired, or invalid.
    Import here (lazy) to avoid circular imports before models exist.
    """
    from models.user import User  # imported lazily — defined in Stage 3

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exc

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exc

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exc

    return user


# ---------------------------------------------------------------------------
# Role-gated dependencies
# ---------------------------------------------------------------------------

async def require_manager(current_user=Depends(get_current_user)):
    """Only managers and admins may access this route."""
    if current_user.role not in ("manager", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager access required",
        )
    return current_user


async def require_admin(current_user=Depends(get_current_user)):
    """Only admins may access this route."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
