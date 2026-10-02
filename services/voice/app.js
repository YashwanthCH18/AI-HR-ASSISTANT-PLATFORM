const express = require('express');
const multer = require('multer');
const { authenticate, asyncRoute } = require('../../shared/auth');

function createApp({ jwt, jwtSecret, sarvamKey, routerBaseUrl, fetchImpl = fetch }) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'voice' }));
  app.post('/api/voice-query', authenticate(jwt, jwtSecret, ['admin', 'employee', 'manager', 'user']), upload.single('audio'), asyncRoute(async (req, res) => {
    if (!req.file || !req.file.mimetype.startsWith('audio/')) return res.status(400).json({ error: 'An audio file is required' });
    if (!sarvamKey || !routerBaseUrl) return res.status(503).json({ error: 'Voice service is not configured' });
    const authorization = req.headers.authorization;
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'speech.wav');
    form.append('model', 'saaras:v4');
    form.append('mode', 'translate');
    const stt = await fetchImpl('https://api.sarvam.ai/speech-to-text', {
      method: 'POST', headers: { 'api-subscription-key': sarvamKey }, body: form
    });
    if (!stt.ok) return res.status(502).json({ error: 'Speech transcription failed' });
    const transcriptResult = await stt.json();
    const transcript = transcriptResult.transcript?.trim();
    if (!transcript) return res.status(422).json({ error: 'No speech was recognized' });
    const rolePath = req.user.role === 'admin' ? 'admin' : 'user';
    const chat = await fetchImpl(`${routerBaseUrl.replace(/\/$/, '')}/${rolePath}/ai-query`, {
      method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: transcript })
    });
    const chatResult = await chat.json().catch(() => ({}));
    if (!chat.ok) return res.status(chat.status).json(chatResult);
    if (typeof chatResult.message !== 'string' || !chatResult.message) return res.status(502).json({ error: 'Chat returned no spoken response' });
    const tts = await fetchImpl('https://api.sarvam.ai/text-to-speech', {
      method: 'POST', headers: { 'api-subscription-key': sarvamKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chatResult.message, language_code: 'en-IN', model: 'bulbul:v3' })
    });
    if (!tts.ok) return res.status(502).json({ error: 'Speech synthesis failed' });
    const speech = await tts.json();
    if (!Array.isArray(speech.audios) || typeof speech.audios[0] !== 'string') return res.status(502).json({ error: 'Speech synthesis returned no audio' });
    return res.json({ transcript, detected_language: transcriptResult.language_code || null,
      intent: chatResult.intent, message: chatResult.message, data: chatResult.data,
      audio: { base64: speech.audios[0], mime_type: 'audio/wav', language_code: 'en-IN' } });
  }));
  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) return res.status(413).json({ error: 'Audio file is too large or invalid' });
    console.error(error);
    return res.status(500).json({ error: 'Voice service error' });
  });
  return app;
}

module.exports = { createApp };
