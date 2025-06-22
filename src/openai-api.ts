import axios from 'axios';
import { config } from './config';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';
import { tmpdir } from 'os';

const OPEANAI_API_URL = 'https://api.openai.com/v1';

export async function callTextToSpeechApi(text: string, voice: string = 'coral'): Promise<string | null> {
  console.log('🔊 callTextToSpeechApi called with text length:', text.length, 'voice:', voice);
  
  if (!config.OPENAI_API_KEY) {
    console.error('❌ OpenAI API key not found');
    return null;
  }

  // Truncate text if too long (OpenAI TTS has a 4096 character limit)
  const maxLength = 4000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  
  const headers = {
    'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const data = {
    model: 'gpt-4o-mini-tts',
    voice: voice,
    input: truncatedText,
    response_format: 'wav', // WAV for faster response and better compatibility
    instructions: 'Speak in a clear and natural tone.'
  };

  console.log('📤 TTS Request data:', {
    model: data.model,
    voice: data.voice,
    textLength: truncatedText.length,
    responseFormat: data.response_format
  });

  try {
    console.log('🌐 Sending request to OpenAI TTS API...');
    const response = await axios.post(`${OPEANAI_API_URL}/audio/speech`, data, { 
      headers,
      timeout: 30000, // 30 second timeout
      responseType: 'arraybuffer' // Important: get binary data
    });
    
    console.log(`✅ TTS API Response status: ${response.status}`);
    
    // Save the audio to a temporary file
    const audioFilePath = path.join(tmpdir(), `tts_${Date.now()}.wav`);
    fs.writeFileSync(audioFilePath, Buffer.from(response.data));
    
    console.log('💾 Audio saved to:', audioFilePath);
    return audioFilePath;
  } catch (error) {
    console.error('❌ OpenAI TTS API call error:');
    console.error('Error status:', error.response?.status);
    console.error('Error data:', error.response?.data);
    console.error('Error message:', error.message);
    return null;
  }
}

export async function callWhisperApi(filePath: string): Promise<string | null> {
  console.log('🎵 callWhisperApi called with file:', filePath);
  
  if (!config.OPENAI_API_KEY) {
    console.error('❌ OpenAI API key not found');
    return null;
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error('❌ Audio file does not exist:', filePath);
    return null;
  }

  const fileStats = fs.statSync(filePath);
  console.log('📊 File stats:', {
    size: fileStats.size,
    sizeKB: Math.round(fileStats.size / 1024),
    created: fileStats.birthtime
  });

  const headers = {
    'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
  };

  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: 'audio/wav',
  });
  form.append('model', config.WHISPER_MODEL);

  console.log('📤 Whisper request data:', {
    filename: path.basename(filePath),
    model: config.WHISPER_MODEL,
    filePath: filePath
  });

  try {
    console.log('🌐 Sending request to Whisper API...');
    const response = await axios.post(`${OPEANAI_API_URL}/audio/transcriptions`, form, {
      headers: {
        ...headers,
        ...form.getHeaders(),
      },
      timeout: 30000 // 30 second timeout
    });
    console.log(`✅ API Response status: ${response.status}`);
    console.log('📥 Response data keys:', Object.keys(response.data));
    const result = response.data.text;
    console.log('📝 Transcript length:', result?.length || 0);
    return result;
  } catch (error) {
    console.error('❌ Whisper API call error:');
    console.error('Error status:', error.response?.status);
    console.error('Error data:', error.response?.data);
    console.error('Error message:', error.message);
    return null;
  }
} 