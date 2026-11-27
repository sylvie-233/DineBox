/**
 * @dinebox/print 公共入口：
 * - `renderTemplate` / `buildItemLines`：把订单快照渲染为等宽小票文本；
 * - `printText`：交给 node-thermal-printer 生成 ESC/POS 指令并通过 TCP 9100 发送；
 * - `checkPrinter`：测试打印机连通性。
 */
export * from './types.js';
export {
  buildItemLines,
  displayWidth,
  money,
  renderTemplate,
  renderTestPage,
} from './escpos.js';
export { checkPrinter, printText } from './tcp.js';
