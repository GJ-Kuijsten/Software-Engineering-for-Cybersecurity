import boto3
from boto3.dynamodb.conditions import Key
import uuid
from datetime import datetime

# Use your AWS region
dynamodb = boto3.resource("dynamodb", region_name="eu-west-1")

# Reference to the tables
users_table = dynamodb.Table("Users")
history_table = dynamodb.Table("TranslationHistory")

def generate_timestamp():
    return str(datetime.utcnow().timestamp())

def generate_uuid():
    return str(uuid.uuid4())
