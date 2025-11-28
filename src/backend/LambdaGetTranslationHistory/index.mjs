import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const HISTORY_TABLE = "TranslationHistory";

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

export const handler = async (event) => {
	try {
		// Parse request safely like the translator lambda
		let request = {};
		try {
			request = JSON.parse(event.body || "{}");
		} catch {
			return corsResponse(400, { error: "Invalid JSON body" });
		}

		const { user_id } = request;

		if (!user_id) {
			return corsResponse(400, { error: "Missing user_id" });
		}

		// Query DynamoDB for this user's translation history
		const result = await docClient.send(
			new QueryCommand({
				TableName: HISTORY_TABLE,
				KeyConditionExpression: "user_id = :u",
				ExpressionAttributeValues: {
					":u": user_id,
				},
				ScanIndexForward: false, // newest first
			})
		);

		return corsResponse(200, {
			history: result.Items || [],
		});
	} catch (err) {
		console.error("History query error:", err);
		return corsResponse(500, { error: "Server error retrieving history" });
	}
};

// CORS helper (same as translator lambda)
function corsResponse(statusCode, body) {
	return {
		statusCode,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "*",
			"Access-Control-Allow-Methods": "*",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	};
}
