/** 报表控制器。 */
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { getReport } from '../../services/admin/report.service.js';

export async function report(
  c: AppContext,
  range: 'today' | '7d',
  trendRange: 7 | 30,
) {
  return success(c, await getReport(range, trendRange));
}
