import 'dotenv/config';

export const config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY, // Added for Gemini
  WHISPER_MODEL: process.env.WHISPER_MODEL || 'whisper-1',
  TTS_VOICE: process.env.TTS_VOICE || 'nova', // Available: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer
}; 

