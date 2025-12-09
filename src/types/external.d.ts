declare module '@xenova/transformers' {
  export interface PipelineOptions {
    quantized?: boolean
    pooling?: string
    normalize?: boolean
  }

  export type PipelineTask = 'feature-extraction'

  export interface PipelineOutput {
    data: Float32Array | number[]
  }

  export interface Pipeline {
    (input: string, options?: PipelineOptions): Promise<PipelineOutput>
  }

  export function pipeline(task: PipelineTask, model: string, options?: PipelineOptions): Promise<Pipeline>
}

declare module '@orama/orama' {
  export interface SchemaDefinition {
    [key: string]: string
  }

  export interface VectorSearchParams {
    mode: 'vector'
    vector: {
      value: number[]
      property: string
    }
    similarity?: number
    limit?: number
  }

  export interface SearchResult<T = any> {
    hits: Array<{ document: T; score: number }>
  }

  export type Orama<T = any> = unknown

  export function create(options: { schema: SchemaDefinition }): Promise<Orama>
  export function insert<T>(db: Orama<T>, doc: T): Promise<void>
  export function search<T>(db: Orama<T>, params: VectorSearchParams): Promise<SearchResult<T>>
}

declare module 'tesseract.js' {
  export function createWorker(language: string): Promise<{
    recognize(path: string): Promise<{ data: { text: string } }>
    terminate(): Promise<void>
  }>
}
