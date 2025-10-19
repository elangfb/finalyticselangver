import * as z from 'zod'
import { createZodFirestoreConverter, DataConverter } from './converter-builder';

type DocumentSchema = z.ZodType;

/**
 * A recursive type that defines the valid structure for our path definitions.
 * It's an object where each value is either a static doc or a collection,
 * and collections can contain more definitions.
 */
type PathDefinitions = {
    [key: string]:
        | { readonly _type: 'staticDoc'; readonly schema: DocumentSchema }
        | {
              readonly _type: 'collection';
              readonly schema: DocumentSchema | null;
              readonly subcollections?: PathDefinitions;
          };
};

/**
 * The core recursive generic type that transforms a `PathDefinitions` type (T)
 * into the final, usable API type.
 */
type Paths<T extends PathDefinitions> = {
    // For each key (e.g., 'admin', 'accounts') in the definition...
    [K in keyof T]: T[K] extends { _type: 'staticDoc'; schema: infer S }
        ? // If it's a static doc, the type is a function returning path and schema.
          () => { path: string; schema: S; converter: S extends z.ZodType ? DataConverter<z.infer<S>> : undefined }
        : T[K] extends {
              _type: 'collection';
              schema: infer S;
              subcollections?: infer Sub;
          }
        ? // If it's a collection, the type is an intersection:
          // 1. The function part, which is ONLY included if the schema is NOT null.
          (S extends null ? {} : (id: string) => { path: string; schema: S; converter: S extends z.ZodType ? DataConverter<z.infer<S>> : undefined } & (Sub extends PathDefinitions ? Paths<Sub> : {})) &
          // 2. Properties for the collection itself (e.g., .collectionsPath).
          { collectionsPath: string; schema: S; converter: S extends z.ZodType ? DataConverter<z.infer<S>> : undefined; } &
          // 3. The API for any sub-paths attached directly to the collection.
          (Sub extends PathDefinitions ? Paths<Sub> : {})
        : never;
};


// --- Marker Functions (with Overloads) ---

export function staticDocumentPath<const TSchema extends DocumentSchema>(schema: TSchema) {
    return {
        _type: 'staticDoc',
        schema,
    } as const;
}

export function collectionPath<
    const TSchema extends DocumentSchema | null,
    const TSubcollections extends PathDefinitions
>(schema: TSchema, subcollections: TSubcollections): {
  readonly _type: 'collection';
  readonly schema: TSchema;
  readonly subcollections: TSubcollections;
};
export function collectionPath<const TSchema extends DocumentSchema>(schema: TSchema): {
  readonly _type: 'collection';
  readonly schema: TSchema;
};
export function collectionPath(schema: any, subcollections?: any) {
    const base = { _type: 'collection', schema };
    return subcollections ? { ...base, subcollections } : base;
}


// --- The createPaths Function ---

/**
 * Creates a type-safe, fluent path builder API from a declarative definition object.
 * @param definitions The object describing the Firestore collection/document structure.
 * @param parentSegments The array of path segments from the parent, used for recursion.
 * @returns A typed API for building paths.
 */
export function createPaths<const T extends PathDefinitions>(definitions: T, parentSegments: string[] = []): Paths<T> {
    const api: any = {};

    for (const [key, def] of Object.entries(definitions)) {
        const newSegments = [...parentSegments, key];

        // Generate the converter if a schema exists
        const converter = def.schema ? createZodFirestoreConverter(def.schema) : undefined;
        
        if (def._type === 'staticDoc') {
            api[key] = () => ({ path: newSegments.join('/'), schema: def.schema, converter });
        } else if (def._type === 'collection') {
            let collectionBuilder: any;

            if (def.schema) {
                // This is the function for getting a document by ID
                const builderFn = (id: string) => {
                    const docSegments = [...newSegments, id];
                    // Recursively create the API for subcollections of this *document*
                    const subCollectionsApi = def.subcollections
                        ? createPaths(def.subcollections, docSegments)
                        : {};

                    return {
                        path: docSegments.join('/'),
                        schema: def.schema,
                        converter,
                        ...subCollectionsApi,
                    };
                };
                collectionBuilder = builderFn;
            } else {
                // If schema is null, the base is just an object, not a function.
                collectionBuilder = {};
            }

            // Attach static properties like '.collectionsPath'
            collectionBuilder.collectionsPath = newSegments.join('/');
            collectionBuilder.schema = def.schema;
            collectionBuilder.converter = converter;

            // Attach the sub-path API for things like `paths.admin.config()`
            if (def.subcollections) {
                const subApiForCollection = createPaths(def.subcollections, newSegments);
                Object.assign(collectionBuilder, subApiForCollection);
            }

            api[key] = collectionBuilder;
        }
    }
    return api as Paths<T>;
}
