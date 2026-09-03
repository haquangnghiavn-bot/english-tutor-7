const express = require('express');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const groqKey1 = (process.env.GROQ_API_KEY || '').trim();
const groqKey2 = (process.env.GROQ_API_KEY_BACKUP || groqKey1).trim();

const groqPrimary = groqKey1 ? new Groq({ apiKey: groqKey1 }) : null;
const groqBackup = groqKey2 ? new Groq({ apiKey: groqKey2 }) : null;

// Bóc tách JSON chuẩn xác
function cleanAIOutput(rawText) {
    if (!rawText) return '';
    let cleaned = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    cleaned = cleaned.replace(/<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/^Draft Response:\s*/i, '').trim();
    return cleaned;
}

function parseJsonSafely(rawText) {
    try {
        if (!rawText) return null;
        const cleaned = cleanAIOutput(rawText);
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        return JSON.parse(cleaned);
    } catch (e) {
        return null;
    }
}

async function callGroqAI(messages) {
    const client = groqPrimary || groqBackup;
    if (!client) throw new Error('Chưa cấu hình GROQ_API_KEY');

    const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];

    for (const modelName of modelsToTry) {
        try {
            const res = await client.chat.completions.create({
                messages: messages,
                model: modelName,
                temperature: 0.6,
                max_tokens: 1024
            });
            const output = res.choices[0]?.message?.content || '';
            if (output) return output;
        } catch (err) {
            console.warn(`[Groq Model ${modelName} lỗi]:`, err.message);
        }
    }
    throw new Error('Máy chủ AI không phản hồi');
}

// GIAO TIẾP VỚI GIA SƯ AI
app.post('/api/tutor', async (req, res) => {
    const { conversationHistory, studentName, currentUnit, currentSkill } = req.body;

    const systemInstruction = `You are a friendly Native British English teacher tutoring a 12-year-old Vietnamese student named ${studentName || 'Student'}.
Textbook: "Tiếng Anh 7 - Global Success".
Current Unit: "${currentUnit}".
Current Focus Skill: "${currentSkill || 'General Conversation'}".

CRITICAL RULES FOR YOUR OUTPUT:
1. You MUST ALWAYS output ONLY a valid JSON object. No markdown ticks, no <think> tags.
2. The JSON must contain EXACTLY two keys: "english" and "vietnamese".
   - "english": Your response in simple English (A2 level). DO NOT use emojis or special characters here (the TTS engine will read them aloud). Keep sentences short and clear.
   - "vietnamese": The Vietnamese translation, friendly explanation, and encouragement. YOU CAN use emojis here (😊, 🌟, 👍, 💡).
3. If teaching "Luyện đọc" (Reading), provide a short text (3-4 sentences) in the english field and ask a question.
4. If teaching "Từ vựng" (Vocabulary) or "Ngữ pháp" (Grammar), explain clearly and give examples.`;

    const groqMessages = [{ role: 'system', content: systemInstruction }];
    for (const msg of (conversationHistory || [])) {
        if (!msg.text || !msg.text.trim()) continue;
        if (msg.role === 'tutor') {
            // Reconstruct previous JSON to maintain context
            groqMessages.push({ role: 'assistant', content: JSON.stringify({ english: msg.english, vietnamese: msg.vietnamese }) });
        } else if (msg.role === 'student') {
            groqMessages.push({ role: 'user', content: msg.text.trim() });
        }
    }

    try {
        const rawReply = await callGroqAI(groqMessages);
        const parsed = parseJsonSafely(rawReply);
        
        if (parsed && parsed.english && parsed.vietnamese) {
            return res.json(parsed);
        }
        throw new Error('AI không trả về đúng định dạng JSON song ngữ');
    } catch (err) {
        console.error(err);
        return res.json({ 
            english: "I am having a small connection issue. Could you repeat that?", 
            vietnamese: "Thầy/Cô đang gặp chút vấn đề mạng. Em nói lại nhé! 😅" 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gia sư Tiếng Anh 7 AI sẵn sàng tại cổng: ${PORT}`);
});
