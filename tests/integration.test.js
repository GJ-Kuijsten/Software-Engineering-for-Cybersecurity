import fetch from "node-fetch";

const API_URL = "https://8ac60j2lnf.execute-api.eu-north-1.amazonaws.com/prod";
const TEST_USER = { username: "test", password: "test" };

describe("AWS Production Integration Tests (Using Fetch)", () => {
	let authToken = "";

	test("1. Should login with pre-existing test user and receive a JWT", async () => {
		const response = await fetch(`${API_URL}/User/Login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(TEST_USER),
		});

		const data = await response.json();

		if (!response.ok) console.error("Login Failed:", data);

		expect(response.status).toBe(200);
		expect(data).toHaveProperty("token");

		authToken = data.token;
	});

	test("2. Should successfully translate text using the EC2 Ollama model", async () => {
		expect(authToken).toBeTruthy();

		const payload = {
			text: "Hello, how are you?",
			target_lang: "NL",
		};

		const response = await fetch(`${API_URL}/OllamaTranslationHandler`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify(payload),
		});

		const data = await response.json();

		if (!response.ok) console.error("Translation Failed:", data);

		expect(response.status).toBe(200);
		expect(data.source).toBe("ollama");
		expect(data.translation.toLowerCase()).toContain("hallo");
	}, 30000); // 30 seconds timeout

	test("3. Should block access without a token", async () => {
		const payload = { text: "Secret", target_lang: "NL" };

		const response = await fetch(`${API_URL}/OllamaTranslationHandler`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			// NO Authorization header here
			body: JSON.stringify(payload),
		});

		expect([401, 403]).toContain(response.status);
	});

	test("4. Should handle malformed requests gracefully", async () => {
		const response = await fetch(`${API_URL}/OllamaTranslationHandler`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({}), // Empty body
		});

		const data = await response.json();

		expect(response.status).not.toBe(200);
		expect(data).toHaveProperty("error");
		expect(data.error).toBe("Missing text or target_lang");
	});

	test("5. Should register a NEW random user and immediately login", async () => {
		const randomId = Math.floor(Math.random() * 100000);
		const newUser = {
			username: `integ_fetch_${randomId}`,
			password: "Password123!",
		};

		// A. Register
		const regRes = await fetch(`${API_URL}/User/Register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(newUser),
		});
		expect(regRes.status).toBe(200);

		// B. Login
		const loginRes = await fetch(`${API_URL}/User/Login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(newUser),
		});

		const loginData = await loginRes.json();

		expect(loginRes.status).toBe(200);
		expect(loginData).toHaveProperty("token");
	});
});
