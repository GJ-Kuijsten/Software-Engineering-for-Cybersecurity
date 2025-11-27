/**
 * @jest-environment jsdom
 */

// 1. ADD THIS LINE: Import jest tools explicitly
import { jest, describe, test, expect } from "@jest/globals";

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { renderHistory, handleLogout } = require("../src/frontend/app.js");

describe("Frontend Security Tests", () => {
	test("Should Prevent XSS: Malicious scripts in history should NOT be executable", () => {
		document.body.innerHTML = '<div id="history-container"></div>';
		const container = document.getElementById("history-container");

		const maliciousData = [
			{
				TargetLanguage: "NL",
				SourceText: "<img src=x onerror=alert('Hacked')>",
				Translation: "Hallo",
			},
		];

		renderHistory(maliciousData, container);

		const imageTag = container.querySelector("img");

		expect(imageTag).toBeNull();
		// Note: innerHTML normalizes the string, adding quotes. This checks if the text exists safe.
		expect(container.textContent).toContain("<img src=x");
	});

	test("Should completely clear sensitive session storage on logout", () => {
		const mockSession = {
			getItem: jest.fn(),
			setItem: jest.fn(),
			clear: jest.fn(),
		};
		Object.defineProperty(window, "sessionStorage", { value: mockSession });

		const redirectUrl = handleLogout();

		expect(mockSession.clear).toHaveBeenCalled();
		expect(redirectUrl).toBe("login.html");
	});
});
