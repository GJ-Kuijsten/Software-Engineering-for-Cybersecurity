from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import httpx # For making requests to external APIs (like Mistral/Ollama)

from auth import SECRET_KEY, ALGORITHM
from jose import JWTError, jwt

from database import users_table, history_table, generate_uuid, generate_timestamp
from boto3.dynamodb.conditions import Key


# --- Setup ---
translate_router = APIRouter()

# This tells FastAPI where to look for the token
# 'tokenUrl' points to our /api/login endpoint
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# --- Pydantic Models ---
class TranslationRequest(BaseModel):
    """Model for an incoming translation request."""
    text: str
    target_lang: str # 'nl' or 'bg'

class HistoryItem(BaseModel):
    """Model for a single translation history item."""
    id: int
    source_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    # created_at: datetime # Per your diagram

# --- Auth Dependency ---

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Dependency to validate the JWT token and get the current user.
    This will be required by all protected endpoints.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decode the token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("id")
        if username is None or user_id is None:
            raise credentials_exception
        
        #
         # --- DATABASE LOGIC (DynamoDB) ---
        db_user = users_table.get_item(Key={"username": username})
        if "Item" not in db_user or db_user["Item"]["id"] != user_id:
            raise credentials_exception
        # --- END DATABASE LOGIC ---

        user_in_db = db_user["Item"]
        return {"username": user_in_db["username"], "id": user_in_db["id"]}

    except JWTError:
        raise credentials_exception

# --- API Endpoints ---

@translate_router.post("/translate", response_model=HistoryItem)
async def translate_text(
    request: TranslationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Translates a piece of text. Requires authentication.
    """
    user_id = current_user["id"]
    
    #
    # --- CACHING LOGIC (PLACEHOLDER) ---
    # 1. Create a hash of (request.text, request.target_lang)
    # 2. Check if this hash exists in 'TranslationHistory' for this user.
    # 3. If yes, return the cached translation.
    #
    
    #
    # --- EXTERNAL API CALL (PLACEHOLDER) ---
    # This is where you would call Ollama or Mistral.
    # Example using a mock response:
    
    print(f"User {user_id} is translating '{request.text}' to '{request.target_lang}'")
    
    mock_translation = ""
    if request.target_lang == "nl":
        mock_translation = f"[DUTCH] {request.text}"
    elif request.target_lang == "bg":
        mock_translation = f"[BULGARIAN] {request.text}"
    else:
        raise HTTPException(status_code=400, detail="Unsupported language")

    # Example of calling Ollama (if it were running on localhost:11434)
    # try:
    #     async with httpx.AsyncClient() as client:
    #         response = await client.post(
    #             "http://localhost:11434/api/generate",
    #             json={
    #                 "model": "mistral", # Or your chosen model
    #                 "prompt": f"Translate this English text to {request.target_lang}: {request.text}",
    #                 "stream": False
    #             },
    #             timeout=30.0
    #         )
    #     response.raise_for_status() # Raise an exception for bad responses
    #     translated_text = response.json()["response"]
    # except httpx.RequestError as e:
    #     raise HTTPException(status_code=503, detail=f"Translation service unavailable: {e}")
    #
    # --- END EXTERNAL API CALL ---
    #
    
    #
    # --- DATABASE LOGIC (DynamoDB) ---
    #
    item = {
        
        "user_id": user_id,
        "timestamp": generate_timestamp(),   # Sort key
        "id": generate_uuid(),               # Unique translation ID
        "source_text": request.text,
        "translated_text": mock_translation,
        "source_lang": "en",
        "target_lang": request.target_lang
    }

    history_table.put_item(Item=item)
    #
    # --- END DATABASE LOGIC ---
    #

    return item


@translate_router.get("/history", response_model=list[HistoryItem])
async def get_translation_history(
    current_user: dict = Depends(get_current_user)
):
    """
    Gets the user's translation history. Requires authentication.
    """
    user_id = current_user["id"]

   #
    # --- DATABASE LOGIC (DynamoDB) ---
    #
    result = history_table.query(
        KeyConditionExpression=Key("user_id").eq(user_id),
        ScanIndexForward=False  # newest first
    )
    #
    # --- END DATABASE LOGIC ---
    #

    return result.get("Items", [])
    
