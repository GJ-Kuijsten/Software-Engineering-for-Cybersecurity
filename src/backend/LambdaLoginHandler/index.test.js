import { handler } from "./index.mjs";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const ddbMock = mockClient(DynamoDBClient);

jest.mock("bcryptjs");
jest.mock("jsonwebtoken");

describe("Lambda Security Tests", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		ddbMock.reset();
	});

	test("Should return 400 for malformed JSON to prevent parsing crashes", async () => {
		const event = {
			body: '{ "username": "admin", "pass... BROKEN JSON',
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(400);
		expect(JSON.parse(result.body).message).toBe("Invalid JSON body");
	});

	test("Should reject requests with missing sensitive credentials", async () => {
		const event = {
			body: JSON.stringify({ username: "just_user_no_pass" }),
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(400);
		expect(JSON.parse(result.body).message).toBe(
			"Missing username or password"
		);
	});

	test("Should return 401 when password hash comparison fails", async () => {
		// Setup: DynamoDB finds user, but bcrypt says password doesn't match
		ddbMock.on(GetItemCommand).resolves({
			Item: {
				username: { S: "admin" },
				password: { S: "hashed_real_password" },
			},
		});

		bcrypt.compare.mockResolvedValue(false);

		const event = {
			body: JSON.stringify({ username: "admin", password: "wrong_password" }),
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(401);
		expect(JSON.parse(result.body).message).toBe(
			"Invalid username or password"
		);
		expect(bcrypt.compare).toHaveBeenCalledWith(
			"wrong_password",
			"hashed_real_password"
		);
	});

	test("Should return generic 500 error when DB fails, masking internal stack traces", async () => {
		ddbMock
			.on(GetItemCommand)
			.rejects(new Error("Connection timeout at 10.0.0.5"));

		const consoleSpy = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const event = {
			body: JSON.stringify({ username: "admin", password: "password" }),
		};

		const result = await handler(event);

		expect(result.statusCode).toBe(500);
		expect(JSON.parse(result.body).message).toBe("Internal server error");

		expect(result.body).not.toContain("Connection timeout");

		consoleSpy.mockRestore();
	});

	test("Should generate a JWT signed with the correct process.env.JWT_SECRET", async () => {
		ddbMock.on(GetItemCommand).resolves({
			Item: {
				username: { S: "user1" },
				password: { S: "hash" },
			},
		});
		bcrypt.compare.mockResolvedValue(true);
		jwt.sign.mockReturnValue("mock.signed.token");

		const event = {
			body: JSON.stringify({ username: "user1", password: "password123" }),
		};

		await handler(event);

		expect(jwt.sign).toHaveBeenCalledWith(
			{ username: "user1" },
			process.env.JWT_SECRET, // This matches the process.env override in beforeEach
			expect.objectContaining({ expiresIn: "10h" })
		);
	});
});
