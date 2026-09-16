/// <reference types="vite/client" />
declare module "*.wgsl" {
  const shader: string;
  export default shader;
}
declare module "*?raw" {
  const content: string;
  export default content;
}
