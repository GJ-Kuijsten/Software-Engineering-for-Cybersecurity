import { handler } from "./index.mjs";
import {
	DynamoDBClient,
	GetItemCommand,
	PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import bcrypt from "bcryptjs";

const ddbMock = mockClient(DynamoDBClient);

// Mock bcrypt so we don't actually do CPU-intensive hashing during tests
jest.mock("bcryptjs");

describe("Lambda Register - Functional Tests", () => {
	beforeEach(() => {
		ddbMock.reset();
		jest.clearAllMocks();
	});

	// --- TEST 1: The "Happy Path" (Success) ---
	// Goal: Verify that valid input results in a 200 OK and a database write.
	test("Should successfully register a new user with 200 OK", async () => {
		// 1. Setup: User does NOT exist yet
		ddbMock.on(GetItemCommand).resolves({});

		// 2. Setup: Mock the hashing
		bcrypt.hash.mockResolvedValue("hashed_password_123");

		// 3. Setup: DB Write succeeds
		ddbMock.on(PutItemCommand).resolves({});

		const event = {
			body: JSON.stringify({
				username: "new_hero",
				password: "secure_password",
			}),
		};

		const result = await handler(event);

		// Assert: Status code is 200
		expect(result.statusCode).toBe(200);
		expect(JSON.parse(result.body).message).toBe(
			"User registered successfully"
		);
	});

	// --- TEST 2: Database Interaction Verification ---
	// Goal: Verify we are sending the CORRECT data to DynamoDB (Logic check).
	test("Should save the user to the 'Users' table with a hashed password", async () => {
		ddbMock.on(GetItemCommand).resolves({});
		bcrypt.hash.mockResolvedValue("hashed_ABC");

		const event = {
			body: JSON.stringify({ username: "alice", password: "plain_password" }),
		};

		await handler(event);

		// Assert: Check exactly what arguments were sent to DynamoDB
		const putCalls = ddbMock.commandCalls(PutItemCommand);
		expect(putCalls.length).toBe(1); // Ensure called exactly once

		const savedItem = putCalls[0].args[0].input.Item;
		expect(savedItem.username.S).toBe("alice");
		expect(savedItem.password.S).toBe("hashed_ABC");
	});

	// --- TEST 3: Business Logic (Duplicate Check) ---
	// Goal: Verify the logic that handles existing users.
	test("Should return 400 if the username is already taken", async () => {
		// Setup: DynamoDB returns an item (meaning user exists)
		ddbMock.on(GetItemCommand).resolves({
			Item: { username: { S: "existing_user" } },
		});

		const event = {
			body: JSON.stringify({ username: "existing_user", password: "password" }),
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(400);
		expect(JSON.parse(result.body).message).toBe("User already exists");

		// Critical Logic Check: Ensure we did NOT try to overwrite the user
		expect(ddbMock.commandCalls(PutItemCommand).length).toBe(0);
	});

	// --- TEST 4: API Gateway Contract (CORS Headers) ---
	// Goal: Verify the response includes the headers required by the frontend.
	test("Should include correct CORS headers in response", async () => {
		ddbMock.on(GetItemCommand).resolves({});

		const event = {
			body: JSON.stringify({ username: "cors_test", password: "pw" }),
		};

		const result = await handler(event);

		// Assert: Headers are present
		expect(result.headers).toBeDefined();
		expect(result.headers["Access-Control-Allow-Origin"]).toBe("*");
		expect(result.headers["Content-Type"]).toBe("application/json");
	});

	// --- TEST 5: Error Handling (Database Failure) ---
	// Goal: Verify the code handles a database crash without crashing the Lambda process itself.
	test("Should return 500 if DynamoDB fails to save", async () => {
		ddbMock.on(GetItemCommand).resolves({}); // User check passes

		// Setup: The PutItem command fails (e.g., permissions error or throughput exceeded)
		ddbMock.on(PutItemCommand).rejects(new Error("DynamoDB permission denied"));

		// Spy on console.error to keep test output clean
		jest.spyOn(console, "error").mockImplementation(() => {});

		const event = {
			body: JSON.stringify({ username: "error_user", password: "pw" }),
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(500);
		expect(JSON.parse(result.body).message).toBe("Internal server error");
	});
});
