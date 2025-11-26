function renderHistory(historyData, container) {
	container.innerHTML = "";

	if (!historyData || historyData.length === 0) {
		container.innerHTML = `<p class="text-gray-400 text-center">No history found.</p>`;
		return;
	}

	historyData.forEach((item) => {
		const div = document.createElement("div");
		div.classList = "bg-gray-700 p-3 rounded-md mb-3";

		const pLang = document.createElement("p");
		pLang.className = "text-sm text-gray-400";
		pLang.textContent = `English → ${item.TargetLanguage}`;

		const pSource = document.createElement("p");
		pSource.className = "font-semibold";
		pSource.textContent = item.SourceText;

		const pTrans = document.createElement("p");
		pTrans.className = "text-blue-300";
		pTrans.textContent = item.Translation;

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
