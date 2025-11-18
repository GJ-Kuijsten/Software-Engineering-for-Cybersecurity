from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import httpx
import hashlib

from auth import SECRET_KEY, ALGORITHM
from jose import JWTError, jwt

from database import users_table, history_table, generate_uuid, generate_timestamp
from boto3.dynamodb.conditions import Key

from cache import cache_get, cache_set   # <-- DynamoDB caching

# ---------------------------------------------------------
# FASTAPI ROUTER + TOKEN HANDLING
# ---------------------------------------------------------
translate_router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


# ---------------------------------------------------------
# REQUEST / RESPONSE MODELS
# ---------------------------------------------------------
class TranslationRequest(BaseModel):
    """Incoming request model containing the text and target language."""
    text: str
    target_lang: str


class HistoryItem(BaseModel):
    """A single translation record returned to the frontend."""
    id: int
    source_text: str
    translated_text: str
    source_lang: str
    target_lang: str


# ---------------------------------------------------------
# AUTH VALIDATION — DECODE TOKEN AND VERIFY USER IN DYNAMODB
# ---------------------------------------------------------
async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Validates the JWT token and loads the user from DynamoDB.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode JWT
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user_id = payload.get("id")

        if username is None or user_id is None:
            raise credentials_exception

        # Load user from DynamoDB Users table
        db_user = users_table.get_item(Key={"username": username})

        if "Item" not in db_user or db_user["Item"]["id"] != user_id:
            raise credentials_exception

        # Return validated user info
        return {
            "username": db_user["Item"]["username"],
            "id": db_user["Item"]["id"]
        }

    except JWTError:
        raise credentials_exception


# ---------------------------------------------------------
# TRANSLATION ENDPOINT
# ---------------------------------------------------------
@translate_router.post("/translate", response_model=HistoryItem)
async def translate_text(
    request: TranslationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Translates text using a mock translator (later replaced by Mistral/Ollama).
    Includes CACHE CHECK + CACHE SAVE.
    """
    user_id = current_user["id"]

    # ---------------------------------------------------------
    # CREATING CACHE KEY (unique hash of user + text + lang)
    # ---------------------------------------------------------
    cache_key = hashlib.sha256(
        f"{user_id}-{request.text}-{request.target_lang}".encode()
    ).hexdigest()

    # ---------------------------------------------------------
    # CACHE LOOKUP — RETURN IMMEDIATELY IF CACHED
    # ---------------------------------------------------------
    cached_result = cache_get(cache_key)
    if cached_result:
        print("CACHE HIT: Returning cached translation!")
        return cached_result

    print("CACHE MISS: Performing translation...")

    # ---------------------------------------------------------
    # MOCK TRANSLATION (replace with actual model later)
    # ---------------------------------------------------------
    if request.target_lang == "nl":
        mock_translation = f"[DUTCH] {request.text}"
    elif request.target_lang == "bg":
        mock_translation = f"[BULGARIAN] {request.text}"
    else:
        raise HTTPException(status_code=400, detail="Unsupported target language")

    # ---------------------------------------------------------
    # SAVE TRANSLATION TO DYNAMODB HISTORY TABLE
    # ---------------------------------------------------------
    new_item = {
        "user_id": user_id,
        "timestamp": generate_timestamp(),  # Sort key
        "id": generate_uuid(),
        "source_text": request.text,
        "translated_text": mock_translation,
        "source_lang": "en",
        "target_lang": request.target_lang
    }

    history_table.put_item(Item=new_item)

    # ---------------------------------------------------------
    # SAVE RESULT TO CACHE (DynamoDB cache table)
    # ---------------------------------------------------------
    cache_set(cache_key, new_item)

    return new_item


# ---------------------------------------------------------
# LOAD USER'S FULL TRANSLATION HISTORY
# ---------------------------------------------------------
@translate_router.get("/history", response_model=list[HistoryItem])
async def get_translation_history(current_user: dict = Depends(get_current_user)):
    """
    Returns all translation history for the logged-in user.
    Ordered by newest first.
    """
    user_id = current_user["id"]

    result = history_table.query(
        KeyConditionExpression=Key("user_id").eq(user_id),
        ScanIndexForward=False  # Newest first
    )

    return result.get("Items", [])
