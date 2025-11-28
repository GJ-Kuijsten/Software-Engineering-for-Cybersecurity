import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const HISTORY_TABLE = "TranslationHistory";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  // SQS sends a batch of records
  for (const record of event.Records) {
    try {
      console.log("Processing SQS Message:", record.messageId);

      // 1. Parse the message sent from index.js
      const body = JSON.parse(record.body);

      // 2. Validate
      if (!body.user_id || !body.translation) {
          console.log("Skipping invalid record");
          continue;
      }

      // 3. Save to DynamoDB
      await docClient.send(new PutCommand({
        TableName: HISTORY_TABLE,
        Item: {
          user_id: body.user_id,          // Partition Key
          timestamp: body.timestamp,      // Sort Key
          source_text: body.source_text,
          target_language: body.target_language,
          translation: body.translation,
        },
      }));

      console.log(`Saved history for user: ${body.user_id}`);

    } catch (err) {
      console.error("Worker Error:", err);
      // Optional: Throwing an error here causes SQS to retry the message
    }
  }

  return { status: "processed" };
};
