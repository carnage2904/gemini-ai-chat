import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GoogleGenAI } from '@google/genai';
import bodyParser from 'body-parser';

// Setup
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const historyFile = path.join(__dirname, 'gemini_history.json');
// let history = [];
// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));

function loadHistory() {
  if (!fs.existsSync(historyFile)) return [];
  const data = fs.readFileSync(historyFile, 'utf8');
  return JSON.parse(data);
}
function saveToHistory(prompt, response, imagePath = null) {
  const history = loadHistory();
  if (!history.find(entry => entry.prompt === prompt && entry.response === response)) {
    history.unshift({ prompt, response, imagePath });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  }
}

// GET route for prompt input
app.get('/', (req, res) => {
    const history=loadHistory();
  res.render('index.ejs', { response: null, history: history });
});
app.post('/ask', async (req, res) => {
  const prompt = req.body.prompt;
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = result.candidates[0].content.parts
      .map(part => part.text || '')
      .join('');

    saveToHistory(prompt, text, null);
    const history = loadHistory();
    res.render('index.ejs', { response: text, imagePath: null, history });
  } catch (err) {
    console.error(err);
    res.render('index.ejs', { response: 'Something went wrong!', imagePath: null, history: loadHistory() });
  }
});

// IMAGE + optional text generation
app.post('/generateimage', async (req, res) => {
  const prompt = req.body.prompt;
  let imagePath = null;

  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: prompt,
      config: { responseModalities: ["TEXT", "IMAGE"] },
    });

    const parts = result.candidates[0].content.parts;
    let text = "";
    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.inlineData) {
        const buffer = Buffer.from(part.inlineData.data, "base64");
        imagePath = `/images/${Date.now()}.png`;
        fs.writeFileSync(path.join(__dirname, 'public', imagePath), buffer);
      }
    }

    saveToHistory(prompt, text, imagePath);
    const history = loadHistory();
    res.render('index.ejs', { response: text, imagePath, history });
  } catch (err) {
    console.error(err);
    res.render('index.ejs', { response: 'Something went wrong!', imagePath: null, history: loadHistory() });
  }
});

app.post('/clear', (req, res) => {
  fs.writeFileSync(historyFile, JSON.stringify([], null, 2));
  res.redirect('/');
});
// Start server
app.listen(3000, () => {
  console.log("Server started on http://localhost:3000");
});

