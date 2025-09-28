// Manages AI configuration, API key handling, and communication with the Gemini API.

import { currentUser, currentUserRole } from '@/core/state';
import { prompts } from '@/prompt';
import { globalConfigService } from '@/services/globalConfigService';
import { User } from 'firebase/auth';

const defaultGeminiConfig = Object.freeze({
  apiKey: '',
  prompts: prompts,
});

// This can be used if you need a mutable copy of the config.
const geminiConfig = structuredClone(defaultGeminiConfig);


/**
 * Load Gemini configuration for admin users from Firestore.
 */
export function loadGeminiConfig(): void {
  if (currentUserRole === 'admin') {
    loadCurrentApiKey();
  }
}

/**
 * Helper function to load the current API key from the global config service
 * and display it in the input field for admins.
 */
async function loadCurrentApiKey(): Promise<void> {
  try {
    const apiKey = await globalConfigService.getGeminiApiKey();
    const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
    if (apiKeyInput && apiKey) {
      apiKeyInput.value = apiKey;
    }
  } catch (error) {
    console.error('Error loading current API key:', error);
  }
}


/**
 * Initializes the configuration tab UI for admins to manage the Gemini API key.
 */
export function setupConfigurationTab(): void {
  const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
  if (apiKeyInput) {
    loadCurrentApiKey();

    apiKeyInput.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const apiKey = target.value.trim();

      if (!apiKey) {
        alert('Please enter a valid API key.');
        return;
      }

      try {
        if (!currentUser) throw new Error("User not authenticated.");
        await globalConfigService.setGeminiApiKey(apiKey, (currentUser as User).uid);
        alert('API Key saved successfully!');
      } catch (error) {
        console.error('Error saving API key:', error);
        alert('Failed to save API key. Please try again.');
      }
    });
  }
}

/**
 * Generates AI-powered business insights using Google Gemini API.
 * @param prompt - Text prompt containing business data for analysis.
 * @returns Promise that resolves to an object with the AI-generated text and token usage.
 */
export async function getGeminiAnalysis(prompt: string): Promise<{ summaryText: string, usageMetadata: any }> {
  const apiKey = await globalConfigService.getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please contact your administrator to set up the API key.');
  }
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error.message || `Request failed with status ${response.status}`);
  }

  const result = await response.json();
  const summaryText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis could be generated. The response from the AI was empty.';
  const usageMetadata = result.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };

  return { summaryText, usageMetadata };
}
