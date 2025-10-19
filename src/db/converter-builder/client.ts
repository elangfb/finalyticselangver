import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  WithFieldValue,
  PartialWithFieldValue,
} from 'firebase/firestore'
import * as z from 'zod'

export type DataConverter<T> = FirestoreDataConverter<T>

/**
 * Options for the Zod Firestore converter
 */
export interface ZodConverterOptions {
  /**
   * Whether to validate data before writing to Firestore (default: true)
   */
  validateOnWrite?: boolean

  /**
   * Custom error handler for parsing errors
   */
  onError?: (error: z.ZodError) => void
}

/**
 * Creates a Firestore converter from a Zod schema
 *
 * @param schema - Zod schema to use for validation and type inference
 * @param options - Optional configuration for the converter
 * @returns A Firestore data converter
 *
 * @example
 * ```typescript
 * const userSchema = z.object({
 *   name: z.string(),
 *   email: z.string().email(),
 *   age: z.number().positive(),
 *   createdAt: z.date(),
 * });
 *
 * const userConverter = createZodFirestoreConverter(userSchema);
 *
 * // Use with Firestore
 * const userRef = doc(db, 'users', 'user123').withConverter(userConverter);
 * const userData = await getDoc(userRef);
 * ```
 */
export function createZodFirestoreConverter<T extends z.ZodTypeAny>(
  schema: T,
  options: ZodConverterOptions = {},
): FirestoreDataConverter<z.infer<T>> {
  const {
    validateOnWrite = true,
    onError,
  } = options

  return {
    /**
     * Converts a model object to Firestore data
     */
    toFirestore(
      modelObject: WithFieldValue<z.infer<T>> | PartialWithFieldValue<z.infer<T>>,
      options?: { merge?: boolean },
    ): DocumentData {
      // Validate before writing if enabled
      if (validateOnWrite) {
        try {
          // For partial updates, we skip validation
          if (!options?.merge) {
            schema.parse(modelObject)
          }
        } catch (error) {
          if (error instanceof z.ZodError) {
            if (onError) {
              onError(error)
            }
            throw new Error(
              `Validation failed before writing to Firestore: ${error.message}`,
            )
          }
          throw error
        }
      }

      return modelObject
    },

    /**
     * Converts Firestore data to a model object
     */
    fromFirestore(
      snapshot: QueryDocumentSnapshot,
      options?: SnapshotOptions,
    ): z.infer<T> {
      const data = snapshot.data(options)

      try {
        // Parse and validate the data
        return schema.parse(data)
      } catch (error) {
        if (error instanceof z.ZodError) {
          if (onError) {
            onError(error)
          }
          throw new Error(
            `Validation failed when reading from Firestore (doc: ${snapshot.id}): ${error.message}`,
          )
        }
        throw error
      }
    },
  }
}
