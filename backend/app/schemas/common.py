from datetime import datetime
from pydantic import BaseModel


class ApiMessage(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime
