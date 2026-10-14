/* eslint-disable */
// @ts-nocheck

import { Route as rootRouteImport } from './routes/__root'
import { Route as PostsSlugRouteImport } from './routes/posts.$slug'

const PostsSlugRoute = PostsSlugRouteImport.update({
  id: '/posts/$slug',
  path: '/posts/$slug',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/posts/$slug': typeof PostsSlugRoute
}
export interface FileRoutesByTo {
  '/posts/$slug': typeof PostsSlugRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/posts/$slug': typeof PostsSlugRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/posts/$slug'
  fileRoutesByTo: FileRoutesByTo
  to: '/posts/$slug'
  id: '__root__' | '/posts/$slug'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  PostsSlugRoute: typeof PostsSlugRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/posts/$slug': {
      id: '/posts/$slug'
      path: '/posts/$slug'
      fullPath: '/posts/$slug'
      preLoaderRoute: typeof PostsSlugRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  PostsSlugRoute: PostsSlugRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
