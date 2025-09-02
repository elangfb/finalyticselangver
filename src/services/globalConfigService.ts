import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

export interface GlobalConfig {
  geminiApiKey: string
  updatedAt: Date
  updatedBy: string
}

/**
 * Service for managing global application configuration stored in Firestore.
 * Currently handles the global Gemini API key that admins can set for all users.
 */
export class GlobalConfigService {
  private db: ReturnType<typeof getFirestore> | null = null

  private getDb() {
    if (!this.db) {
      this.db = getFirestore()
    }
    return this.db
  }

  private getConfigDocRef() {
    return doc(this.getDb(), 'admin', 'config')
  }

  /**
   * Get the global Gemini API key from Firestore.
   * @returns Promise<string | null> - The API key if found, null if not set
   */
  async getGeminiApiKey(): Promise<string | null> {
    try {
      const docSnap = await getDoc(this.getConfigDocRef())
      if (docSnap.exists()) {
        const data = docSnap.data() as GlobalConfig
        return data.geminiApiKey || null
      }
      return null
    } catch (error) {
      console.error('Error fetching global Gemini API key:', error)
      throw new Error('Failed to fetch global configuration. Please try again.')
    }
  }

  /**
   * Set the global Gemini API key in Firestore.
   * Only admins should call this function.
   * @param apiKey - The Gemini API key to store
   * @param adminUserId - The UID of the admin user setting the key
   */
  async setGeminiApiKey(apiKey: string, adminUserId: string): Promise<void> {
    try {
      const configData: GlobalConfig = {
        geminiApiKey: apiKey,
        updatedAt: new Date(),
        updatedBy: adminUserId
      }

      await setDoc(this.getConfigDocRef(), configData)
    } catch (error) {
      console.error('Error setting global Gemini API key:', error)
      throw new Error('Failed to save global configuration. Please try again.')
    }
  }

  /**
   * Get the complete global configuration from Firestore.
   * @returns Promise<GlobalConfig | null> - The configuration object if found, null if not set
   */
  async getGlobalConfig(): Promise<GlobalConfig | null> {
    try {
      const docSnap = await getDoc(this.getConfigDocRef())
      if (docSnap.exists()) {
        return docSnap.data() as GlobalConfig
      }
      return null
    } catch (error) {
      console.error('Error fetching global configuration:', error)
      throw new Error('Failed to fetch global configuration. Please try again.')
    }
  }
}

// Export a singleton instance
export const globalConfigService = new GlobalConfigService()
