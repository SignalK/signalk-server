// The path$source key helpers live in utils so the data slice can use
// them too; re-exported here for the Data Browser modules built on them.
export {
  getPath$SourceKey,
  getPathFromKey,
  findContextName
} from '../../utils/pathKeys'

// Signal K paths originate from data providers and are not guaranteed
// URL-safe. Encode each segment before embedding a path into an API URL.
export function pathToUrlSegments(path: string): string {
  return path.split('.').map(encodeURIComponent).join('/')
}
