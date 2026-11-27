/** 后台路由汇总：认证子路由独立，其余路由各自声明鉴权与菜单权限。 */
import { createApiRouter } from '../../openapi/router.js';
import adminAuthRoutes from './auth.js';
import adminAuditRoutes from './audit.js';
import adminCashierRoutes from './cashier.js';
import adminCatalogRoutes from './catalog.js';
import adminOrderRoutes from './orders.js';
import adminPrintRoutes from './printers.js';
import adminReportRoutes from './reports.js';
import adminSettingsRoutes from './settings.js';
import adminTableRoutes from './tables.js';
import adminUploadRoutes from './upload.js';

const router = createApiRouter();

router.route('/auth', adminAuthRoutes);
router.route('/cashier', adminCashierRoutes);
router.route('/catalog', adminCatalogRoutes);
router.route('/tables', adminTableRoutes);
router.route('/printers', adminPrintRoutes);
router.route('/orders', adminOrderRoutes);
router.route('/reports', adminReportRoutes);
router.route('/audit', adminAuditRoutes);
router.route('/settings', adminSettingsRoutes);
router.route('/upload', adminUploadRoutes);

export default router;
