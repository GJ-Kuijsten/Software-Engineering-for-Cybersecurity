from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from database import users_table, generate_uuid

# --- Configuration ---
# In a real app, move these to a 'config.py' or .env file
SECRET_KEY = "your-super-secret-key"  # CHANGE THIS!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Create a router for auth endpoints
auth_router = APIRouter()

# --- Pydantic Models (Data Validation) ---

class UserCreate(BaseModel):
    """Model for creating a new user (registration)."""
    name: str
    username: str
    password: str

class Token(BaseModel):
    """Model for returning a JWT token."""
    access_token: str
    token_type: str
    user: dict # Send back some user info

class TokenData(BaseModel):
    """Model for the data stored inside the JWT."""
    username: str | None = None


# --- Utility Functions ---

def verify_password(plain_password, hashed_password):
    """Checks if the plain password matches the hashed one."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Generates a hash for the given password."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Creates a new JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- API Endpoints ---

@auth_router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate):
    """
    Registers a new user.
    """
    # --- DATABASE LOGIC (DynamoDB) ---
    # 1. Check if username already exists
    result = users_table.get_item(Key={"username": user.username})
    if "Item" in result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # 2. Hash the password
    hashed_password = get_password_hash(user.password)
    
    # 3. Create new user object
    new_user_data = {
        "id": generate_uuid(),
        "name": user.name,
        "username": user.username,
        "password_hash": hashed_password
    }

   # 4. Save to DynamoDB
    users_table.put_item(Item=new_user_data)
    # --- END DATABASE LOGIC ---

    return {"message": "User registered successfully"}


@auth_router.post("/login", response_model=Token)
async def login_for_access_token(
    # FastAPI's OAuth2 form helper automatically gets 'username' and 'password'
    # from the form data. Our frontend will need to send this as
    # 'application/x-www-form-urlencoded' (or we can change this)
    # Let's switch to a simple JSON model to match the frontend mock
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    Logs in a user and returns a JWT token.
    """
    username = form_data.username
    password = form_data.password

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": username, "id": "dummy-id"},
        expires_delta=access_token_expires
    )

    # FOR NOW (remove later)
    return {
        "access_token": access_token,
        "token_type": "bearer", 
        "user": {"name": username, "username": username}
    }

    #
    # --- DATABASE LOGIC (DynamoDB) ---
    # 1. Retrieve user from DynamoDB
    result = users_table.get_item(Key={"username": username})

    if "Item" not in result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_in_db = result["Item"]

    # 2. Verify password
    if not verify_password(password, user_in_db["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # --- END DATABASE LOGIC ---
    
    # 3. Create the JWT token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_in_db["username"], "id": user_in_db["id"]},
        expires_delta=access_token_expires
    )
    
    # 4. Return the token and user info
    user_info = {"name": user_in_db["name"], "username": user_in_db["username"]}
    
    return {
        "access_token": access_token,
        "token_type": "bearer", 
        "user": user_info
    }
    
