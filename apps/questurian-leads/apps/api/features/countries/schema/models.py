from typing import Optional
from pydantic import BaseModel


class CountryCreate(BaseModel):
    name: str


class CountryUpdate(BaseModel):
    name: Optional[str] = None


class CountryResponse(BaseModel):
    id: int
    name: str
