"""
DealerSuite — Database Seed Script
Run once after first migration to create the default admin user.

Usage:
    python seed.py

The admin password MUST be changed after first login.
"""

import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import AsyncSessionLocal, engine, Base
from models.user import User
from services.auth_service import hash_password


DEFAULT_ADMIN = {
    "name": "DealerSuite Admin",
    "email": "admin@dealersuite.app",
    "password": "ChangeMe123!",   # ← change immediately after first login
    "role": "admin",
}

DEFAULT_MANAGER = {
    "name": "Service Manager",
    "email": "manager@dealersuite.app",
    "password": "ChangeMe123!",
    "role": "manager",
}


async def seed():
    # Create all tables (idempotent — safe to run more than once)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        for user_data in [DEFAULT_ADMIN, DEFAULT_MANAGER]:
            result = await db.execute(
                select(User).where(User.email == user_data["email"])
            )
            existing = result.scalar_one_or_none()

            if existing:
                print(f"  ⏭  User already exists: {user_data['email']}")
            else:
                user = User(
                    name=user_data["name"],
                    email=user_data["email"],
                    hashed_password=hash_password(user_data["password"]),
                    role=user_data["role"],
                    is_active=True,
                )
                db.add(user)
                print(f"  ✅ Created {user_data['role']}: {user_data['email']}")

        await db.commit()

    print("\n⚠️  Remember to change the default passwords before going live!\n")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
