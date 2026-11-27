/** 打印配置控制器：打印机、模板、日志与重打。 */
import type { PrintLogQuery, PrinterSaveInput } from '@dinebox/types';

import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { ipOf, operatorOf } from '../helpers.js';
import {
  deletePrintLog,
  deletePrinter,
  getPrintLog,
  getTemplates,
  listPrintLogs,
  listPrinters,
  reprintOrder,
  resetTemplate,
  retryPrintLog,
  savePrinter,
  saveTemplate,
  testPrinter,
} from '../../services/admin/print.service.js';

export async function printers(c: AppContext) {
  return success(c, await listPrinters());
}

export async function createPrinter(c: AppContext, input: PrinterSaveInput) {
  const user = operatorOf(c);
  return success(c, await savePrinter(input, user, ipOf(c)), '打印机已保存', 201);
}

export async function updatePrinter(c: AppContext, id: number, input: PrinterSaveInput) {
  const user = operatorOf(c);
  return success(c, await savePrinter({ ...input, id }, user, ipOf(c)), '打印机已保存');
}

export async function removePrinter(c: AppContext, id: number) {
  const user = operatorOf(c);
  await deletePrinter(id, user, ipOf(c));
  return success(c, null, '打印机已删除');
}

export async function test(c: AppContext, id: number) {
  const user = operatorOf(c);
  return success(c, await testPrinter(id, user, ipOf(c)));
}

export async function templates(c: AppContext) {
  return success(c, await getTemplates());
}

export async function saveTemplateHandler(
  c: AppContext,
  type: 'KITCHEN' | 'BILL',
  input: { content: string },
) {
  const user = operatorOf(c);
  await saveTemplate(type, input.content, user, ipOf(c));
  return success(c, null, '模板已保存，下次打印生效');
}

export async function resetTemplateHandler(c: AppContext, type: 'KITCHEN' | 'BILL') {
  const user = operatorOf(c);
  await resetTemplate(type, user, ipOf(c));
  return success(c, null, '已恢复默认模板');
}

export async function logs(c: AppContext, query: PrintLogQuery) {
  return success(c, await listPrintLogs(query));
}

export async function logDetail(c: AppContext, id: number) {
  const row = await getPrintLog(id);
  return success(c, row);
}

export async function retryLog(c: AppContext, id: number) {
  const user = operatorOf(c);
  return success(c, await retryPrintLog(id, user, ipOf(c)));
}

export async function removeLog(c: AppContext, id: number) {
  const user = operatorOf(c);
  await deletePrintLog(id, user, ipOf(c));
  return success(c, null, '日志已删除');
}

export async function reprint(
  c: AppContext,
  input: { orderId: number; docType: 'KITCHEN' | 'BILL' },
) {
  const user = operatorOf(c);
  return success(c, await reprintOrder(input.orderId, input.docType, user, ipOf(c)), '已重新下发');
}
