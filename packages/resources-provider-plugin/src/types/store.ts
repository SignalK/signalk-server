// ** Resource Store Interface
export interface IResourceStore {
  savePath: string
  resources: any
  init: (basePath: string) => Promise<any>
  getResources: (
    type: string,
    item: any,
    params: { [key: string]: any }
  ) => Promise<{ [key: string]: any }>
  setResource: (r: StoreRequestParams) => Promise<void>
}

export interface StoreRequestParams {
  id: string
  type: string
  value: any
}
