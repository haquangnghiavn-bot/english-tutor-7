const express = require('express');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const groqKey1 = (process.env.GROQ_API_KEY || '').trim();
const groqPrimary = groqKey1 ? new Groq({ apiKey: groqKey1 }) : null;

function cleanAIOutput(rawText) {
    if (!rawText) return '';
    let cleaned = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    cleaned = cleaned.replace(/<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/^"|"$/g, '').trim();
    return cleaned;
}

async function callGroqAI(messages) {
    if (!groqPrimary) throw new Error('Chưa cấu hình GROQ_API_KEY');
    const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];

    for (const modelName of modelsToTry) {
        try {
            const res = await groqPrimary.chat.completions.create({
                messages: messages,
                model: modelName,
                temperature: 0.6,
                max_tokens: 500
            });
            const output = res.choices[0]?.message?.content || '';
            if (output) return output;
        } catch (err) {
            console.warn(`[Lỗi model ${modelName}]:`, err.message);
        }
    }
    throw new Error('Máy chủ AI bận');
}

app.post('/api/tutor', async (req, res) => {
    const { conversationHistory, studentName, currentUnit } = req.body;

    const systemInstruction = `You are a friendly, encouraging Native British English teacher tutoring a 12-year-old Vietnamese student named ${studentName || 'Student'}.
You are teaching from the textbook "Tiếng Anh 7 - Global Success". Current lesson: "${currentUnit}".

YOUR TUTORING RULES:
1. Be extremely encouraging, use friendly emojis (😊, 🌟, 👍).
2. Keep your English simple (A2 level).
3. If the student makes a grammar mistake, gently correct them.
4. BILINGUAL SUPPORT: If explaining grammar or vocabulary, you MUST use Vietnamese to help the student understand easily. Ask conversation questions in English.
5. Keep responses short (under 50 words). NEVER output <think> tags.`;

    const groqMessages = [{ role: 'system', content: systemInstruction }];
    for (const msg of (conversationHistory || [])) {
        if (!msg.text || !msg.text.trim()) continue;
        if (msg.role === 'tutor') {
            groqMessages.push({ role: 'assistant', content: cleanAIOutput(msg.text) });
        } else if (msg.role === 'student') {
            groqMessages.push({ role: 'user', content: msg.text.trim() });
        }
    }

    try {
        const reply = await callGroqAI(groqMessages);
        const finalReply = cleanAIOutput(reply);
        if (finalReply) return res.json({ reply: finalReply });
        throw new Error('Groq trả về rỗng');
    } catch (err) {
        return res.json({ reply: "Oh no, mạng của thầy/cô hơi chậm. Em nói lại giúp thầy/cô nhé! 😊" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gia sư Tiếng Anh 7 sẵn sàng tại cổng: ${PORT}`);
});
