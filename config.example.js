// config.example.js
// =====================================================================
// TEMPLATE KONFIGURASI — Salin file ini menjadi config.js
// lalu isi dengan API key Anda sendiri. JANGAN commit config.js!
// =====================================================================

const CONFIG = {
  // Pilihan provider AI: 'gemini', 'groq', atau 'ollama'
  AI_PROVIDER: 'gemini',

  // --- Google Gemini ---
  // Dapatkan API Key di: https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: 'MASUKKAN_GEMINI_API_KEY_ANDA_DI_SINI',
  GEMINI_MODEL: 'gemini-3.1-flash-lite', // atau: gemini-1.5-flash, gemini-2.0-flash
  GEMINI_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',

  // --- Ollama (Lokal) ---
  // Ganti URL jika Anda menjalankan Ollama di server sendiri
  OLLAMA_URL: 'http://localhost:11434/api/generate',
  OLLAMA_MODEL: 'gemma3:latest', // ganti sesuai model yang sudah Anda pull

  // --- Groq (Alternatif cepat & gratis) ---
  // Dapatkan API Key di: https://console.groq.com/keys
  GROQ_API_KEY: 'MASUKKAN_GROQ_API_KEY_ANDA_DI_SINI',
  GROQ_URL: 'https://api.groq.com/openai/v1/chat/completions',
  GROQ_MODEL: 'llama-3.2-11b-vision-preview',

  // Bahasa respons AI
  LANGUAGE: 'Indonesian'
};
