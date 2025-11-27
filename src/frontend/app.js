function renderHistory(historyData, container) {
	container.innerHTML = "";

	if (!historyData || historyData.length === 0) {
		container.innerHTML = `<p class="text-gray-400 text-center">No history found.</p>`;
		return;
	}

	// Logic from Merge: Map codes to full names
	const languageNames = {
		NL: "Dutch",
		BG: "Bulgarian",
	};

	historyData.forEach((item) => {
		// Logic from Merge: Handle Case Sensitivity (DynamoDB vs Frontend)
		const targetLangCode = item.target_language || item.TargetLanguage;
		const sourceText = item.source_text || item.SourceText;
		const translation = item.translation || item.Translation;

		// Logic from Merge: Get readable name
		const displayLang = languageNames[targetLangCode] || targetLangCode || "?";

		const div = document.createElement("div");
		div.classList = "bg-gray-700 p-3 rounded-md mb-3";

		// --- SECURE RENDERING (From your Security Tests) ---

		// 1. Language Label
		const pLang = document.createElement("p");
		pLang.className = "text-sm text-gray-400";
		pLang.textContent = `English → ${displayLang}`;

		// 2. Source Text
		const pSource = document.createElement("p");
		pSource.className = "font-semibold";
		pSource.textContent = sourceText;

		// 3. Translation
		const pTrans = document.createElement("p");
		pTrans.className = "text-blue-300";
		pTrans.textContent = translation;

		div.appendChild(pLang);
		div.appendChild(pSource);
		div.appendChild(pTrans);

		container.appendChild(div);
	});
}

function handleLogout() {
	sessionStorage.clear();
	return "login.html";
}

if (typeof module !== "undefined") {
	module.exports = { renderHistory, handleLogout };
}
