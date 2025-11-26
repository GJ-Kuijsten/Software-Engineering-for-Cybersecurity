import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";

const OLLAMA_HOST_URL = process.env.OLLAMA_HOST_URL;
const CACHE_TABLE_NAME = "TranslationCache";
const HISTORY_TABLE = "TranslationHistory";

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const JWT_SECRET = process.env.JWT_SECRET;

const getCacheKey = (text, targetLang) => {
    return `${text.toLowerCase().trim()}:${targetLang}`;
};

const getTranslationModel = () => "tinyllama";

export const handler = async (event) => {
    
    let username = "";

    // check if user is logged in
    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return corsResponse(401, { error: "Unauthorized" });
        }

        const token = authHeader.split(" ")[1];
        
        if (!token) {
            return corsResponse(401, { error: "Unauthorized" });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        username = decoded.username;
    } catch (err) {
        console.error("Auth Error:", err);
        return corsResponse(401, { message: "Invalid or expired token" });
    }

    try {
        if (!OLLAMA_HOST_URL) {
            return corsResponse(500, { error: "OLLAMA_HOST_URL not set" });
        }

        // Safe JSON parsing
        let request = {};
        try {
            request = JSON.parse(event.body || "{}");
        } catch {
            return corsResponse(400, { error: "Invalid JSON body" });
        }

        const { text, target_lang } = request;

        if (!text || !target_lang) {
            return corsResponse(400, { error: "Missing text or target_lang" });
        }

        const targetLangCode = target_lang.toUpperCase();
        const targetLanguageName = targetLangCode === "NL" ? "Dutch" : "Bulgarian";

        const cacheKey = getCacheKey(text, targetLangCode);

        // 1. CHECK CACHE
        // try {
        //     const cacheRes = await docClient.send(
        //         new GetCommand({
        //             TableName: CACHE_TABLE_NAME,
        //             Key: { CacheKey: cacheKey },
        //         })
        //     );

        //     if (cacheRes.Item) {
        //         return corsResponse(200, {
        //             translation: cacheRes.Item.Translation,
        //             source: "cache",
        //         });
        //     }
        // } catch (err) {
        //     console.error("Cache read error:", err);
        // }

        // 2. CALL OLLAMA
        const prompt = `Translate the following English text to ${targetLanguageName}, providing only the translated text: "${text}"`;

        let translation = "";

        try {
            const response = await fetch(`http://${OLLAMA_HOST_URL}/api/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 60000,
                body: JSON.stringify({
                    model: getTranslationModel(),
                    prompt: prompt,
                    stream: false,
                    options: { temperature: 0.1 },
                }),
            });

            if (!response.ok) {
                throw new Error(`Ollama server error: ${response.statusText}`);
            }

            const data = await response.json();
            translation = (data.response || "").trim();


            // const ollamaResponse = await axios.post(
            //     `${OLLAMA_HOST_URL}/api/generate`,
            //     {
            //         model: getTranslationModel(),
            //         prompt: prompt,
            //         stream: false,
            //         options: { temperature: 0.1 },
            //     },
            //     { headers: { "Content-Type": "application/json" }, timeout: 60000 }
            // );

            // translation = (ollamaResponse.data.response || "").trim();
        } catch (err) {
            console.error("Ollama error:", err);
            return corsResponse(503, { error: "Ollama unreachable: " + err.message });
        }

        // 3. SAVE TO CACHE
        // try {
        //     await docClient.send(
        //         new PutCommand({
        //             TableName: CACHE_TABLE_NAME,
        //             Item: {
        //                 CacheKey: cacheKey,
        //                 SourceText: text,
        //                 TargetLanguage: targetLangCode,
        //                 Translation: translation,
        //                 TTL: Math.floor(Date.now() / 1000) + 86400 * 30,
        //             },
        //         })
        //     );
        // } catch (err) {
        //     console.error("Cache write error:", err);
        // }

        // // 4. SAVE TO USER HISTORY
        // try {
        //     await docClient.send(
        //         new PutCommand({
        //             TableName: HISTORY_TABLE,
        //             Item: {
        //                 user_id: user_id,
        //                 timestamp: Date.now(),
        //                 SourceText: text,
        //                 TargetLanguage: targetLangCode,
        //                 Translation: translation,
        //             },
        //         })
        //     );
        // } catch (err) {
        //     console.error("History write error:", err);
        // }

        // 5. RETURN RESULT
        return corsResponse(200, {
            translation: translation,
            source: "ollama",
        });

    } catch (err) {
        console.error("Fatal error:", err);
        return corsResponse(500, { error: "Fatal server error" });
    }
};

// CORS
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

