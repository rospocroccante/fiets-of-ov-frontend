import "react";

// React 18's JSX types predate the `inert` attribute (it landed in React 19's typings).
// The runtime already forwards it correctly as long as the value is a string, so this
// only teaches TypeScript about the one form the app uses: inert="" for "this subtree is
// off", the attribute absent for "this subtree is live". See inertUnless in App.tsx.
declare module "react" {
  interface HTMLAttributes<T> {
    inert?: "";
  }
}
