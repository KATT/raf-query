/* eslint-disable */
// @ts-nocheck

import { Route as rootRouteImport } from './routes/__root'
import { Route as PostsRouteImport } from './routes/posts'

const PostsRoute = PostsRouteImport.update({
  id: '/posts',
  path: '/posts',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/posts': typeof PostsRoute
}
export interface FileRoutesByTo {
  '/posts': typeof PostsRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/posts': typeof PostsRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/posts'
  fileRoutesByTo: FileRoutesByTo
  to: '/posts'
  id: '__root__' | '/posts'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  PostsRoute: typeof PostsRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/posts': {
      id: '/posts'
      path: '/posts'
      fullPath: '/posts'
      preLoaderRoute: typeof PostsRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  PostsRoute: PostsRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
