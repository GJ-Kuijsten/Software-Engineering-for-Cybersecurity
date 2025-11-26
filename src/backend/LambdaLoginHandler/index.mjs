import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const db = new DynamoDBClient({});

export const handler = async (event) => {
	try {
		const JWT_SECRET = process.env.JWT_SECRET;

		// Safe JSON parsing
		let body = {};
		try {
			body = JSON.parse(event.body || "{}");
		} catch {
			return response(400, { message: "Invalid JSON body" });
		}

		const { username, password } = body;

		if (!username || !password) {
			return response(400, { message: "Missing username or password" });
		}

		// Fetch user
		const result = await db.send(
			new GetItemCommand({
				TableName: "Users",
				Key: { username: { S: username } },
			})
		);

		if (!result.Item) {
			return response(401, { message: "Invalid username or password" });
		}

		const hashed = result.Item.password.S;
		const valid = await bcrypt.compare(password, hashed);

		if (!valid) {
			return response(401, { message: "Invalid username or password" }); // Won't reveal which part failed
		}

		const token = jwt.sign({ username: username }, JWT_SECRET, {
			expiresIn: "10h",
		});

		return response(200, {
			message: "Login successful",
			username: username,
			token: token,
		});
	} catch (err) {
		console.error("Login Error:", err);
		return response(500, { message: "Internal server error" });
	}
};

// Shared CORS response helper
function response(statusCode, body) {
	return {
		statusCode,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "*",
			"Access-Control-Allow-Methods": "OPTIONS,POST",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	};
}
