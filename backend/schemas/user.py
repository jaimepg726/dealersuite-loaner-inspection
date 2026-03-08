"""
DealerSuite — User Management Pydantic Schemas
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    """Manager creates a new porter or manager account."""
    name:     str
    email:    EmailStr
    password: str
    role:     str = "porter"   # "porter" | "manager" | "admin"


class UserUpdate(BaseModel):
    """Partial update — supply only the fields you want to change."""
    name:      Optional[str]  = None
    role:      Optional[str]  = None
    is_active: Optional[bool] = None
    password:  Optional[str]  = None   # supply to force a password reset


class UserResponse(BaseModel):
    id:         int
    name:       str
    email:      str
    role:       str
    is_active:  bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    total: int
    users: list[UserResponse]
