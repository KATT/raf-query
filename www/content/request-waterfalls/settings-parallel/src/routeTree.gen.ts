/* eslint-disable */
// @ts-nocheck

import { Route as rootRouteImport } from './routes/__root'
import { Route as SettingsRouteImport } from './routes/settings'

const SettingsRoute = SettingsRouteImport.update({
  id: '/settings',
  path: '/settings',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/settings': typeof SettingsRoute
}
export interface FileRoutesByTo {
  '/settings': typeof SettingsRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/settings': typeof SettingsRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/settings'
  fileRoutesByTo: FileRoutesByTo
  to: '/settings'
  id: '__root__' | '/settings'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  SettingsRoute: typeof SettingsRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/settings': {
      id: '/settings'
      path: '/settings'
      fullPath: '/settings'
      preLoaderRoute: typeof SettingsRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  SettingsRoute: SettingsRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
