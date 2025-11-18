import boto3
import hashlib
import time
from botocore.exceptions import ClientError

# -------------------------------------------------------
# Connect to DynamoDB (Free Tier)
# Make sure the region matches the region of your tables.
# -------------------------------------------------------
dynamodb = boto3.resource("dynamodb", region_name="eu-north-1")

# -------------------------------------------------------
# Select the DynamoDB table used for caching
# You must create this table manually before using it:
#
# Table Name: TranslationCache
# Primary Key: cache_key (String)
# -------------------------------------------------------
cache_table = dynamodb.Table("TranslationCache")


# -------------------------------------------------------
# Generate a unique hash from text + target language.
# This becomes the cache key.
#
# Example:
# text="Hello", lang="nl"
# cache_key -> "0fa13495a..."
# -------------------------------------------------------
def generate_cache_key(text: str, target_lang: str) -> str:
    raw = f"{text.lower().strip()}::{target_lang.lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()


# -------------------------------------------------------
# Read from cache (DynamoDB)
# If the item exists → return the cached translation.
# If not found → return None (cache miss).
# -------------------------------------------------------
async def cache_get(text: str, target_lang: str):
    cache_key = generate_cache_key(text, target_lang)

    try:
        response = cache_table.get_item(Key={"cache_key": cache_key})
        item = response.get("Item")

        # If the item exists → CACHE HIT
        if item:
            return item.get("translated_text")

        # No entry found → CACHE MISS
        return None

    except ClientError as e:
        print("DynamoDB GET error:", e)
        return None


# -------------------------------------------------------
# Write to cache (DynamoDB)
#
# We also store a TTL (Time To Live) so DynamoDB will
# automatically delete the cached item when expired.
#
# TTL is a Unix timestamp in the future.
# Here we set TTL to 3600 seconds = 1 hour.
# -------------------------------------------------------
async def cache_set(text: str, target_lang: str, translated_text: str):
    cache_key = generate_cache_key(text, target_lang)

    # TTL (expire time) — 1 hour from now
    ttl_timestamp = int(time.time()) + 3600

    try:
        cache_table.put_item(
            Item={
                "cache_key": cache_key,          # Primary key
                "translated_text": translated_text,
                "ttl": ttl_timestamp             # DynamoDB auto-delete time
            }
        )
    except ClientError as e:
        print("DynamoDB PUT error:", e)

