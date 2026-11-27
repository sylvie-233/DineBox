/**
 * `@dinebox/ui` 构建配置：根入口为无样式工具，`admin` 入口为后台视觉组件。
 * React / lucide-react 由宿主提供单实例，避免多份 React 导致 Hook 失效。
 */
import { defineConfig } from 'tsup';

const external = ['react', 'react-dom', 'react-dom/client', 'lucide-react'];

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'es2022',
    external,
  },
  {
    entry: { admin: 'src/admin/index.ts' },
    format: ['esm'],
    dts: true,
    target: 'es2022',
    external,
  },
]);
