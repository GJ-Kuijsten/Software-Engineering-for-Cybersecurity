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

			const body = JSON.parse(record.body);

			if (!body.user_id || !body.translation) {
				console.log("Skipping invalid record");
				continue;
			}

			await docClient.send(
				new PutCommand({
					TableName: HISTORY_TABLE,
					Item: {
						user_id: body.user_id, // Partition Key
						timestamp: body.timestamp, // Sort Key
						source_text: body.source_text,
						target_language: body.target_language,
						translation: body.translation,
					},
				})
			);

			console.log(`Saved history for user: ${body.user_id}`);
		} catch (err) {
			console.error("Worker Error:", err);
		}
	}

	return { status: "processed" };
};
