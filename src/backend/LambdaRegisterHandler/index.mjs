import {
	DynamoDBClient,
	PutItemCommand,
	GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import bcrypt from "bcryptjs";

const db = new DynamoDBClient({});

export const handler = async (event) => {
	try {
		// Safe JSON parsing
		let body = {};
		try {
			body = JSON.parse(event.body || "{}");
		} catch {
			return response(400, { message: "Invalid JSON body" });
		}

		const { username, password } = body;

		// Validate input
		if (!username || !password) {
			return response(400, { message: "Missing username or password" });
		}

		// Check if user exists
		const checkUser = await db.send(
			new GetItemCommand({
				TableName: "Users",
				Key: { username: { S: username } },
			})
		);

		if (checkUser.Item) {
			return response(400, { message: "User already exists" });
		}

		// Hash password
		const hash = await bcrypt.hash(password, 10);

		// Create user
		await db.send(
			new PutItemCommand({
				TableName: "Users",
				Item: {
					username: { S: username },
					password: { S: hash },
				},
			})
		);

		return response(200, { message: "User registered successfully" });
	} catch (err) {
		console.error("Register error:", err);
		return response(500, { message: "Internal server error" });
	}
};

// Helper function for CORS
function response(statusCode, body) {
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
