import { FileZenApi } from '../shared/types'

declare global {
  interface Window {
    fileZen: FileZenApi
  }
}
