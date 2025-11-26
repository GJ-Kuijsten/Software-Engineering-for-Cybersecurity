import { handler } from "./index.mjs";
import {
	DynamoDBClient,
	GetItemCommand,
	PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import bcrypt from "bcryptjs";

const ddbMock = mockClient(DynamoDBClient);

jest.mock("bcryptjs");

describe("Lambda Register - Functional Tests", () => {
	beforeEach(() => {
		ddbMock.reset();
		jest.clearAllMocks();
	});

	test("Should successfully register a new user with 200 OK", async () => {
		ddbMock.on(GetItemCommand).resolves({});

		bcrypt.hash.mockResolvedValue("hashed_password_123");

		ddbMock.on(PutItemCommand).resolves({});

		const event = {
			body: JSON.stringify({
				username: "new_hero",
				password: "secure_password",
			}),
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(200);
		expect(JSON.parse(result.body).message).toBe(
			"User registered successfully"
		);
	});

	test("Should save the user to the 'Users' table with a hashed password", async () => {
		ddbMock.on(GetItemCommand).resolves({});
		bcrypt.hash.mockResolvedValue("hashed_ABC");

		const event = {
			body: JSON.stringify({ username: "alice", password: "plain_password" }),
		};

		await handler(event);

		const putCalls = ddbMock.commandCalls(PutItemCommand);
		expect(putCalls.length).toBe(1);

		const savedItem = putCalls[0].args[0].input.Item;
		expect(savedItem.username.S).toBe("alice");
		expect(savedItem.password.S).toBe("hashed_ABC");
	});

	test("Should return 400 if the username is already taken", async () => {
		ddbMock.on(GetItemCommand).resolves({
			Item: { username: { S: "existing_user" } },
		});

		const event = {
			body: JSON.stringify({ username: "existing_user", password: "password" }),
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(400);
		expect(JSON.parse(result.body).message).toBe("User already exists");

		expect(ddbMock.commandCalls(PutItemCommand).length).toBe(0);
	});

	test("Should include correct CORS headers in response", async () => {
		ddbMock.on(GetItemCommand).resolves({});

		const event = {
			body: JSON.stringify({ username: "cors_test", password: "pw" }),
		};

		const result = await handler(event);

		expect(result.headers).toBeDefined();
		expect(result.headers["Access-Control-Allow-Origin"]).toBe("*");
		expect(result.headers["Content-Type"]).toBe("application/json");
	});

	test("Should return 500 if DynamoDB fails to save", async () => {
		ddbMock.on(GetItemCommand).resolves({}); // User check passes

		ddbMock.on(PutItemCommand).rejects(new Error("DynamoDB permission denied"));

		jest.spyOn(console, "error").mockImplementation(() => {});

		const event = {
			body: JSON.stringify({ username: "error_user", password: "pw" }),
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(500);
		expect(JSON.parse(result.body).message).toBe("Internal server error");
	});
});
